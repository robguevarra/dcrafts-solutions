# TikTok Shop Integration

> **Status:** OAuth connected · Webhooks active · CS API approval pending  
> **Last updated:** 2026-04-18

---

## Overview

The platform integrates with TikTok Shop via two separate API surfaces:

| API | Purpose | Status |
|-----|---------|--------|
| **TikTok Shop Open API** | Orders, shop data | ✅ OAuth authorized |
| **Customer Service (CS) API** | Read/send buyer messages | ⏳ Approval pending |

These require separate authorization. The Shop Open API is authorized via OAuth and tokens are stored in `shop_tokens`. The CS API uses the same OAuth flow but requires additional Partner Center approval for the messaging scopes.

---

## Architecture: Two Ingestion Paths

```
TikTok Shop
  │
  ├─ Webhooks (primary)
  │    POST /api/webhooks/tiktok
  │    HMAC-SHA256 verified (x-tts-signature header)
  │    Handles ORDER_STATUS_CHANGE events
  │    Zero processing time — acknowledges in <5s then async processes
  │
  └─ Polling fallback (secondary)
       Supabase Edge Function: poll-tiktok-orders
       pg_cron schedule: every 15 minutes
       Catches orders missed by webhook failures
       Requires: shop access_token from shop_tokens table
```

---

## OAuth Authorization Flow

TikTok Shop uses a standard OAuth 2.0 authorization code flow. The access token obtained grants permission to call the Shop Open API on behalf of the seller.

### Flow Diagram

```
Seller visits authorization URL
  https://services.tiktokshop.com/open/authorize?service_id=7628648618510272277
  │
  ▼
TikTok authorization screen ("Allow this app to access your shop?")
  │
  ▼ seller clicks Authorize
  │
TikTok redirects to:
  https://dcrafts.vercel.app/api/tiktok/callback?code=AUTH_CODE&shop_id=SHOP_ID
  │
  ▼
GET /api/tiktok/callback  ←  app/api/tiktok/callback/route.ts
  │
  ├─ Validates: code + shop_id present
  ├─ Reads: TTS_APP_KEY + TTS_APP_SECRET from env
  ├─ POST https://auth.tiktok-shops.com/api/v2/token/get
  │   body: { app_key, app_secret, auth_code, grant_type: "authorized_code" }
  │
  ├─ On success: upserts access_token + refresh_token into shop_tokens
  │              (keyed by shop_id — safe to re-run, idempotent)
  │
  └─ Redirects to /admin/settings?tiktok_auth=success&shop=SHOP_ID
       Settings page shows green toast: "TikTok Shop connected!"
```

### How to Re-authorize

If tokens expire or become invalid:

1. Go to `/admin/settings` → Integrations → **Connect TikTok Shop**
2. Click the button (links to the auth URL)
3. Approve access in TikTok
4. You'll be redirected back with fresh tokens automatically upserted

> ⚠️ The `refresh_token` expires after **30 days**. If it expires, you must re-run the full OAuth flow. A token rotation job is planned for Phase 3.

---

## Token Storage: `shop_tokens` Table

Tokens are stored server-side in Supabase, never in environment variables (tokens rotate — env var approach would require redeploys).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `shop_id` | `text` | UNIQUE — TikTok's seller shop ID |
| `seller_name` | `text` | Display name from TikTok |
| `access_token` | `text` | Valid for ~12 hours |
| `refresh_token` | `text` | Valid for 30 days |
| `access_expires_at` | `timestamptz` | When access_token expires |
| `refresh_expires_at` | `timestamptz` | When refresh_token expires — must re-auth before this |
| `authorized_at` | `timestamptz` | First authorization timestamp |
| `updated_at` | `timestamptz` | Auto-updated on every upsert |

**RLS:** `service_role` only — tokens are never accessible via anon or authenticated browser clients.

**Check token status:**
```sql
SELECT shop_id, seller_name, access_expires_at, refresh_expires_at, authorized_at
FROM shop_tokens;
```

---

## Webhook Handler: `POST /api/webhooks/tiktok`

Receives `ORDER_STATUS_CHANGE` events from TikTok Partner Center.

**Source:** `app/api/webhooks/tiktok/route.ts`  
**Auth:** HMAC-SHA256 via `x-tts-signature` header (secret: `TIKTOK_WEBHOOK_SECRET`)

### Event Type Mapping

| TikTok `type` | Meaning | Handled? |
|---------------|---------|----------|
| `1` | ORDER_STATUS_CHANGE | ✅ |
| Other | Other event types | Ignored (return 200 silently) |

### Order Status Mapping

| TikTok `order_status` | Internal `status` |
|-----------------------|-------------------|
| `UNPAID`, `ON_HOLD` | `pending_spec` |
| `AWAITING_SHIPMENT`, `AWAITING_COLLECTION` | `spec_collected` |
| `IN_TRANSIT`, `DELIVERED`, `COMPLETED` | `shipped` |
| `CANCELLED` | `cancelled` |
| (anything else) | `pending_spec` |

### Deduplication

Every order ingestion is an UPSERT on `UNIQUE(platform, platform_order_id)`. Duplicate webhooks for the same order safely update the status row — no duplicates possible.

### Shadow Mode Behavior

When `feature_flags.shadow_mode = TRUE`:
- Order is ingested and stored normally
- `orders.shadow_mode` column is set to `TRUE`
- No writes are made back to TikTok (no message sends, no status updates)

---

## OAuth Callback: `GET /api/tiktok/callback`

**Source:** `app/api/tiktok/callback/route.ts`

Handles the redirect from TikTok after authorization. This is the only route that should be set as the **Redirect URI** in TikTok Partner Center.

| Redirect URI (Partner Center setting) |
|--------------------------------------|
| `https://dcrafts.vercel.app/api/tiktok/callback` |

**Query params received:**
- `code` — single-use authorization code (expires in ~10 minutes)
- `shop_id` — the seller's TikTok shop ID

**Error redirects:**

| Error | Redirect destination |
|-------|---------------------|
| Missing `code` or `shop_id` | `/admin/settings?tiktok_auth=error&reason=missing_params` |
| Env vars not set | `/admin/settings?tiktok_auth=error&reason=server_misconfiguration` |
| TikTok token API failure | `/admin/settings?tiktok_auth=error&reason=<tiktok_message>` |
| DB write failure | `/admin/settings?tiktok_auth=error&reason=db_write_failed` |
| Success | `/admin/settings?tiktok_auth=success&shop=<shop_id>` |

---

## Partner Center Configuration

### Required settings in TikTok Partner Center

| Setting | Value |
|---------|-------|
| **Redirect URI** | `https://dcrafts.vercel.app/api/tiktok/callback` |
| **Webhook URL** | `https://dcrafts.vercel.app/api/webhooks/tiktok` |
| **Webhook Secret** | Matches `TIKTOK_WEBHOOK_SECRET` env var |
| **Service ID** | `7628648618510272277` |

### OAuth App Scopes

| Scope | Required For | Status |
|-------|-------------|--------|
| `Shop.Product.Read` | Order detail lookup | ✅ Included |
| `Order.Read` | Order status webhooks | ✅ Included |
| `CS.MESSAGE_AND_ROOM.READ` | Read buyer messages | ⏳ CS API approval pending |
| `CS.MESSAGE_AND_ROOM.WRITE` | Send bot replies | ⏳ CS API approval pending |

---

## Environment Variables

| Variable | Where it comes from | Used in |
|----------|--------------------|---------| 
| `TTS_APP_KEY` | Partner Center → App Info | `app/api/tiktok/callback/route.ts` |
| `TTS_APP_SECRET` | Partner Center → App Info | `app/api/tiktok/callback/route.ts` |
| `TIKTOK_WEBHOOK_SECRET` | Partner Center → Webhooks | `app/api/webhooks/tiktok/route.ts` |

Tokens (`access_token`, `refresh_token`) are **not** in env vars — they live in `shop_tokens` and are read at runtime by any server-side code that calls the TikTok API.

---

## Troubleshooting

### "Authorization failed — missing_params" toast

TikTok redirected without a `code` or `shop_id`. Usually means:
- The redirect URI in Partner Center doesn't exactly match `https://dcrafts.vercel.app/api/tiktok/callback`
- Extra trailing slash or path difference

**Fix:** Double-check the exact URI in Partner Center → App Info → Redirect URI.

### "Authorization failed — token_exchange_failed"

The auth code exchange with TikTok's API failed. Possible causes:
1. `TTS_APP_KEY` or `TTS_APP_SECRET` is wrong in Vercel env vars
2. The auth code expired (valid ~10 minutes). Re-run OAuth.
3. App not yet approved by TikTok Partner Center

### No orders appearing after webhook fires

1. Check Vercel function logs for `[webhook/tiktok]` entries
2. Confirm `TIKTOK_WEBHOOK_SECRET` matches Partner Center
3. Check `shadow_mode = TRUE` in `feature_flags` (orders will be stored but not sent back)

```sql
-- Check if webhook is receiving events
SELECT platform_order_id, status, shadow_mode, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

### Access token expired mid-operation

```sql
-- Check token health
SELECT shop_id, access_expires_at, refresh_expires_at,
  CASE
    WHEN access_expires_at  < NOW() THEN 'ACCESS EXPIRED'
    WHEN refresh_expires_at < NOW() THEN 'REFRESH EXPIRED — re-auth required'
    WHEN access_expires_at  < NOW() + interval '1 hour' THEN 'ACCESS expiring soon'
    ELSE 'OK'
  END AS token_status
FROM shop_tokens;
```

If `REFRESH EXPIRED`: go to `/admin/settings` → Connect TikTok Shop → re-authorize.

---

## Planned: Token Auto-Rotation (Phase 3)

Currently tokens must be manually refreshed before expiry. In Phase 3, a background job will:

1. Run every 6 hours via pg_cron
2. Check `access_expires_at < NOW() + interval '2 hours'`
3. Call `POST https://auth.tiktok-shops.com/api/v2/token/refresh` with `refresh_token`
4. Upsert fresh tokens back into `shop_tokens`

This eliminates the need for manual re-authorization every 12 hours.
