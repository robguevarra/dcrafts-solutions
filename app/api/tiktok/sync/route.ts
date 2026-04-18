import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { getOrderList } from "@/lib/tiktok/api-client";
import { ingestOrder, mapTikTokStatus, resolveShopCipher } from "@/lib/tiktok/order-ingest";

/**
 * POST /api/tiktok/sync
 *
 * Manually pulls recent orders from TikTok Shop and upserts them.
 * Uses the access_token stored in shop_tokens (from OAuth).
 *
 * Calls POST /order/202309/orders/search (versioned TikTok API, per ORD-SYNC-IMPORT spec).
 * For each order, fires GET Order Detail enrichment asynchronously.
 *
 * Query params:
 *   ?days=3   — how far back to look (default: 3, max: 7)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth check ────────────────────────────────────────────────────────────
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days  = Math.min(Number(req.nextUrl.searchParams.get("days") ?? "7"), 7);
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000); // epoch seconds

  const supabase = createServiceClient();

  // ── Load access token ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow, error: tokenErr } = await (supabase as any)
    .from("shop_tokens")
    .select("access_token, access_expires_at")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return NextResponse.json(
      { error: "No TikTok token found. Authorize via Settings → Integrations first." },
      { status: 400 }
    );
  }

  if (new Date(tokenRow.access_expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Access token expired. Re-authorize via Settings → Integrations." },
      { status: 400 }
    );
  }

  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";

  if (!appKey || !appSecret) {
    return NextResponse.json({ error: "TTS_APP_KEY / TTS_APP_SECRET not configured" }, { status: 500 });
  }

  // ── Shadow mode flag ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flag } = await (supabase as any)
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();
  const shadowMode: boolean = flag?.enabled ?? true;

  // ── Resolve shop_cipher via /authorization/202309/shops ──────────────────
  const shopCipher = await resolveShopCipher(
    tokenRow.access_token, appKey, appSecret, supabase
  );
  if (!shopCipher) {
    return NextResponse.json({ error: "Could not resolve shop_cipher from TikTok" }, { status: 500 });
  }

  let pageToken: string | undefined;
  let ingested = 0;
  let pages    = 0;

  do {
    const res = await getOrderList({
      createTimeGe:   since,
      pageSize:        100,  // SDK max
      pageToken,
      sortField:       "create_time",
      sortOrder:       "DESC",
      shopCipher,
      accessToken:     tokenRow.access_token,
      appKey,
      appSecret,
    });

    if (res.code !== 0 || !res.data?.orders) {
      return NextResponse.json(
        { error: `TikTok API error: ${res.message} (code ${res.code})`, ingested },
        { status: 502 }
      );
    }

    const orders = res.data.orders;
    console.log(`[sync/tiktok] Page ${pages + 1}: ${orders.length} orders`);

    await Promise.all(
      orders.map((order) =>
        ingestOrder(
          {
            platform_order_id: order.id,
            raw_payload:       order as unknown as Record<string, unknown>,
            status:            mapTikTokStatus(order.status),
            shadow_mode:       shadowMode,
            tiktok_created_at: order.create_time
              ? new Date(order.create_time * 1000).toISOString()
              : null,
            tiktok_updated_at: order.update_time
              ? new Date(order.update_time * 1000).toISOString()
              : null,
          },
          tokenRow.access_token,
          supabase
        ).then(() => ingested++)
      )
    );

    pageToken = res.data.next_page_token ?? undefined;
    pages++;

    // Safety cap: 50 pages (5,000 orders per run)
    if (pages >= 50) break;
  } while (pageToken);

  console.log(`[sync/tiktok] ✅ Done — ${ingested} orders across ${pages} page(s)`);

  // ── Backfill: re-enrich orders that were ingested via webhook (no detail yet) ──
  // These are orders with NULL detail_fetched_at from before the sync was working.
  const { data: staleOrders } = await (supabase as any)
    .from("orders")
    .select("platform_order_id")
    .eq("platform", "tiktok")
    .is("detail_fetched_at", null)
    .limit(50);  // Backfill up to 50 stale orders per run

  if (staleOrders?.length) {
    console.log(`[sync/tiktok] Backfilling detail for ${staleOrders.length} stale orders...`);
    await Promise.allSettled(
      (staleOrders as { platform_order_id: string }[]).map((row) =>
        ingestOrder(
          {
            platform_order_id: row.platform_order_id,
            raw_payload:       {},
            status:            "pending_spec",
            shadow_mode:       shadowMode,
          },
          tokenRow.access_token,
          supabase
        )
      )
    );
    console.log(`[sync/tiktok] Backfill complete.`);
  }

  return NextResponse.json({
    ok:          true,
    ingested,
    pages,
    days,
    shadow_mode: shadowMode,
  });
}
