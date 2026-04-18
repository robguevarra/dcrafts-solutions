import crypto from "crypto";

/**
 * Verifies a TikTok Shop webhook HMAC-SHA256 signature.
 *
 * Per TikTok docs: signature = HMAC-SHA256(app_key + raw_body, app_secret)
 * The hash is compared against the `x-tts-signature` header.
 *
 * Important: the secret is TTS_APP_SECRET (same as the OAuth app secret),
 * NOT a separate webhook secret. The input is app_key concatenated with
 * the raw request body (no separator).
 *
 * @see https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
 */
export function verifyTikTokWebhookSignature(
  rawBody:           string,
  receivedSignature: string,
  appKey:            string,
  appSecret:         string
): boolean {
  // Signature base: app_key + raw_body (no separator, no encoding)
  const sigBase = appKey + rawBody;

  const computedSig = crypto
    .createHmac("sha256", appSecret)
    .update(sigBase)
    .digest("hex");

  const received = receivedSignature.replace(/^sha256=/, "");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSig, "hex"),
      Buffer.from(received,    "hex")
    );
  } catch {
    // Buffer lengths differ → signature is wrong
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
    buyer_phone:       null, // available only via GetOrderDetail API
    raw_payload:       payload as unknown as Record<string, unknown>,
    status:            mapTikTokStatus(data.order_status),
    shadow_mode:       true, // overwritten at ingestion time from feature_flags
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

// ─── Webhook Payload Types ─────────────────────────────────────────────────────

export interface TikTokWebhookPayload {
  type:      number;   // 1 = ORDER_STATUS_CHANGE, 2 = reverse events, etc.
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
