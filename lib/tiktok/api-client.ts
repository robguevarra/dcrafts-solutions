import crypto from "crypto";

/**
 * TikTok Shop Open API — Signed REST client.
 *
 * Uses versioned endpoints (202309) per TikTok certification requirements.
 *
 * Signing algorithm:
 *   1. Take all query params, exclude `sign` and `access_token`
 *   2. Sort alphabetically, concatenate as key+value (no separator)
 *   3. base   = path + sorted_params + body (JSON, if POST)
 *   4. wrap   = app_secret + base + app_secret
 *   5. sign   = HMAC-SHA256(wrap, app_secret).toHex()
 *
 * @see https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
 */

const BASE_URL      = "https://open-api.tiktokglobalshop.com";
const EXCLUDED_SIGN = new Set(["sign", "access_token"]);

export interface TikTokApiResponse<T = unknown> {
  code:        number;
  message:     string;
  request_id?: string;
  data?:       T;
}

// ─── Signing ──────────────────────────────────────────────────────────────────

function generateSign(
  path:      string,
  params:    Record<string, string>,
  body:      string,
  appSecret: string
): string {
  const sorted = Object.entries(params)
    .filter(([k]) => !EXCLUDED_SIGN.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join("");

  const wrapped = `${appSecret}${path}${sorted}${body}${appSecret}`;
  return crypto.createHmac("sha256", appSecret).update(wrapped).digest("hex");
}

async function ttsGet<T>(
  path:        string,
  queryParams: Record<string, string>,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<T>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const allParams: Record<string, string> = { ...queryParams, app_key: appKey, timestamp };
  allParams.sign  = generateSign(path, allParams, "", appSecret);

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method:  "GET",
    headers: { "x-tts-access-token": accessToken, "Content-Type": "application/json" },
  });
  const raw = await res.text();
  console.log(`[tts-api] GET ${path} HTTP ${res.status}:`, raw.slice(0, 500));
  return JSON.parse(raw) as TikTokApiResponse<T>;
}

async function ttsPost<T>(
  path:        string,
  queryParams: Record<string, string>,
  body:        Record<string, unknown>,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<T>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const allParams: Record<string, string> = { ...queryParams, app_key: appKey, timestamp };
  const bodyStr   = JSON.stringify(body);
  allParams.sign  = generateSign(path, allParams, bodyStr, appSecret);

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method:  "POST",
    headers: { "x-tts-access-token": accessToken, "Content-Type": "application/json" },
    body:    bodyStr,
  });
  const raw = await res.text();
  console.log(`[tts-api] POST ${path} body sent:`, bodyStr);
  console.log(`[tts-api] POST ${path} HTTP ${res.status}:`, raw.slice(0, 500));
  return JSON.parse(raw) as TikTokApiResponse<T>;
}

// ─── Domain Methods ───────────────────────────────────────────────────────────

/**
 * GET Authorized Shops (API version 202309).
 *
 * Retrieves the seller's authorized shops including the shop_cipher token
 * required by all 202309 order APIs. Call this to get a valid shop_cipher.
 * The cipher is stable (does not expire like access_token) but must be
 * fetched at least once after authorization via the OAuth callback.
 *
 * @see https://partner.tiktokshop.com/docv2/page/authorization-202309
 */
export async function getAuthorizedShops(
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<{ shops: TikTokShop[] }>> {
  return ttsGet<{ shops: TikTokShop[] }>(
    "/authorization/202309/shops",
    {},
    accessToken,
    appKey,
    appSecret
  );
}

export interface TikTokShop {
  id:           string;   // numeric shop ID (e.g. "7494826521029151329")
  cipher:       string;   // shop_cipher needed for all order API calls
  name:         string;
  region:       string;
  seller_type?: string;
}

/**
 * GET Order Detail (API version 202309).
 *
 * Endpoint: GET /order/202309/orders
 * Required params: ids (comma-sep order IDs, max 50), shop_cipher
 * shop_cipher must come from getAuthorizedShops(), NOT from the OAuth callback.
 *
 * @see https://partner.tiktokshop.com/docv2/page/get-order-detail-202309
 */
export async function getOrderDetail(
  orderId:     string,
  shopCipher:  string,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<{ orders: TikTokOrderDetail[] }>> {
  return ttsGet<{ orders: TikTokOrderDetail[] }>(
    "/order/202309/orders",
    { ids: orderId, shop_cipher: shopCipher },
    accessToken,
    appKey,
    appSecret
  );
}

/**
 * POST Get Order List (API version 202309).
 *
 * Endpoint: POST /order/202309/orders/search
 * Required body: create_time_from, shop_cipher
 *
 * @see https://partner.tiktokshop.com/docv2/page/get-order-list-202309
 */
export async function getOrderList(params: {
  createTimeFrom: number;    // epoch seconds
  createTimeTo?:  number;
  pageSize?:      number;
  pageToken?:     string;
  sortField?:     string;
  sortOrder?:     string;
  shopCipher:     string;
  accessToken:    string;
  appKey:         string;
  appSecret:      string;
}): Promise<TikTokApiResponse<OrderListData>> {
  // shop_cipher is a QUERY param for POST /order/202309/orders/search,
  // not a body field. Placing it in the body breaks the request signature.
  const body: Record<string, unknown> = {
    create_time_from: params.createTimeFrom,
    page_size:        params.pageSize   ?? 20,
    sort_field:       params.sortField  ?? "CREATE_TIME",
    sort_order:       params.sortOrder  ?? "DESC",
  };
  if (params.createTimeTo) body.create_time_to = params.createTimeTo;
  if (params.pageToken)    body.page_token     = params.pageToken;

  return ttsPost<OrderListData>(
    "/order/202309/orders/search",
    { shop_cipher: params.shopCipher },  // ← query param, not body
    body,
    params.accessToken,
    params.appKey,
    params.appSecret
  );
}

// ─── Response Type Definitions (202309) ──────────────────────────────────────

export interface TikTokOrderDetail {
  id:                string;
  status:            string;
  create_time:       number;
  update_time:       number;
  user_id?:          string;   // buyer identifier in 202309 (not buyer_uid)
  buyer_message?:    string;
  fulfillment_type?: string;   // "FULFILLED_BY_SELLER" | "FULFILLMENT_BY_TIKTOK"
  is_gift?:          boolean;
  is_sample_order?:  boolean;
  payment?: {
    currency?:     string;
    total_amount?: string;
    sub_total?:    string;
    shipping_fee?: string;
    seller_discount?: string;
    platform_discount?: string;
  };
  recipient_address?: {
    name?:         string;
    phone_number?: string;
    full_address?: string;
    address_line1?: string;
    address_line2?: string;
    city?:          string;
    state?:         string;
    country?:       string;
    postal_code?:   string;
    district_info_list?: Array<{ address_level_name: string; address_name: string }>;
  };
  line_items?: TikTokLineItem[];
  packages?:   TikTokPackage[];
}

export interface TikTokLineItem {
  id:              string;
  product_id?:     string;
  product_name?:   string;
  sku_id?:         string;
  sku_name?:       string;
  quantity?:       number;
  sale_price?:     string;
  currency?:       string;
  display_status?: string;
  is_gift?:        boolean;
}

export interface TikTokPackage {
  id:                 string;
  tracking_number?:   string;
  shipping_provider?: string;
  status?:            string;
}

interface OrderListData {
  orders?:          Array<{ id: string; status: string; create_time?: number; update_time?: number }>;
  next_page_token?: string;
  total_count?:     number;
}
