import crypto from "crypto";

/**
 * Verifies a TikTok Shop webhook HMAC-SHA256 signature.
 *
 * Why this exists: TikTok requires every webhook receiver to verify
 * the `x-tts-signature` header before trusting the payload.
 * Failure to verify makes us vulnerable to spoofed order events.
 *
 * @see https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
 */
export function verifyTikTokWebhookSignature(
  rawBody: string,
  receivedSignature: string,
  appSecret: string
): boolean {
  const computedSig = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSig, "hex"),
      Buffer.from(receivedSignature.replace("sha256=", ""), "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes a raw TikTok ORDER_STATUS_CHANGE webhook payload
 * into our internal order structure for upsert.
 */
export function normalizeTikTokOrder(payload: TikTokWebhookPayload): NormalizedOrder {
  const data = payload.data as TikTokOrderData;
  return {
    platform: "tiktok",
    platform_order_id: data.order_id,
    buyer_id: data.buyer_uid ?? null,
    buyer_name: data.buyer_username ?? null,
    buyer_phone: null, // available after GetOrderDetail API call
    raw_payload: payload as unknown as Record<string, unknown>,
    status: mapTikTokStatus(data.order_status),
    shadow_mode: true, // set per feature flag at ingestion time
  };
}

function mapTikTokStatus(ttsStatus: string): DatabaseOrderStatus {
  const map: Record<string, DatabaseOrderStatus> = {
    UNPAID: "pending_spec",
    ON_HOLD: "pending_spec",
    AWAITING_SHIPMENT: "spec_collected",
    AWAITING_COLLECTION: "spec_collected",
    IN_TRANSIT: "shipped",
    DELIVERED: "shipped",
    COMPLETED: "shipped",
    CANCELLED: "cancelled",
  };
  return map[ttsStatus] ?? "pending_spec";
}

// ─── Webhook Payload Types ────────────────────────────

export interface TikTokWebhookPayload {
  type: number;         // 1 = ORDER_STATUS_CHANGE
  shop_id: string;
  timestamp: number;
  data: TikTokOrderData;
}

export interface TikTokOrderData {
  order_id: string;
  order_status: string;
  buyer_uid?: string;
  buyer_username?: string;
  update_time?: number;
}

type DatabaseOrderStatus =
  | "pending_spec"
  | "spec_collected"
  | "in_production"
  | "qc_upload"
  | "shipped"
  | "cancelled";

interface NormalizedOrder {
  platform: "tiktok";
  platform_order_id: string;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  raw_payload: Record<string, unknown>;
  status: DatabaseOrderStatus;
  shadow_mode: boolean;
}
