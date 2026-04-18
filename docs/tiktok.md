# TikTok Shop Integration

> **Status:** OAuth connected · Webhooks active · Order enrichment live · Manual sync live · CS API approval pending  
> **Last updated:** 2026-04-18  
> **API version:** 202309 (versioned path endpoints)

---

## Overview

The platform integrates with TikTok Shop via two separate API surfaces:

| API | Purpose | Status |
|-----|---------|--------|
| **TikTok Shop Open API (202309)** | Orders, shop data | ✅ OAuth authorized + enrichment live |
| **Customer Service (CS) API** | Read/send buyer messages | ⏳ Approval pending |

---

## Architecture: Two Ingestion Paths

```
TikTok Shop
  │
  ├─ Webhooks (primary)                         app/api/webhooks/tiktok/route.ts
  │    POST /api/webhooks/tiktok
  │    HMAC-SHA256 verified (x-tt-signature header)
  │    Signature = HMAC(appKey + rawBody, appSecret)   ← confirmed 2026-04-18
  │    Handles types: 1 (order status), 2 (reverse), 4 (address), 11 (cancel)
  │    Returns 200 immediately, runs enrichment via after() post-response
  │
  ├─ Manual Sync (admin trigger)                app/api/tiktok/sync/route.ts
  │    POST /api/tiktok/sync?days=7
  │    UI button: Settings → Integrations → "Sync Orders Now"
  │    Calls POST /order/202309/orders/search (pagination up to 10 pages, 7-day window)
  │    Auth-guarded — requires logged-in admin session
  │    ⭐ Use this to pull orders that are past ON_HOLD (address data available)
  │
  └─ Order Enrichment (automatic)              lib/tiktok/order-ingest.ts
       Triggered after every webhook + every sync item
       Calls GET /order/202309/orders with shop_cipher
       Writes: buyer name, phone, address, items, payment to orders table
```

---

## API Endpoints (202309)

All calls go to `https://open-api.tiktokglobalshop.com` (confirmed production host).

> ⚠️ **Do NOT use** `open-api.tiktokshop.com` — it does not resolve (ENOTFOUND).  
> ⚠️ **Do NOT use** `/api/v2/order/detail` or `/api/v2/order/list` — these are old v2 paths.

| Operation | Method | Path |
|-----------|--------|------|
| Get Order Detail | GET | `/order/202309/orders?ids=<id>&shop_cipher=<cipher>` |
| Search Order List | POST | `/order/202309/orders/search` |
| Get Authorized Shops | GET | `/authorization/202309/shops` |
| Get Access Token | POST | `https://auth.tiktok-shops.com/api/v2/token/get` |
| Refresh Access Token | POST | `https://auth.tiktok-shops.com/api/v2/token/refresh` |

### Request Signing

Every API call (except token exchange) must be signed:

```
1. Collect all query params, exclude `sign` and `access_token`
2. Sort alphabetically, concatenate as key+value (no separator)
3. base   = path + sorted_params + body_json (empty string if GET)
4. wrap   = app_secret + base + app_secret
5. sign   = HMAC-SHA256(wrap, appSecret).toHex()
```

Implemented in `lib/tiktok/api-client.ts` → `generateSign()`.

---

## Webhook Signature Verification

**Confirmed production format (2026-04-18):**

```
signature = HMAC-SHA256(app_key + raw_body, app_secret).toHex()
header    = x-tt-signature   (raw hex string, no "sha256=" prefix)
```

Implemented in `lib/tiktok/webhook.ts` → `verifyTikTokWebhookSignature()`.

> ⚠️ **Old docs say** `x-tts-signature` — TikTok actually sends `x-tt-signature`.  
> ⚠️ **Old docs say** to use a separate webhook secret — the signing key IS `app_secret` (`TTS_APP_SECRET`).  
> `TIKTOK_WEBHOOK_SECRET` is **no longer used**.

---

## shop_cipher — Critical Concept

In API version 202309, all shop-specific endpoints require a `shop_cipher` parameter.

**This is NOT the numeric `shop_id` (e.g. `7494826521029151329`).**

`shop_cipher` is a base64-encoded identifier fetched from `GET /authorization/202309/shops`.

### Resolution Flow

```
enrichOrderDetail() called
  │
  ├─ Check shop_tokens.shop_cipher in DB
  │    ├─ Found → use it (fast path, O(1))
  │    └─ Not found → call GET /authorization/202309/shops
  │           ├─ Returns shops[0].cipher
  │           └─ Write cipher back to shop_tokens.shop_cipher (cache)
  │
  └─ Call GET /order/202309/orders?ids=<orderId>&shop_cipher=<cipher>
```

**Troubleshooting error `106011 Invalid shop_cipher`:**
- The `shop_cipher` column in `shop_tokens` may be stale/empty
- Trigger any webhook — `resolveShopCipher()` will call the shops API and repopulate it automatically
- Or run: `UPDATE shop_tokens SET shop_cipher = NULL;` then trigger a webhook to force a fresh fetch

---

## OAuth Authorization Flow

```
Seller visits authorization URL
  https://services.tiktokshop.com/open/authorize?service_id=7628648618510272277
  │
  ▼
TikTok authorization screen → seller clicks Authorize
  │
TikTok redirects to:
  https://dcrafts.vercel.app/api/tiktok/callback?code=AUTH_CODE&shop_region=PH
  │
  ▼
GET /api/tiktok/callback  ←  app/api/tiktok/callback/route.ts
  │
  ├─ POST https://auth.tiktok-shops.com/api/v2/token/get
  │   body: { app_key, app_secret, auth_code, grant_type: "authorized_code" }
  │
  ├─ Upserts: access_token, refresh_token, seller_name into shop_tokens
  │
  └─ Redirects to /admin/settings?tiktok_auth=success
```

> After a fresh OAuth callback, the `shop_cipher` column will be empty until the first webhook/sync triggers `resolveShopCipher()`.

### How to Re-authorize

1. Go to `/admin/settings` → Integrations → **Connect TikTok Shop**
2. Approve in TikTok → redirected back automatically
3. Trigger a test webhook or manual sync to populate `shop_cipher`

> ⚠️ The `refresh_token` expires after **30 days**. Re-authorize before then.

---

## Token Storage: `shop_tokens` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `shop_id` | `text` | Numeric TikTok shop ID (e.g. `7494826521029151329`) |
| `shop_cipher` | `text` | **202309 API identifier** — from `/authorization/202309/shops` |
| `seller_name` | `text` | Display name |
| `seller_base_region` | `text` | e.g. `PH` |
| `access_token` | `text` | Valid ~7 days |
| `refresh_token` | `text` | Valid 30 days |
| `access_expires_at` | `timestamptz` | Check before API calls |
| `refresh_expires_at` | `timestamptz` | If passed → full re-auth required |
| `authorized_at` | `timestamptz` | First authorization |
| `updated_at` | `timestamptz` | Auto-updated |

**RLS:** `service_role` only.

**Check token + cipher status:**
```sql
SELECT shop_id, seller_name,
       LEFT(shop_cipher, 30) AS cipher_preview,
       access_expires_at, refresh_expires_at,
       CASE
         WHEN refresh_expires_at < NOW() THEN 'REFRESH EXPIRED — re-auth required'
         WHEN access_expires_at  < NOW() THEN 'ACCESS EXPIRED'
         WHEN shop_cipher IS NULL THEN 'CIPHER MISSING — trigger webhook to populate'
         ELSE 'OK'
       END AS status
FROM shop_tokens;
```

---

## Webhook Handler

**File:** `app/api/webhooks/tiktok/route.ts`

### Event Types Handled

| TikTok `type` | Meaning | Handler |
|---------------|---------|---------|
| `1` | Order Status Change | `ingestOrder()` → `enrichOrderDetail()` |
| `2` | Reverse/Return/Cancel | `handleReverseEvent()` |
| `4` | Recipient Address Update | `enrichOrderDetail()` re-fetch |
| `11` | Cancellation Status Change | `handleReverseEvent()` |

### Why `after()` is Critical

```typescript
// ❌ WRONG — Vercel kills this when 200 response is flushed:
void processAsync(rawBody);
return NextResponse.json({ ok: true });

// ✅ CORRECT — Vercel waits for after() to complete before termination:
after(async () => { await processAsync(rawBody); });
return NextResponse.json({ ok: true });
```

Without `after()`, the enrichment API call (Order Detail) never runs because Vercel terminates the function instance as soon as the response is sent.

### Order Ingestion: Two-Step Flow

```
Webhook received
  │
  ├─ Step 1 (synchronous, before 200 ack)
  │    upsertMinimalOrder() — saves order_id + status
  │
  └─ Step 2 (inside after(), post-response)
       enrichOrderDetail()
         └─ resolveShopCipher() → GET /authorization/202309/shops (if not cached)
         └─ GET /order/202309/orders → buyer name, phone, address, items
         └─ UPDATE orders SET recipient_name, recipient_phone, items_json, ...
```

### Order Status Mapping

| TikTok `order_status` | Internal `status` |
|-----------------------|-------------------|
| `UNPAID`, `ON_HOLD` | `pending_spec` |
| `AWAITING_SHIPMENT`, `AWAITING_COLLECTION` | `spec_collected` |
| `IN_TRANSIT`, `DELIVERED`, `COMPLETED` | `shipped` |
| `CANCELLED`, `PARTIALLY_CANCELLED` | `cancelled` |

### Buyer Data Availability by Order Status

This is confirmed TikTok API 202309 behavior (from official docs):

| Condition | `recipient_address` behavior |
|-----------|-----------------------------|
| Order is `UNPAID` or `ON_HOLD` | **Not returned at all** — field is null |
| Order is `AWAITING_SHIPMENT`+ | Returned with full data (for FBS orders) |
| Order uses platform logistics (FBT) | `name` and `phone_number` are **desensitized** (masked as `M*** J**`) |
| Order uses seller logistics (FBS) | Full `name` and `phone_number` returned |

**Why orders show masked/missing data after the first webhook:**

```
Order placed → status: ON_HOLD
  └─ TikTok fires type=1 webhook immediately
       └─ We call GET /order/202309/orders
            └─ recipient_address = null (ON_HOLD restriction)

~1 hour later → status: AWAITING_SHIPMENT
  └─ TikTok fires type=1 webhook again
       └─ We call GET /order/202309/orders
            └─ recipient_address = { name, phone_number, full_address } ✅
```

**Workaround:** Use **Sync Orders Now** (Settings → Integrations) after orders move to `AWAITING_SHIPMENT` to pull full buyer data immediately without waiting for the second webhook.

---

## Partner Center Configuration

| Setting | Value |
|---------|-------|
| **Redirect URI** | `https://dcrafts.vercel.app/api/tiktok/callback` |
| **Webhook URL** | `https://dcrafts.vercel.app/api/webhooks/tiktok` |
| **Webhook Secret** | *(not used — signature uses `TTS_APP_SECRET`)* |
| **Service ID** | `7628648618510272277` |

### Required OAuth Scopes

These must all be enabled in Partner Center → App → API & Feature Management **before** new tokens will include them.

| Scope | Required For | Status |
|-------|-------------|--------|
| `Order.Read` | `GET /order/202309/orders` (enrichment + manual sync) | ✅ Required — add if missing |
| `Shop.Read` | `GET /authorization/202309/shops` (shop_cipher resolution) | ✅ Required — add if missing |
| `CS.MESSAGE_AND_ROOM.READ` | Read buyer messages | ⏳ Approval pending |
| `CS.MESSAGE_AND_ROOM.WRITE` | Send bot replies | ⏳ Approval pending |

> ⚠️ After adding a new scope in Partner Center, you **must re-run OAuth** (Settings → Integrations → Re-authorize) to get a token that includes it. Old tokens do not auto-update.

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|---------|
| `TTS_APP_KEY` | Part of webhook HMAC + all API signing | ✅ |
| `TTS_APP_SECRET` | HMAC signing key for both webhooks and API calls | ✅ |
| `TIKTOK_WEBHOOK_SECRET` | **Deprecated — no longer used** | ❌ Remove |

---

## Troubleshooting

### `401` on webhook — signature rejected

1. Confirm `TTS_APP_KEY` and `TTS_APP_SECRET` are set in Vercel env vars
2. Signature format: `HMAC-SHA256(app_key + raw_body, app_secret)` compared to `x-tt-signature` header

### `ENOTFOUND open-api.tiktokshop.com`

Wrong hostname. The correct production API host is `open-api.tiktokglobalshop.com`. Check `lib/tiktok/api-client.ts` → `BASE_URL`.

### `105005 Access denied — missing scope`

The access token doesn't include the required OAuth scope for the endpoint called.

1. Go to **Partner Center** → App → **API & Feature Management**
2. Find and enable the missing scope (e.g., `Order.Read` for order endpoints)
3. Re-authorize via **Settings → Integrations → Re-authorize** to get a new token with the scope

> This is a Partner Center configuration problem, not a code bug. Old tokens do not retroactively gain new scopes.

### `106011 Invalid shop_cipher`

The `shop_cipher` in DB is wrong or empty. Resolution:
1. Clear it: `UPDATE shop_tokens SET shop_cipher = NULL;`
2. Trigger any webhook or click **Sync Orders Now** — `resolveShopCipher()` will fetch a fresh cipher from `/authorization/202309/shops` and cache it

Confirmed working cipher format: `ROW_0yUQYwAAAABwhFE_MV1ypFaCsdmr-gge` (starts with `ROW_`)

### Buyer name/phone showing as `M*** J**` or `(+63)951*****00` (masked)

Two possible causes per official TikTok docs:

**Cause 1 — Order was fetched while still `ON_HOLD` (most common):**
- `recipient_address` is completely unavailable during `ON_HOLD` and `UNPAID` status
- TikTok fires a second type=1 webhook when status moves to `AWAITING_SHIPMENT` (~1 hour later)
- Our handler re-runs enrichment on that second webhook → full data will be written
- **Immediate fix:** Click **Sync Orders Now** in Settings to re-fetch orders that are now past `ON_HOLD`

**Cause 2 — Order uses platform logistics (FBT):**
- TikTok desensitizes `name` and `phone_number` for platform-fulfilled orders
- No workaround — this is a TikTok privacy policy for FBT
- Our shop uses **Fulfilled by Seller (FBS)** so this should not apply

### Orders not appearing after webhook

The enrichment step (`enrichOrderDetail`) isn't running. Common causes:
- **`after()` missing**: ensure enrichment runs inside `after()`, not as `void promise`
- **shop_cipher error**: check logs for `106011`
- **Scope missing**: check logs for `105005` → add `Order.Read` scope in Partner Center
- **API host wrong**: check for `ENOTFOUND` in logs

### `order_status` returning integers instead of strings

Wrong API version. Ensure you're calling `/order/202309/orders` (not `/api/v2/order/detail`). The 202309 version uses string ENUMs (`UNPAID`, `AWAITING_SHIPMENT`, etc.).

---

## Manual Sync — How to Use

**Location:** Settings → Integrations → **Sync Orders Now** button (blue, next to Re-authorize)

**When to use:**
- After granting a new scope and re-authorizing (to immediately pull recent orders)
- To populate buyer address/phone for orders that were enriched during `ON_HOLD` (masked data)
- After a webhook outage to catch any missed events
- Any time you want orders from the last 7 days to be re-upserted with fresh data

**What it does:**
1. Calls `POST /order/202309/orders/search` (last 7 days, up to 200 orders)
2. Upserts each order into the `orders` table
3. Runs `enrichOrderDetail` on each — since these are existing orders past `ON_HOLD`, full address data is returned
4. Shows result: `✅ Synced N order(s) from the last 7 days.`

---

## Planned

- **Token Auto-Rotation (Phase 3):** Background job to refresh `access_token` before it expires, eliminating manual re-auth every 7 days.
- **CS Messaging:** Pending TikTok Partner Center approval for `CS.MESSAGE_AND_ROOM.READ/WRITE` scopes.
