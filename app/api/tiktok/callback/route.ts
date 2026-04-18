import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/tiktok/callback
 *
 * TikTok Shop OAuth callback. TikTok redirects here after the seller authorizes
 * the app via the authorization URL:
 *   https://services.tiktokshop.com/open/authorize?service_id=...
 *
 * Query params received from TikTok:
 *   ?code={auth_code}&shop_id={shop_id}
 *
 * Flow:
 *   1. Validate required params
 *   2. Exchange auth_code for access_token + refresh_token
 *   3. Upsert tokens into shop_tokens table (keyed by shop_id)
 *   4. Redirect admin to /admin/settings with success toast param
 *
 * Security: No session required — this is a server-to-TikTok exchange.
 * The resulting tokens are stored service-role only (RLS blocks anon access).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const code    = searchParams.get('code')
  const shop_id = searchParams.get('shop_id')

  // ── Validate ─────────────────────────────────────────────────────────────
  if (!code || !shop_id) {
    console.error('[tiktok/callback] Missing code or shop_id', { code, shop_id })
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=missing_params', req.nextUrl.origin)
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
  let tokenData: TikTokTokenResponse
  try {
    const res = await fetch('https://auth.tiktok-shops.com/api/v2/token/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key:    appKey,
        app_secret: appSecret,
        auth_code:  code,
        grant_type: 'authorized_code',
      }),
    })

    const json = await res.json() as { code: number; message: string; data?: TikTokTokenResponse }

    if (json.code !== 0 || !json.data) {
      console.error('[tiktok/callback] Token exchange failed:', json.message, json.code)
      return NextResponse.redirect(
        new URL(
          `/admin/settings?tiktok_auth=error&reason=${encodeURIComponent(json.message ?? 'token_exchange_failed')}`,
          req.nextUrl.origin
        )
      )
    }

    tokenData = json.data
  } catch (err) {
    console.error('[tiktok/callback] Network error during token exchange:', err)
    return NextResponse.redirect(
      new URL('/admin/settings?tiktok_auth=error&reason=network_error', req.nextUrl.origin)
    )
  }

  // ── Persist tokens ───────────────────────────────────────────────────────
  const now = Date.now()
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabase as any)
    .from('shop_tokens')
    .upsert(
      {
        shop_id,
        seller_name:         tokenData.seller_name ?? null,
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

  console.log(`[tiktok/callback] ✅ Authorized shop ${shop_id} (${tokenData.seller_name ?? 'unknown'})`)

  return NextResponse.redirect(
    new URL(`/admin/settings?tiktok_auth=success&shop=${encodeURIComponent(shop_id)}`, req.nextUrl.origin)
  )
}

// ─── TikTok Token Exchange Response Shape ────────────────────────────────────

interface TikTokTokenResponse {
  access_token:            string
  refresh_token:           string
  access_token_expire_in:  number  // seconds until access_token expires
  refresh_token_expire_in: number  // seconds until refresh_token expires
  open_id:                 string
  seller_name?:            string
  seller_base_region?:     string
}
