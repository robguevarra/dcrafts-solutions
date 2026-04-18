import crypto from "crypto";

/**
 * TikTok Shop Open API v2 — Signed REST client.
 *
 * Signing algorithm (per TikTok docs):
 *   1. Collect all query params, exclude `sign` and `access_token`
 *   2. Sort by key alphabetically, concatenate as key+value (no separator)
 *   3. base_string = path + sorted_params_string + body (JSON, if POST)
 *   4. wrapped   = app_secret + base_string + app_secret
 *   5. sign      = HMAC-SHA256(wrapped, app_secret).toHex()
 *
 * @see https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
 */

const BASE_URL = "https://open-api.tiktokglobalshop.com";
const EXCLUDED_PARAMS = new Set(["sign", "access_token"]);

export interface TikTokApiResponse<T = unknown> {
  code:       number;
  message:    string;
  request_id?: string;
  data?:      T;
}

// ─── Signing ──────────────────────────────────────────────────────────────────

function generateSign(
  path:      string,
  params:    Record<string, string>,
  body:      string,
  appSecret: string
): string {
  // 1. Sort params, exclude sign + access_token
  const sorted = Object.entries(params)
    .filter(([k]) => !EXCLUDED_PARAMS.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join("");

  // 2. Construct wrapped string
  const wrapped = `${appSecret}${path}${sorted}${body}${appSecret}`;

  // 3. HMAC-SHA256
  return crypto.createHmac("sha256", appSecret).update(wrapped).digest("hex");
}

/**
 * Makes a signed GET request to the TikTok Shop Open API v2.
 */
export async function ttsGet<T>(
  path:        string,
  queryParams: Record<string, string>,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<T>> {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const allParams: Record<string, string> = {
    ...queryParams,
    app_key:   appKey,
    timestamp,
  };

  const sign = generateSign(path, allParams, "", appSecret);
  allParams.sign = sign;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(allParams)) {
    url.searchParams.set(k, v);
  }

  const res  = await fetch(url.toString(), {
    method:  "GET",
    headers: {
      "x-tts-access-token": accessToken,
      "Content-Type":       "application/json",
    },
  });

  const raw = await res.text();
  console.log(`[tts-api] GET ${path} HTTP ${res.status}:`, raw.slice(0, 400));

  return JSON.parse(raw) as TikTokApiResponse<T>;
}

/**
 * Makes a signed POST request to the TikTok Shop Open API v2.
 */
export async function ttsPost<T>(
  path:        string,
  queryParams: Record<string, string>,
  body:        Record<string, unknown>,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<T>> {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const allParams: Record<string, string> = {
    ...queryParams,
    app_key:   appKey,
    timestamp,
  };

  const bodyStr = JSON.stringify(body);
  const sign    = generateSign(path, allParams, bodyStr, appSecret);
  allParams.sign = sign;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(allParams)) {
    url.searchParams.set(k, v);
  }

  const res  = await fetch(url.toString(), {
    method:  "POST",
    headers: {
      "x-tts-access-token": accessToken,
      "Content-Type":       "application/json",
    },
    body: bodyStr,
  });

  const raw = await res.text();
  console.log(`[tts-api] POST ${path} HTTP ${res.status}:`, raw.slice(0, 400));

  return JSON.parse(raw) as TikTokApiResponse<T>;
}

// ─── Domain Methods ───────────────────────────────────────────────────────────

/**
 * GET Order Detail — fetches full order data including items, address, phone.
 * @see https://partner.tiktokshop.com/docv2/page/65b4d17ccebc8f11f77a7680
 */
export async function getOrderDetail(
  orderId:     string,
  accessToken: string,
  appKey:      string,
  appSecret:   string
): Promise<TikTokApiResponse<{ orders: TikTokOrderDetail[] }>> {
  return ttsGet<{ orders: TikTokOrderDetail[] }>(
    "/api/v2/order/detail",
    { ids: orderId },
    accessToken,
    appKey,
    appSecret
  );
}

/**
 * POST Get Order List — pulls recent orders with pagination.
 * @see https://partner.tiktokshop.com/docv2/page/65b4d17ccebc8f11f77a7680
 */
export async function getOrderList(params: {
  createTimeFrom: number;   // epoch seconds
  createTimeTo?:  number;
  pageSize?:      number;
  pageToken?:     string;
  sortField?:     string;
  sortOrder?:     string;
  accessToken:    string;
  appKey:         string;
  appSecret:      string;
}): Promise<TikTokApiResponse<OrderListData>> {
  const body: Record<string, unknown> = {
    create_time_from: params.createTimeFrom,
    page_size:        params.pageSize    ?? 20,
    sort_field:       params.sortField   ?? "CREATE_TIME",
    sort_order:       params.sortOrder   ?? "DESC",
  };

  if (params.createTimeTo) body.create_time_to = params.createTimeTo;
  if (params.pageToken)    body.page_token      = params.pageToken;

  return ttsPost<OrderListData>(
    "/api/v2/order/list",
    {},
    body,
    params.accessToken,
    params.appKey,
    params.appSecret
  );
}

// ─── TikTok Order Detail Type ─────────────────────────────────────────────────

export interface TikTokOrderDetail {
  id:                  string;
  status:              string;
  create_time:         number;
  update_time:         number;
  buyer_uid:           string;
  buyer_username?:     string;
  buyer_email?:        string;
  fulfillment_type?:   string;      // "FULFILLED_BY_SELLER" | "FULFILLMENT_BY_TIKTOK"
  is_gift?:            boolean;
  is_sample_order?:    boolean;
  payment_info?: {
    total_amount:      string;
    currency:          string;
    sub_total?:        string;
    shipping_fee?:     string;
  };
  recipient_address?: {
    name?:             string;
    phone_number?:     string;
    address_line1?:    string;
    address_line2?:    string;
    city?:             string;
    state?:            string;
    country?:          string;
    postal_code?:      string;
    full_address?:     string;
  };
  line_items?: TikTokLineItem[];
  packages?:   TikTokPackage[];
}

export interface TikTokLineItem {
  id:                string;
  product_id?:       string;
  product_name?:     string;
  sku_id?:           string;
  sku_name?:         string;
  quantity:          number;
  sale_price?:       string;
  currency?:         string;
  display_status?:   string;
}

export interface TikTokPackage {
  id:               string;
  tracking_number?: string;
  shipping_provider?: string;
  status?:          string;
}

interface OrderListData {
  orders?:          Array<{ id: string; status: string; create_time?: number; update_time?: number }>;
  next_page_token?: string;
  total_count?:     number;
}
