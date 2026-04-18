import { SupabaseClient } from "@supabase/supabase-js";
import { getOrderDetail, getAuthorizedShops, type TikTokOrderDetail } from "./api-client";

/**
 * order-ingest.ts — Shared order enrichment + upsert logic.
 *
 * Flow for every TikTok order we receive (via webhook or manual sync):
 *   1. Upsert minimal order row from webhook/list payload (fast, immediate)
 *   2. Call GET Order Detail to enrich with address, items, phone
 *
 * shop_cipher lifecycle:
 *   - Fetched from GET /authorization/202309/shops (not from OAuth callback)
 *   - Stored in shop_tokens.shop_cipher for reuse
 *   - Fetched fresh if DB value is empty
 */

// ─── Credentials helper ───────────────────────────────────────────────────────

function getApiCreds() {
  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";
  return { appKey, appSecret };
}

/**
 * Resolves the shop_cipher needed for 202309 API calls.
 * Reads from DB first; calls GET /authorization/202309/shops if missing
 * and writes the cipher back to DB for future requests.
 */
export async function resolveShopCipher(
  accessToken: string,
  appKey:      string,
  appSecret:   string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:    SupabaseClient<any>
): Promise<string> {
  // 1. Check DB cache first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from("shop_tokens")
    .select("shop_cipher, access_token")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (row?.shop_cipher) return row.shop_cipher as string;

  // 2. Fetch from TikTok shops API
  console.log("[order-ingest] shop_cipher not cached — calling /authorization/202309/shops");
  const res = await getAuthorizedShops(accessToken, appKey, appSecret);

  if (res.code !== 0 || !res.data?.shops?.length) {
    console.error("[order-ingest] getAuthorizedShops failed:", res.code, res.message);
    return "";
  }

  const cipher = res.data.shops[0].cipher;
  const shopId = res.data.shops[0].id;

  // 3. Write back to DB so we don't re-fetch next time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("shop_tokens")
    .update({ shop_cipher: cipher, shop_id: shopId, updated_at: new Date().toISOString() })
    .eq("access_token", accessToken);

  console.log(`[order-ingest] shop_cipher cached: ${cipher.slice(0, 20)}... (shop ${shopId})`);
  return cipher;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapTikTokStatus(rawStatus: string): DbOrderStatus {
  const map: Record<string, DbOrderStatus> = {
    UNPAID:              "pending_spec",
    ON_HOLD:             "pending_spec",
    AWAITING_SHIPMENT:   "spec_collected",
    AWAITING_COLLECTION: "spec_collected",
    IN_TRANSIT:          "shipped",
    DELIVERED:           "shipped",
    COMPLETED:           "shipped",
    CANCELLED:           "cancelled",
    PARTIALLY_CANCELLED: "cancelled",
  };
  return map[rawStatus] ?? "pending_spec";
}

// ─── Step 1: Upsert minimal order ─────────────────────────────────────────────

export interface MinimalOrder {
  platform_order_id: string;
  buyer_id?:         string | null;
  buyer_name?:       string | null;
  raw_payload:       Record<string, unknown>;
  status:            DbOrderStatus;
  shadow_mode:       boolean;
  tiktok_created_at?: string | null;
  tiktok_updated_at?: string | null;
}

export async function upsertMinimalOrder(
  order:     MinimalOrder,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  SupabaseClient<any>
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("orders")
    .upsert(
      {
        platform:          "tiktok",
        platform_order_id: order.platform_order_id,
        buyer_id:          order.buyer_id   ?? null,
        buyer_name:        order.buyer_name ?? null,
        raw_payload:       order.raw_payload,
        status:            order.status,
        shadow_mode:       order.shadow_mode,
        tiktok_created_at: order.tiktok_created_at ?? null,
        tiktok_updated_at: order.tiktok_updated_at ?? null,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: "platform,platform_order_id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) {
    console.error(`[order-ingest] Minimal upsert failed for ${order.platform_order_id}:`, error.message);
    return null;
  }

  return (data as { id: string }).id;
}

// ─── Step 2: Fetch Order Detail and enrich ────────────────────────────────────

export async function enrichOrderDetail(
  orderId:     string,   // TikTok order ID (platform_order_id)
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:    SupabaseClient<any>
): Promise<void> {
  const { appKey, appSecret } = getApiCreds();

  if (!appKey || !appSecret) {
    console.error("[order-ingest] TTS credentials not set — skipping detail fetch");
    return;
  }

  // Resolve shop_cipher — fetch from /authorization/202309/shops if not cached in DB
  const shopCipher = await resolveShopCipher(accessToken, appKey, appSecret, supabase);
  if (!shopCipher) {
    console.error("[order-ingest] Could not resolve shop_cipher — skipping Order Detail");
    return;
  }

  try {
    const res = await getOrderDetail(orderId, shopCipher, accessToken, appKey, appSecret);

    if (res.code !== 0 || !res.data?.orders?.length) {
      console.warn(`[order-ingest] Order Detail failed for ${orderId}: code=${res.code} msg=${res.message}`);
      return;
    }

    const detail: TikTokOrderDetail = res.data.orders[0];
    const addr = detail.recipient_address;

    // 202507: prefer address_detail (barangay/district); fallback to full_address or manual concat
    const fullAddress = addr?.full_address
      ?? (addr
        ? [
            addr.name,
            addr.address_detail,
            addr.address_line1,
            addr.address_line2,
            addr.postal_code,
            addr.region_code,
          ].filter(Boolean).join(", ")
        : null);

    // Prefer split name fields (202507); fallback to combined name
    const recipientName = addr?.name
      ?? (addr?.first_name || addr?.last_name
        ? [addr.first_name, addr.last_name].filter(Boolean).join(" ")
        : null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("orders")
      .update({
        buyer_id:          detail.user_id           ?? null,
        buyer_phone:       addr?.phone_number        ?? null,
        recipient_name:    recipientName,
        recipient_phone:   addr?.phone_number        ?? null,
        recipient_address: fullAddress,
        items_json:        detail.line_items          ?? [],
        total_amount:      detail.payment?.total_amount ?? null,
        currency:          detail.payment?.currency     ?? null,
        fulfillment_type:  detail.fulfillment_type      ?? null,
        tiktok_created_at: detail.create_time ? new Date(detail.create_time * 1000).toISOString() : null,
        tiktok_updated_at: detail.update_time ? new Date(detail.update_time * 1000).toISOString() : null,
        detail_fetched_at: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
        status:            mapTikTokStatus(detail.status),
      })
      .eq("platform", "tiktok")
      .eq("platform_order_id", orderId);

    if (error) {
      console.error(`[order-ingest] Enrich update failed for ${orderId}:`, error.message);
      return;
    }

    // Log shipping_type so admins know why phone may be masked
    const maskedNote = detail.shipping_type === "TIKTOK"
      ? " (PII masked — TikTok platform logistics)"
      : "";
    console.log(
      `[order-ingest] ✅ Enriched ${orderId} [${detail.shipping_type ?? "?"}]${maskedNote}` +
      ` — ${recipientName ?? "?"} / ${addr?.phone_number ?? "no phone"} / ${(detail.line_items ?? []).length} items`
    );
  } catch (err) {
    console.error(`[order-ingest] enrichOrderDetail threw for ${orderId}:`, err);
  }
}

// ─── Combined: upsert + async enrich ─────────────────────────────────────────

/**
 * Primary entry point for order ingestion.
 * Upserts minimal data synchronously (fast), then enriches async (non-blocking).
 */
export async function ingestOrder(
  order: MinimalOrder & { platform_order_id: string },
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  const rowId = await upsertMinimalOrder(order, supabase);

  if (rowId) {
    // Await enrichment — callers run inside after() so latency is fine.
    // Awaiting gives us complete logs and ensures detail is written before function exits.
    await enrichOrderDetail(order.platform_order_id, accessToken, supabase);
  }
}

// ─── Reverse event handler (type 2 — cancellations, returns) ─────────────────

export interface ReverseEvent {
  order_id:             string;
  reverse_order_id?:    string;
  reverse_order_status: number;
  reverse_event_type:   string;
  reverse_type:         number;  // 1=cancel, 4=return
  update_time:          number;
}

/**
 * Updates an order's reverse_status when a type-2 webhook arrives.
 * Maps the reversal onto our status field if it's a confirmed cancellation.
 */
export async function handleReverseEvent(
  event:    ReverseEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  // reverse_order_status: 1=pending, 2=approved, 3=rejected, 4=completed
  // reverse_type: 1=cancel, 4=return
  const isApproved  = event.reverse_order_status === 2 || event.reverse_order_status === 4;
  const isCancel    = event.reverse_type === 1;

  const updates: Record<string, unknown> = {
    reverse_status: `${event.reverse_event_type}:status=${event.reverse_order_status}`,
    tiktok_updated_at: new Date(event.update_time * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Only flip order to cancelled if it's a confirmed completed cancellation
  if (isCancel && isApproved) {
    updates.status = "cancelled";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("orders")
    .update(updates)
    .eq("platform", "tiktok")
    .eq("platform_order_id", event.order_id);

  if (error) {
    console.error(`[order-ingest] Reverse event update failed for ${event.order_id}:`, error.message);
  } else {
    console.log(`[order-ingest] Reverse event recorded: ${event.order_id} → ${event.reverse_event_type} status=${event.reverse_order_status}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DbOrderStatus =
  | "pending_spec"
  | "spec_collected"
  | "in_production"
  | "qc_upload"
  | "shipped"
  | "cancelled";
