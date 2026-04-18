import crypto from "crypto";

/**
 * Verifies a TikTok Shop webhook HMAC-SHA256 signature.
 *
 * Confirmed format (from production log 2026-04-18):
 *   input  = app_key + raw_body   (concatenated, no separator)
 *   sign   = HMAC-SHA256(input, app_secret).toHex()
 *   header = x-tt-signature (raw hex, no "sha256=" prefix)
 *
 * Note: TikTok also sends the same value in the Authorization header.
 *
 * @see https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
 */
export function verifyTikTokWebhookSignature(
  rawBody:           string,
  receivedSignature: string,
  appKey:            string,
  appSecret:         string
): boolean {
  if (!receivedSignature || receivedSignature.length < 10) return false;

  // Strip sha256= prefix if present (defensive — production sends raw hex)
  const received = receivedSignature.replace(/^sha256=/, "").toLowerCase();

  const computed = crypto
    .createHmac("sha256", appSecret)
    .update(appKey + rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(received,  "hex")
    );
  } catch {
    // Buffer length mismatch → definitely wrong
    return false;
  }
}

/**
 * Normalizes a raw TikTok ORDER_STATUS_CHANGE webhook payload
 * into our internal order structure for DB upsert.
 */
export function normalizeTikTokOrder(payload: TikTokWebhookPayload): NormalizedOrder {
  const data = payload.data as TikTokOrderData;
  return {
    platform:          "tiktok",
    platform_order_id: data.order_id,
    buyer_id:          data.buyer_uid      ?? null,
    buyer_name:        data.buyer_username  ?? null,
    buyer_phone:       null,
    raw_payload:       payload as unknown as Record<string, unknown>,
    status:            mapTikTokStatus(data.order_status),
    shadow_mode:       true,
  };
}

function mapTikTokStatus(ttsStatus: string): DatabaseOrderStatus {
  const map: Record<string, DatabaseOrderStatus> = {
    UNPAID:               "pending_spec",
    ON_HOLD:              "pending_spec",
    AWAITING_SHIPMENT:    "spec_collected",
    AWAITING_COLLECTION:  "spec_collected",
    IN_TRANSIT:           "shipped",
    DELIVERED:            "shipped",
    COMPLETED:            "shipped",
    CANCELLED:            "cancelled",
  };
  return map[ttsStatus] ?? "pending_spec";
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TikTokWebhookPayload {
  type:      number;
  shop_id:   string;
  timestamp: number;
  data:      TikTokOrderData | Record<string, unknown>;
}

export interface TikTokOrderData {
  order_id:        string;
  order_status:    string;
  buyer_uid?:      string;
  buyer_username?: string;
  update_time?:    number;
}

type DatabaseOrderStatus =
  | "pending_spec"
  | "spec_collected"
  | "in_production"
  | "qc_upload"
  | "shipped"
  | "cancelled";

interface NormalizedOrder {
  platform:          "tiktok";
  platform_order_id: string;
  buyer_id:          string | null;
  buyer_name:        string | null;
  buyer_phone:       string | null;
  raw_payload:       Record<string, unknown>;
  status:            DatabaseOrderStatus;
  shadow_mode:       boolean;
}
