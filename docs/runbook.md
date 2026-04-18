# Runbook — How to Run, Deploy & Debug

---

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- Access to `.env.local` (get from project lead)

### First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Verify environment
cat .env.local  # should have all 6+ variables populated

# 3. Start dev server
npm run dev

# 4. Open browser
open http://localhost:3000
# Should redirect to /admin/orders and show the Order Inbox
```

### Daily development

```bash
npm run dev          # Start dev server at localhost:3000
```

That's it. Supabase is cloud-hosted — no local database needed.

---

## Type Checking

```bash
# Full type check (excludes Node.js SDK reference folder)
npx tsc --noEmit

# Should output nothing on success (zero errors)
```

---

## Database Operations

### View all tables
Go to [Supabase Table Editor](https://supabase.com/dashboard/project/qgonuztynqabujtamorm/editor)

### Run SQL queries
Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/qgonuztynqabujtamorm/sql/new)

### Regenerate TypeScript types after schema changes

```bash
# Option 1: Via MCP (preferred — automatic)
# The AI agent can call mcp_supabase-mcp-server_generate_typescript_types

# Option 2: Via CLI
npx supabase gen types typescript --project-id qgonuztynqabujtamorm > types/database.ts
```

### Apply a new migration

```sql
-- Write your migration SQL, then either:
-- Option 1: Paste into Supabase Dashboard → SQL Editor
-- Option 2: Use MCP tool: mcp_supabase-mcp-server_apply_migration
-- Option 3: Save to supabase/migrations/00X_description.sql and apply
```

---

## Checking Feature Flags

```sql
SELECT name, enabled, description FROM feature_flags ORDER BY name;
```

### Flip shadow mode OFF (Gate 1 go-live)

```sql
-- Read the shadow-mode.md Gate 1 checklist FIRST
UPDATE feature_flags SET enabled = false WHERE name = 'shadow_mode';
```

### Re-enable shadow mode (rollback)

```sql
UPDATE feature_flags SET enabled = true WHERE name = 'shadow_mode';
```

---

## Testing the Webhook Locally

To test TikTok webhooks locally, you need a public URL. Use ngrok:

```bash
# Install ngrok (one-time)
brew install ngrok/ngrok/ngrok

# Expose local port 3000
ngrok http 3000
# Copy the https URL, e.g. https://abc123.ngrok.io

# Set as webhook URL in TikTok Partner Center:
# https://abc123.ngrok.io/api/webhooks/tiktok
```

### Test with curl (skip HMAC for dev)

```bash
# Compute real signature: HMAC-SHA256(TTS_APP_KEY + body, TTS_APP_SECRET)
# Header is x-tt-signature (raw hex, no sha256= prefix)
curl -X POST http://localhost:3000/api/webhooks/tiktok \
  -H "Content-Type: application/json" \
  -H "x-tt-signature: <computed_signature>" \
  -d '{
    "type": 1,
    "shop_id": "7494826521029151329",
    "timestamp": 1713200000,
    "data": {
      "order_id": "TEST-001",
      "order_status": "AWAITING_SHIPMENT"
    }
  }'
```

> For quick dev testing, insert test orders directly into the DB instead (see below).
> Real signature computation requires: `echo -n "$KEY$BODY" | openssl dgst -sha256 -hmac "$SECRET"`

### Trigger manual order sync (admin)

```bash
curl -X POST https://dcrafts.vercel.app/api/tiktok/sync?days=3 \
  -H "Cookie: <your_admin_session_cookie>"
# Returns: { ok: true, ingested: N, pages: N, shadow_mode: true }
```

### Insert test orders directly

```sql
INSERT INTO orders (platform, platform_order_id, buyer_name, buyer_id, status, shadow_mode, raw_payload)
VALUES ('tiktok', 'TK-MANUAL-001', 'Test Buyer', 'uid_test_001', 'pending_spec', true, '{}');
```

---

## Checking Logs

### Next.js server logs
Visible in the terminal where `npm run dev` is running.

### Supabase logs
- API logs: [Dashboard → Logs → API](https://supabase.com/dashboard/project/qgonuztynqabujtamorm/logs/edge-logs)
- Postgres logs: [Dashboard → Logs → Database](https://supabase.com/dashboard/project/qgonuztynqabujtamorm/logs/postgres-logs)

---

## Deployment (Vercel)

**Live URL:** `https://dcrafts.vercel.app`  
**Auto-deploys:** Every `git push` to `main` triggers a Vercel build.

```bash
# Build check before pushing (verify no build errors)
npm run build

# Deploy is automatic on push:
git add -A && git commit -m "your message" && git push
```

### Environment variables in Vercel
All variables from `docs/environment.md` must be set in Vercel Dashboard → Project → Settings → Environment Variables.

---

## TikTok OAuth: Re-authorize

If the TikTok access token or refresh token is expired or invalid:

1. Go to `https://dcrafts.vercel.app/admin/settings` → Integrations
2. Click **Connect TikTok Shop** (links to the authorization URL)
3. Log in as the TikTok Shop seller account and click **Authorize**
4. You'll be redirected back to `/admin/settings?tiktok_auth=success`
5. Tokens are automatically upserted into `shop_tokens`

**Check token health:**
```sql
SELECT shop_id, access_expires_at, refresh_expires_at,
  CASE
    WHEN refresh_expires_at < NOW() THEN 'REFRESH EXPIRED — re-auth required'
    WHEN access_expires_at  < NOW() THEN 'ACCESS EXPIRED — re-auth recommended'
    ELSE 'OK'
  END AS token_status
FROM shop_tokens;
```

> Refresh token expires every **30 days**. Re-auth is required if it lapses.  
> See [tiktok.md](./tiktok.md) for full OAuth documentation.

---

## TikTok: Manual Order Sync

**Via UI (recommended):** Go to **Settings → Integrations** → click **Sync Orders Now**.
- Pulls last 7 days of orders
- Runs enrichment on each (full address available for orders past ON_HOLD)
- Shows result inline

**Via curl (admin session required):**
```bash
curl -X POST https://dcrafts.vercel.app/api/tiktok/sync?days=7 \
  -H "Cookie: <your_admin_session_cookie>"
# Returns: { ok: true, ingested: N, pages: N, shadow_mode: true/false }
```

**When to use:**
- After re-authorizing OAuth (new scope added)
- To fix orders with missing buyer name/phone (enriched during ON_HOLD)
- After any webhook downtime

> See [tiktok.md → Manual Sync](./tiktok.md#manual-sync--how-to-use) for full details.

---

## Common Issues

### "Could not find table 'public.orders'"
Schema migration hasn't been applied. Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor.

### TypeScript errors in `Node.js SDK/` folder
This is expected if you run `tsc` without the correct config. The SDK folder is excluded in `tsconfig.json`. Use the project-scoped `npx tsc --noEmit` command.

### KDS shows "OFFLINE" badge
The Supabase Realtime subscription failed. Check:
1. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct in `.env.local`
2. `print_jobs` table is in the `supabase_realtime` publication (verify in Dashboard → Database → Replication)

### Orders not appearing after webhook
1. Check Vercel function logs for `[webhook/tiktok]` entries
2. Confirm `TTS_APP_KEY` and `TTS_APP_SECRET` are set in Vercel env vars
3. Check that the webhook handler uses `after()` — not `void promise` (see tiktok.md)
4. Look for `106011 Invalid shop_cipher` — trigger a resend to auto-repopulate cipher
5. Check Supabase DB: `SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;`

### `105005 Access denied` in Vercel logs
A required OAuth scope is missing from the access token.
1. Go to Partner Center → App → API & Feature Management
2. Enable the missing scope (e.g., `Order.Read`)
3. Re-authorize via Settings → Integrations → **Re-authorize**
4. Click **Sync Orders Now** to immediately re-pull orders with the new token

### Orders show masked buyer name/phone (`M*** J**`)
The order was enriched while in `ON_HOLD` status — TikTok doesn't return address data then.
- Wait for the `AWAITING_SHIPMENT` webhook (∼1 hour), OR
- Click **Sync Orders Now** (Settings → Integrations) to re-fetch with current status

See [tiktok.md](./tiktok.md#buyer-namephone-showing-as-m-j-or-63951500-masked) for full explanation.

### TikTok OAuth "Authorization failed" toast
See the Troubleshooting section in [tiktok.md](./tiktok.md).
