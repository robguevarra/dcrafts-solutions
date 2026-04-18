import { SupabaseClient } from "@supabase/supabase-js";
import { getOrderDetail, type TikTokOrderDetail } from "./api-client";

/**
 * order-ingest.ts — Shared order enrichment + upsert logic.
 *
 * Flow for every TikTok order we receive (via webhook or manual sync):
 *   1. Upsert minimal order row from webhook/list payload (fast, immediate)
 *   2. Fire-and-forget: call GET Order Detail to enrich with address, items, phone
 *
 * Why two steps?
 *   - Webhooks must respond in < 5s. Order Detail API can take 1-2s.
 *   - We never want a slow external call to block the webhook ack.
 *   - If Detail fails, we still have the minimal order row with its ID.
 */

// ─── Credentials helper ───────────────────────────────────────────────────────

function getApiCreds() {
  const appKey    = process.env.TTS_APP_KEY    ?? "";
  const appSecret = process.env.TTS_APP_SECRET ?? "";
  return { appKey, appSecret };
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

  try {
    const res = await getOrderDetail(orderId, accessToken, appKey, appSecret);

    if (res.code !== 0 || !res.data?.orders?.length) {
      console.warn(`[order-ingest] Order Detail failed for ${orderId}: code=${res.code} msg=${res.message}`);
      return;
    }

    const detail: TikTokOrderDetail = res.data.orders[0];
    const addr = detail.recipient_address;

    const fullAddress = addr
      ? [addr.name, addr.address_line1, addr.address_line2, addr.city, addr.state, addr.postal_code, addr.country]
          .filter(Boolean).join(", ")
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("orders")
      .update({
        buyer_phone:       addr?.phone_number ?? null,
        recipient_name:    addr?.name         ?? null,
        recipient_phone:   addr?.phone_number ?? null,
        recipient_address: fullAddress,
        items_json:        detail.line_items  ?? [],
        total_amount:      detail.payment_info?.total_amount ?? null,
        currency:          detail.payment_info?.currency     ?? null,
        fulfillment_type:  detail.fulfillment_type           ?? null,
        tiktok_created_at: detail.create_time ? new Date(detail.create_time * 1000).toISOString() : null,
        tiktok_updated_at: detail.update_time ? new Date(detail.update_time * 1000).toISOString() : null,
        detail_fetched_at: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
        // Update buyer_name from detail if we have it (webhook often has it sparse)
        buyer_name:        detail.buyer_username ?? null,
        status:            mapTikTokStatus(detail.status),
      })
      .eq("platform", "tiktok")
      .eq("platform_order_id", orderId);

    if (error) {
      console.error(`[order-ingest] Enrich update failed for ${orderId}:`, error.message);
      return;
    }

    console.log(
      `[order-ingest] ✅ Enriched ${orderId} — ${addr?.name ?? "?"} / ${addr?.phone_number ?? "no phone"} / ${(detail.line_items ?? []).length} items`
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
    // Fire-and-forget: enrich in background, don't await
    void enrichOrderDetail(order.platform_order_id, accessToken, supabase);
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
