import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/tiktok/callback
 *
 * TikTok Shop OAuth callback — handles redirect after seller authorization.
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/authorization-overview-202407
 *
 * TikTok redirects here with:
 *   ?app_key={app_key}&code={auth_code}&locale={locale}&shop_region={region}
 *
 * Token exchange endpoint:
 *   GET https://auth.tiktok-shops.com/api/v2/token/get
 *   params: app_key, app_secret, auth_code, grant_type=authorized_code
 *
 * Token response `data` fields:
 *   access_token           - used in x-tts-access-token header for API calls
 *   access_token_expire_in - Unix timestamp (NOT seconds from now) when access_token expires
 *   refresh_token          - used to get fresh access_token
 *   refresh_token_expire_in- Unix timestamp when refresh_token expires
 *   open_id                - unique seller identifier (used as our shop_id key)
 *   seller_name            - seller display name
 *   seller_base_region     - e.g. "PH"
 *   granted_scopes         - list of authorized scopes
 *
 * NOTE: shop_id is NOT returned in the token response. To get it, call
 *       GET /api/v2/shop/get_authorized_shop with the access_token.
 *       We skip this for now and use open_id as the stable identifier.
 *
 * Flow:
 *   1. Extract code from redirect query params
 *   2. GET https://auth.tiktok-shops.com/api/v2/token/get (with params as query string)
 *   3. Parse open_id + tokens from response
 *   4. Upsert into shop_tokens (keyed by open_id as shop_id)
 *   5. Redirect to /admin/settings with success/error toast
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl

  // TikTok sends: code, app_key, locale, shop_region
  const code        = searchParams.get('code')
  const shop_region = searchParams.get('shop_region') ?? 'unknown'

  // ── Validate query params ─────────────────────────────────────────────────
  if (!code) {
    console.error('[tiktok/callback] Missing auth code in redirect params', Object.fromEntries(searchParams))
    return redirect(req, 'error', 'missing_code')
  }

  const appKey    = process.env.TTS_APP_KEY
  const appSecret = process.env.TTS_APP_SECRET

  if (!appKey || !appSecret) {
    console.error('[tiktok/callback] TTS_APP_KEY or TTS_APP_SECRET not set')
    return redirect(req, 'error', 'server_misconfiguration')
  }

  // ── GET /api/v2/token/get — method is GET, params in query string ─────────
  // Per docs: https://partner.tiktokshop.com/docv2/page/authorization-overview-202407
  let tokenData: TikTokTokenData
  try {
    const tokenUrl = new URL('https://auth.tiktok-shops.com/api/v2/token/get')
    tokenUrl.searchParams.set('app_key',    appKey)
    tokenUrl.searchParams.set('app_secret', appSecret)
    tokenUrl.searchParams.set('auth_code',  code)
    tokenUrl.searchParams.set('grant_type', 'authorized_code')

    // Method is GET per TikTok's authorization docs
    const res     = await fetch(tokenUrl.toString(), { method: 'GET' })
    const rawText = await res.text()

    // Log raw response — helps debug TikTok API changes without guessing
    console.log(`[tiktok/callback] Token exchange HTTP ${res.status}:`, rawText)

    let json: TikTokApiResponse<TikTokTokenData>
    try {
      json = JSON.parse(rawText)
    } catch {
      console.error('[tiktok/callback] Response is not valid JSON:', rawText)
      return redirect(req, 'error', 'invalid_response_from_tiktok')
    }

    if (json.code !== 0 || !json.data) {
      console.error('[tiktok/callback] Token exchange failed — code:', json.code, 'message:', json.message)
      return redirect(req, 'error', json.message ?? 'token_exchange_failed')
    }

    tokenData = json.data
    console.log('[tiktok/callback] Token exchange success — open_id:', tokenData.open_id, 'seller:', tokenData.seller_name)

  } catch (err) {
    console.error('[tiktok/callback] Fetch error during token exchange:', err)
    return redirect(req, 'error', 'fetch_error')
  }

  // ── Use open_id as stable shop identifier ────────────────────────────────
  // shop_id is NOT in the token response per TikTok docs.
  // open_id uniquely identifies the authorized seller. We store it as shop_id.
  const shopId = tokenData.open_id
  if (!shopId) {
    console.error('[tiktok/callback] open_id missing from token response:', tokenData)
    return redirect(req, 'error', 'no_open_id')
  }

  // ── Persist tokens to shop_tokens ────────────────────────────────────────
  // access_token_expire_in + refresh_token_expire_in are Unix timestamps per docs
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabase as any)
    .from('shop_tokens')
    .upsert(
      {
        shop_id:             shopId,
        seller_name:         tokenData.seller_name   ?? null,
        seller_base_region:  tokenData.seller_base_region ?? shop_region,
        access_token:        tokenData.access_token,
        refresh_token:       tokenData.refresh_token,
        // Docs say expire_in fields are Unix timestamps (epoch seconds)
        access_expires_at:   new Date(tokenData.access_token_expire_in  * 1000).toISOString(),
        refresh_expires_at:  new Date(tokenData.refresh_token_expire_in * 1000).toISOString(),
        authorized_at:       new Date().toISOString(),
      },
      { onConflict: 'shop_id' }
    )

  if (dbError) {
    console.error('[tiktok/callback] DB upsert failed:', dbError.message)
    return redirect(req, 'error', 'db_write_failed')
  }

  console.log(`[tiktok/callback] ✅ Shop authorized — open_id: ${shopId}, seller: ${tokenData.seller_name ?? 'unknown'}, region: ${tokenData.seller_base_region ?? shop_region}`)

  return redirect(req, 'success', shopId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function redirect(req: NextRequest, status: 'success' | 'error', value: string): NextResponse {
  const param = status === 'success' ? 'shop' : 'reason'
  return NextResponse.redirect(
    new URL(`/admin/settings?tiktok_auth=${status}&${param}=${encodeURIComponent(value)}`, req.nextUrl.origin)
  )
}

// ─── TikTok API Type Shapes ───────────────────────────────────────────────────

interface TikTokApiResponse<T> {
  code:       number
  message:    string
  request_id?: string
  data?:      T
}

interface TikTokTokenData {
  access_token:             string
  access_token_expire_in:   number   // Unix timestamp (epoch seconds) — NOT duration
  refresh_token:            string
  refresh_token_expire_in:  number   // Unix timestamp (epoch seconds) — NOT duration
  open_id:                  string   // stable seller identifier — used as our shop_id key
  seller_name?:             string
  seller_base_region?:      string
  granted_scopes?:          string[]
}
