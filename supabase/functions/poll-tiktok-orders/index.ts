import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * poll-tiktok-orders — Edge Function (webhook fallback)
 *
 * Called by pg_cron every 15 minutes. Fetches orders updated in the last
 * 15-minute window from TikTok Shop API 202309 and upserts them into
 * public.orders, respecting shadow_mode.
 *
 * Auth: verify_jwt=false — secured via x-internal-secret header.
 *
 * 202309 API notes:
 *   - Uses POST /order/202309/orders/search
 *   - shop_cipher (not shop_id) goes in the QUERY STRING
 *   - All search filters go in the JSON body
 *   - Body is NOT included in the HMAC signature
 *   - access_token pulled from shop_tokens table (not a static env var)
 *
 * @see https://partner.tiktokshop.com/docv2/page/get-order-list-202309
 */

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TTS_APP_KEY          = Deno.env.get("TTS_APP_KEY")!;
const TTS_APP_SECRET       = Deno.env.get("TTS_APP_SECRET")!;
const INTERNAL_SECRET      = Deno.env.get("POLL_INTERNAL_SECRET") ?? "";

const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";

const STATUS_MAP: Record<string, string> = {
  UNPAID:               "pending_spec",
  ON_HOLD:              "pending_spec",
  AWAITING_SHIPMENT:    "spec_collected",
  AWAITING_COLLECTION:  "spec_collected",
  IN_TRANSIT:           "shipped",
  DELIVERED:            "shipped",
  COMPLETED:            "shipped",
  CANCELLED:            "cancelled",
  PARTIALLY_CANCELLED:  "cancelled",
};

/**
 * TikTok 202309 signing.
 * wrap = appSecret + path + sorted_query_params + appSecret
 * Body is NOT included in the signature for POST endpoints.
 *
 * @see https://partner.tiktokshop.com/docv2/page/650a56d4defece02be6dce41
 */
async function generateSign(
  path:      string,
  params:    Record<string, string>,
): Promise<string> {
  const excluded = new Set(["sign", "access_token"]);
  const sorted = Object.entries(params)
    .filter(([k]) => !excluded.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join("");

  const input = `${TTS_APP_SECRET}${path}${sorted}${TTS_APP_SECRET}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TTS_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildSignedUrl(
  path:        string,
  queryParams: Record<string, string>,
): Promise<string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const allParams: Record<string, string> = { ...queryParams, app_key: TTS_APP_KEY, timestamp };
  allParams.sign = await generateSign(path, allParams);

  const qs = new URLSearchParams(allParams).toString();
  return `${TIKTOK_API_BASE}${path}?${qs}`;
}

Deno.serve(async (req: Request) => {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET && secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Load token + shop_cipher from DB ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow, error: tokenErr } = await (supabase as any)
    .from("shop_tokens")
    .select("shop_id, shop_cipher, access_token, access_expires_at")
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    console.warn("[poll] No shop_tokens row — skipping");
    return new Response(
      JSON.stringify({ skipped: true, reason: "no_token" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!tokenRow.shop_cipher) {
    console.warn("[poll] shop_cipher not in DB — skipping (will populate on next webhook)");
    return new Response(
      JSON.stringify({ skipped: true, reason: "no_shop_cipher" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (new Date(tokenRow.access_expires_at) < new Date()) {
    console.warn("[poll] access_token expired — skipping");
    return new Response(
      JSON.stringify({ skipped: true, reason: "token_expired" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Shadow mode flag ─────────────────────────────────────────────────────────
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();
  const shadowMode: boolean = flag?.enabled ?? true;

  // ── Fetch orders updated in last 15 min ─────────────────────────────────────
  const now              = Math.floor(Date.now() / 1000);
  const fifteenMinAgo    = now - 15 * 60;

  // shop_cipher is a QUERY PARAM for 202309, not a body field
  const url = await buildSignedUrl("/order/202309/orders/search", {
    shop_cipher: tokenRow.shop_cipher,
  });

  const body = JSON.stringify({
    update_time_from: fifteenMinAgo,
    update_time_to:   now,
    page_size:        50,
    sort_field:       "UPDATE_TIME",
    sort_order:       "DESC",
  });

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-tts-access-token": tokenRow.access_token,
    },
    body,
  });

  const raw = await res.text();
  console.log(`[poll] POST /order/202309/orders/search HTTP ${res.status}:`, raw.slice(0, 400));

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `TikTok HTTP ${res.status}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const json = JSON.parse(raw) as {
    code: number;
    message: string;
    data?: { orders?: Array<{ id: string; status: string; user_id?: string }> };
  };

  if (json.code !== 0 || !json.data?.orders?.length) {
    console.log(`[poll] No orders in window (code=${json.code})`);
    return new Response(
      JSON.stringify({ ok: true, ingested: 0, shadow_mode: shadowMode }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Upsert minimal rows (enrichment happens via webhook or manual sync) ──────
  const rows = json.data.orders.map((order) => ({
    platform:          "tiktok",
    platform_order_id: order.id,
    buyer_id:          order.user_id ?? null,   // 202309 uses user_id, not buyer_uid
    raw_payload:       order as unknown as Record<string, unknown>,
    status:            STATUS_MAP[order.status] ?? "pending_spec",
    shadow_mode:       shadowMode,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertErr } = await (supabase as any)
    .from("orders")
    .upsert(rows, { onConflict: "platform,platform_order_id", ignoreDuplicates: false });

  if (upsertErr) {
    console.error("[poll] Upsert failed:", upsertErr.message);
    return new Response(
      JSON.stringify({ error: upsertErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[poll] ✅ Upserted ${rows.length} orders shadow=${shadowMode}`);

  return new Response(
    JSON.stringify({ ok: true, ingested: rows.length, shadow_mode: shadowMode }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
