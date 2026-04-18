import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

/**
 * POST /api/tiktok/sync
 *
 * Manually pulls recent orders from TikTok Shop API and upserts them.
 * Uses the access_token stored in shop_tokens (from OAuth).
 *
 * Requires: authenticated admin session.
 * Calls: GET https://open-api.tiktokshop.com/api/v2/order/list/all
 *
 * Query params:
 *   ?days=3   — how many days back to sync (default: 3, max: 7)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth check ────────────────────────────────────────────────────────────
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days  = Math.min(Number(req.nextUrl.searchParams.get("days") ?? "3"), 7);
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000); // epoch seconds

  const supabase = createServiceClient();

  // ── Load access token ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow, error: tokenErr } = await (supabase as any)
    .from("shop_tokens")
    .select("access_token, access_expires_at, shop_id")
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

  const appKey = process.env.TTS_APP_KEY ?? "";
  if (!appKey) {
    return NextResponse.json({ error: "TTS_APP_KEY not set" }, { status: 500 });
  }

  // ── Pull orders from TikTok API ───────────────────────────────────────────
  // GET /api/v2/order/list/all — paged, 20 per page
  let pageToken: string | null = null;
  let ingested = 0;
  let pages    = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flag } = await (supabase as any)
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();

  const shadowMode = flag?.enabled ?? true;

  do {
    const url = new URL("https://open-api.tiktokshop.com/api/v2/order/list/all");
    url.searchParams.set("app_key",             appKey);
    url.searchParams.set("create_time_from",    String(since));
    url.searchParams.set("page_size",           "20");
    url.searchParams.set("sort_field",          "CREATE_TIME");
    url.searchParams.set("sort_order",          "DESC");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res  = await fetch(url.toString(), {
      headers: { "x-tts-access-token": tokenRow.access_token },
    });
    const json = await res.json() as {
      code:    number;
      message: string;
      data?: {
        orders?:     TikTokApiOrder[];
        next_page_token?: string;
        total_count?: number;
      };
    };

    console.log(`[sync/tiktok] Page ${pages + 1} — code=${json.code} orders=${json.data?.orders?.length ?? 0}`);

    if (json.code !== 0 || !json.data?.orders) {
      return NextResponse.json(
        { error: `TikTok API error: ${json.message} (code ${json.code})`, ingested },
        { status: 502 }
      );
    }

    for (const order of json.data.orders) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("orders")
        .upsert(
          {
            platform:          "tiktok",
            platform_order_id: order.id,
            buyer_id:          order.buyer_uid           ?? null,
            buyer_name:        order.buyer_username       ?? null,
            buyer_phone:       null,
            raw_payload:       order,
            status:            mapTikTokApiStatus(order.status),
            shadow_mode:       shadowMode,
          },
          { onConflict: "platform,platform_order_id", ignoreDuplicates: false }
        );

      if (error) {
        console.error("[sync/tiktok] Upsert failed:", error.message, order.id);
      } else {
        ingested++;
      }
    }

    pageToken = json.data.next_page_token ?? null;
    pages++;

    // Safety: max 10 pages (200 orders per sync run)
    if (pages >= 10) break;
  } while (pageToken);

  console.log(`[sync/tiktok] ✅ Sync complete — ${ingested} orders upserted across ${pages} page(s)`);

  return NextResponse.json({
    ok:      true,
    ingested,
    pages,
    days,
    shadow_mode: shadowMode,
  });
}

// ─── TikTok Order List API shape (simplified) ─────────────────────────────────

interface TikTokApiOrder {
  id:               string;
  status:           string;
  buyer_uid?:       string;
  buyer_username?:  string;
  create_time?:     number;
  update_time?:     number;
}

function mapTikTokApiStatus(status: string): string {
  const map: Record<string, string> = {
    UNPAID:               "pending_spec",
    ON_HOLD:              "pending_spec",
    AWAITING_SHIPMENT:    "spec_collected",
    AWAITING_COLLECTION:  "spec_collected",
    IN_TRANSIT:           "shipped",
    DELIVERED:            "shipped",
    COMPLETED:            "shipped",
    CANCELLED:            "cancelled",
  };
  return map[status] ?? "pending_spec";
}
