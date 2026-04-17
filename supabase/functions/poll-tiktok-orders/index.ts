import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { crypto } from "jsr:@std/crypto";

/**
 * poll-tiktok-orders — Edge Function (T1.7)
 *
 * Called by pg_cron every 15 minutes as a TikTok webhook fallback.
 * Fetches recent orders (last 15 min window) from TikTok Shop API
 * and upserts them into public.orders, respecting shadow_mode.
 *
 * Auth: verify_jwt=false — secured via x-internal-secret header.
 * The secret is stored in Supabase Vault / env vars and referenced
 * as app.poll_internal_secret in PostgreSQL settings.
 *
 * @see https://partner.tiktokshop.com/docv2/page/650a56d4defece02be6dce41
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TTS_APP_KEY = Deno.env.get("TTS_APP_KEY")!;
const TTS_APP_SECRET = Deno.env.get("TTS_APP_SECRET")!;
const INTERNAL_SECRET = Deno.env.get("POLL_INTERNAL_SECRET") ?? "";

const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";

// Status window to poll — active order lifecycle stages
const POLL_STATUSES = [
  "UNPAID",
  "ON_HOLD",
  "AWAITING_SHIPMENT",
  "AWAITING_COLLECTION",
];

const STATUS_MAP: Record<string, string> = {
  UNPAID: "pending_spec",
  ON_HOLD: "pending_spec",
  AWAITING_SHIPMENT: "spec_collected",
  AWAITING_COLLECTION: "spec_collected",
  IN_TRANSIT: "shipped",
  DELIVERED: "shipped",
  COMPLETED: "shipped",
  CANCELLED: "cancelled",
};

/**
 * Generates a TikTok Shop API v202309 HMAC-SHA256 signed URL.
 *
 * v202309 signing algorithm for POST requests:
 *   1. Collect URL query params (app_key, timestamp, shop_id)
 *   2. Sort all query params alphabetically
 *   3. Concatenate as: path + key1value1key2value2... + app_secret
 *   4. SHA256-HMAC sign with app_secret as the key
 *
 * Note: For POST endpoints, the body is NOT included in the signature.
 * Only query string params are signed. Body filters go in the JSON body.
 *
 * @see https://partner.tiktokshop.com/docv2/page/650a56d4defece02be6dce41
 */
async function buildSignedUrl(
  path: string,
  queryParams: Record<string, string | number>
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const allParams: Record<string, string> = {
    app_key: TTS_APP_KEY,
    timestamp: String(timestamp),
    ...Object.fromEntries(
      Object.entries(queryParams).map(([k, v]) => [k, String(v)])
    ),
  };

  // Sort keys, concatenate key+value pairs (no separators, no URL encoding)
  const sorted = Object.keys(allParams)
    .sort()
    .map((k) => `${k}${allParams[k]}`)
    .join("");

  const sigInput = `${path}${sorted}${TTS_APP_SECRET}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TTS_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sigInput)
  );
  const sign = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const qs = new URLSearchParams({ ...allParams, sign }).toString();
  return `${TIKTOK_API_BASE}${path}?${qs}`;
}

interface TikTokOrder {
  id: string;
  buyer_uid?: string;
  buyer_username?: string;
  status: string;
}

interface TikTokSearchResponse {
  code: number;
  data?: {
    orders?: TikTokOrder[];
  };
}

/**
 * Fetches one page of orders from TikTok API for a given status.
 *
 * v202309 key points:
 *  - shop_id goes in the QUERY STRING (gets signed)
 *  - order_status + time filters go in the POST BODY (not signed)
 *  - Time params use _ge (>=) and _lt (<), not _from/_to
 *  - 15-minute window aligns with cron interval
 */
async function fetchOrdersForStatus(
  shopId: string,
  status: string,
  shadowMode: boolean
): Promise<Record<string, unknown>[]> {
  const now = Math.floor(Date.now() / 1000);
  const fifteenMinutesAgo = now - 15 * 60;

  // Only shop_id in query string (gets signed); all filters in POST body
  const url = await buildSignedUrl("/order/202309/orders/search", {
    shop_id: shopId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tts-access-token": Deno.env.get("TIKTOK_ACCESS_TOKEN") ?? "",
    },
    // v202309: these params belong in the body, NOT the query string
    body: JSON.stringify({
      order_status: status,
      update_time_ge: fifteenMinutesAgo,  // was: update_time_from (wrong)
      update_time_lt: now,                 // was: update_time_to (wrong)
      page_size: 50,
    }),
  });

  if (!res.ok) {
    console.error(`[poll] TikTok API ${status} HTTP ${res.status}`);
    return [];
  }

  const json: TikTokSearchResponse = await res.json();

  if (json.code !== 0 || !json.data?.orders) {
    // code=40001 means no orders in window — normal, not an error
    if (json.code !== 40001) {
      console.warn(`[poll] TikTok code=${json.code} status=${status}`);
    }
    return [];
  }

  return json.data.orders.map((order) => ({
    platform: "tiktok",
    platform_order_id: order.id,
    buyer_id: order.buyer_uid ?? null,
    buyer_name: order.buyer_username ?? null,
    buyer_phone: null,
    raw_payload: order as unknown as Record<string, unknown>,
    status: STATUS_MAP[order.status] ?? "pending_spec",
    shadow_mode: shadowMode,
  }));
}

Deno.serve(async (req: Request) => {
  // Validate internal secret to prevent unauthorized cron triggers
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET && secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shopId = Deno.env.get("TIKTOK_SHOP_ID") ?? "";
  if (!shopId) {
    console.warn("[poll] TIKTOK_SHOP_ID not set — skipping poll");
    return new Response(
      JSON.stringify({ skipped: true, reason: "no_shop_id" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Check shadow_mode feature flag
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();
  const shadowMode: boolean = flag?.enabled ?? true;

  let total = 0;
  let errors = 0;

  for (const status of POLL_STATUSES) {
    const rows = await fetchOrdersForStatus(shopId, status, shadowMode);
    if (rows.length === 0) continue;

    const { error } = await supabase.from("orders").upsert(rows as Parameters<typeof supabase.from>[0][], {
      onConflict: "platform,platform_order_id",
      ignoreDuplicates: false, // update status if order already exists
    });

    if (error) {
      console.error(`[poll] Upsert failed status=${status}:`, error.message);
      errors++;
    } else {
      total += rows.length;
      console.log(
        `[poll] Upserted ${rows.length} orders status=${status} shadow=${shadowMode}`
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, ingested: total, errors, shadow_mode: shadowMode }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
