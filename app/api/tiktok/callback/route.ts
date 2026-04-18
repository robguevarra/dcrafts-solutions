import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/tiktok/callback
 *
 * TikTok Shop OAuth callback. TikTok redirects here after the seller authorizes
 * the app via the authorization URL:
 *   https://services.tiktokshop.com/open/authorize?service_id=...
 *
 * Actual query params received from TikTok (service app redirect):
 *   ?app_key={app_key}&code={auth_code}&locale={locale}&shop_region={region}
 *
 * NOTE: TikTok does NOT include shop_id in the redirect URL for service apps.
 * The shop identifier (open_id) comes back in the token exchange response body.
 *
 * Flow:
 *   1. Extract auth code from query params
 *   2. Exchange code for access_token + refresh_token via TikTok token API
 *   3. Use open_id from token response as the shop identifier
 *   4. Upsert tokens into shop_tokens table (keyed by open_id → stored as shop_id)
 *   5. Redirect to /admin/settings with success/error toast param
 *
 * Security: No session required — server-to-TikTok exchange only.
 * Resulting tokens are service-role only (RLS blocks anon access).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl

  // TikTok sends: code, app_key, locale, shop_region
  const code        = searchParams.get('code')
  const shop_region = searchParams.get('shop_region') ?? 'PH'

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!code) {
    console.error('[tiktok/callback] Missing auth code in redirect params')
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=missing_code', req.nextUrl.origin)
    )
  }

  const appKey    = process.env.TTS_APP_KEY
  const appSecret = process.env.TTS_APP_SECRET

  if (!appKey || !appSecret) {
    console.error('[tiktok/callback] TTS_APP_KEY or TTS_APP_SECRET not set')
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=server_misconfiguration', req.nextUrl.origin)
    )
  }

  // ── Exchange auth code for tokens ─────────────────────────────────────────
  // Docs: https://partner.tiktokshop.com/docv2/page/649a1d55bb6e3302feff16c0
  // shop_id is NOT returned in redirect — comes from token response as open_id
  let tokenData: TikTokTokenResponse
  try {
    // TikTok's v2 token API takes params as query string, not JSON body
    const tokenUrl = new URL('https://auth.tiktok-shops.com/api/v2/token/get')
    tokenUrl.searchParams.set('app_key',    appKey)
    tokenUrl.searchParams.set('app_secret', appSecret)
    tokenUrl.searchParams.set('auth_code',  code)
    tokenUrl.searchParams.set('grant_type', 'authorized_code')

    const res     = await fetch(tokenUrl.toString(), { method: 'POST' })
    const rawText = await res.text()

    // Log raw response before parsing — essential for debugging TikTok API quirks
    console.log('[tiktok/callback] Raw token response (HTTP', res.status, '):', rawText)

    let json: { code: number; message: string; data?: TikTokTokenResponse }
    try {
      json = JSON.parse(rawText)
    } catch {
      console.error('[tiktok/callback] Response is not valid JSON:', rawText)
      return NextResponse.redirect(
        new URL('/admin/settings?tiktok_auth=error&reason=invalid_response_from_tiktok', req.nextUrl.origin)
      )
    }

    if (json.code !== 0 || !json.data) {
      console.error('[tiktok/callback] Token exchange failed — code:', json.code, 'message:', json.message)
      return NextResponse.redirect(
        new URL(
          `/admin/settings?tiktok_auth=error&reason=${encodeURIComponent(json.message ?? 'token_exchange_failed')}`,
          req.nextUrl.origin
        )
      )
    }

    tokenData = json.data
  } catch (err) {
    console.error('[tiktok/callback] Fetch error during token exchange:', err)
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=network_error', req.nextUrl.origin)
    )
  }

  // Use open_id as the stable shop identifier (service app — no shop_id in redirect)
  // open_id uniquely identifies the authorized seller account
  const shopId = tokenData.open_id

  if (!shopId) {
    console.error('[tiktok/callback] No open_id in token response:', tokenData)
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=no_shop_identifier', req.nextUrl.origin)
    )
  }

  // ── Persist tokens ────────────────────────────────────────────────────────
  const now = Date.now()
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabase as any)
    .from('shop_tokens')
    .upsert(
      {
        shop_id:             shopId,
        seller_name:         tokenData.seller_name ?? null,
        seller_base_region:  shop_region,
        access_token:        tokenData.access_token,
        refresh_token:       tokenData.refresh_token,
        access_expires_at:   new Date(now + tokenData.access_token_expire_in  * 1000).toISOString(),
        refresh_expires_at:  new Date(now + tokenData.refresh_token_expire_in * 1000).toISOString(),
        authorized_at:       new Date(now).toISOString(),
      },
      { onConflict: 'shop_id' }
    )

  if (dbError) {
    console.error('[tiktok/callback] Failed to persist tokens:', dbError.message)
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=db_write_failed', req.nextUrl.origin)
    )
  }

  console.log(`[tiktok/callback] ✅ Authorized shop ${shopId} (${tokenData.seller_name ?? 'unknown'}) region=${shop_region}`)

  return NextResponse.redirect(
    new URL(`/admin/settings?tiktok_auth=success&shop=${encodeURIComponent(shopId)}`, req.nextUrl.origin)
  )
}

// ─── TikTok Token Exchange Response Shape ─────────────────────────────────────

interface TikTokTokenResponse {
  access_token:            string
  refresh_token:           string
  access_token_expire_in:  number   // seconds until access_token expires
  refresh_token_expire_in: number   // seconds until refresh_token expires
  open_id:                 string   // stable seller identifier — used as shop_id
  seller_name?:            string
  seller_base_region?:     string
}
