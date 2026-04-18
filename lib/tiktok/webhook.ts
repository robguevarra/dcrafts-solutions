import crypto from "crypto";

/**
 * Verifies a TikTok Shop webhook HMAC-SHA256 signature.
 *
 * TikTok webhook verification candidates — we try multiple formats
 * because the official docs mix webhook verification with REST API signing:
 *
 *   Format A (most sources): HMAC-SHA256(rawBody, app_secret)
 *   Format B (some sources): HMAC-SHA256(app_key + rawBody, app_secret)
 *
 * @returns { matched: boolean, format: string | null }
 */
export function verifyTikTokWebhookSignature(
  rawBody:           string,
  receivedSignature: string,
  appKey:            string,
  appSecret:         string
): { matched: boolean; format: string | null } {
  const received = receivedSignature.replace(/^sha256=/, "");

  if (!received || received.length < 10) {
    return { matched: false, format: null };
  }

  const candidates: Array<{ format: string; input: string }> = [
    { format: "rawBody only",     input: rawBody },
    { format: "appKey + rawBody", input: appKey + rawBody },
    { format: "rawBody + appKey", input: rawBody + appKey },
  ];

  for (const { format, input } of candidates) {
    const computed = crypto
      .createHmac("sha256", appSecret)
      .update(input)
      .digest("hex");

    try {
      if (crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(received, "hex"))) {
        return { matched: true, format };
      }
    } catch {
      // Buffer length mismatch — not hex or wrong length
    }
  }

  return { matched: false, format: null };
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
