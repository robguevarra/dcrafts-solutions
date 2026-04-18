# Database Schema

> **Project:** `qgonuztynqabujtamorm` (Supabase)  
> **Region:** ap-southeast-1  
> **Types file:** `types/database.ts` (manually maintained — regenerate after schema changes)

---

## Enums

```sql
order_platform     → 'tiktok' | 'shopee'
order_status       → 'pending_spec' | 'spec_collected' | 'in_production'
                     | 'qc_upload' | 'shipped' | 'cancelled'
print_job_status   → 'queued' | 'in_progress' | 'done'
conversation_state → 'new' | 'pre_order_faq' | 'pre_order_spec' | 'post_order_spec'
                     | 'order_confirmation' | 'human_handoff' | 'resolved'
```

---

## Tables

### `orders`
The central table. One row per unique order across all platforms.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | Primary key |
| `platform` | `order_platform` | `tiktok` or `shopee` |
| `platform_order_id` | `text` | Original order ID from the platform |
| `buyer_id` | `text` | TikTok `buyer_uid` or Shopee user ID |
| `buyer_name` | `text` | Display name |
| `buyer_phone` | `text` | For SMS (Shopee imports; TikTok via GetOrderDetail) |
| `raw_payload` | `jsonb` | Original webhook payload for debugging |
| `status` | `order_status` | Tracks production pipeline stage |
| `shadow_mode` | `boolean` | `true` = ingested during shadow period |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

**Unique constraint:** `UNIQUE(platform, platform_order_id)` — deduplication backbone  
**Indexes:** `status`, `platform`, `created_at DESC`  
**Realtime:** FULL replica identity enabled ✅

---

### `print_specs`
Print specification for an order. Created by the AI chatbot or manually by admin.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `order_id` | `uuid` | FK → orders |
| `font_name` | `text` | One of 21 font options |
| `color_name` | `text` | One of 23 color options |
| `size_cm` | `numeric(5,2)` | Physical size in centimeters |
| `letter_case` | `text` | `upper` or `lower` |
| `letters_text` | `text` | The actual letters e.g. "L,O,V,E" |
| `quantity` | `integer` | Default 1 |
| `confirmed_at` | `timestamptz` | Set when buyer confirms spec |
| `created_at` | `timestamptz` | |

---

### `pre_order_intents`
Captures spec preferences from buyers who message before placing an order.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `tiktok_user_id` | `text` | Indexed — used to match to order after purchase |
| `font_name` | `text` | |
| `color_name` | `text` | |
| `size_cm` | `numeric(5,2)` | |
| `letter_case` | `text` | |
| `letters_text` | `text` | |
| `linked_order_id` | `uuid` | FK → orders (set after purchase matched) |
| `created_at` | `timestamptz` | |

---

### `print_jobs`
One print job per order. Assigned to a designer, tracked through production.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `order_id` | `uuid` | FK → orders |
| `designer_id` | `uuid` | Will reference `auth.users.id` after T1.3 |
| `status` | `print_job_status` | `queued → in_progress → done` |
| `proof_photo_url` | `text` | Supabase Storage URL after upload |
| `proof_sent_at` | `timestamptz` | Set when proof sent to buyer |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

**Realtime:** FULL replica identity enabled ✅ — used by KDS

---

### `conversations`
Tracks TikTok CS conversations and their chatbot state machine stage.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `platform_conversation_id` | `text` | TikTok conversation ID (unique) |
| `buyer_id` | `text` | |
| `order_id` | `uuid` | FK → orders (linked after spec collection) |
| `state` | `conversation_state` | Current chatbot FSM state |
| `is_escalated` | `boolean` | `true` = needs human agent |
| `last_activity_at` | `timestamptz` | Used for inbox sorting |
| `created_at` | `timestamptz` | |

---

### `messages`
Full message history per conversation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `conversation_id` | `uuid` | FK → conversations |
| `role` | `text` | `buyer`, `bot`, or `agent` |
| `content` | `text` | The actual message text |
| `suggested_reply` | `text` | Bot's draft reply (suggested reply mode) |
| `was_sent` | `boolean` | Whether the message was actually sent to TikTok |
| `created_at` | `timestamptz` | |

---

### `sms_logs`
Audit trail for every SMS sent via Semaphore.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `order_id` | `uuid` | FK → orders |
| `phone` | `text` | Recipient phone number |
| `message` | `text` | |
| `semaphore_message_id` | `text` | Semaphore API response ID |
| `status` | `text` | `sent` or `failed` |
| `created_at` | `timestamptz` | |

---

### `shop_tokens`
TikTok Shop OAuth tokens. One row per authorized shop. Upserted on every OAuth callback.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `shop_id` | `text` | UNIQUE — TikTok seller shop ID |
| `seller_name` | `text` | Display name from TikTok token response |
| `access_token` | `text` | Valid ~12h — used for all Shop API calls |
| `refresh_token` | `text` | Valid 30 days — used to get fresh access_token |
| `access_expires_at` | `timestamptz` | expires_in converted to absolute timestamp |
| `refresh_expires_at` | `timestamptz` | If this passes, full re-auth required |
| `authorized_at` | `timestamptz` | First authorization timestamp |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

**RLS:** `service_role` only. Never exposed to authenticated or anon clients.  
See [tiktok.md](./tiktok.md) for full OAuth flow documentation.

---

### `feature_flags`
Operational gate flags. Flip these to control system behavior without a code deploy.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | |
| `name` | `text` | Unique flag name |
| `enabled` | `boolean` | Current state |
| `description` | `text` | Human-readable explanation |
| `updated_at` | `timestamptz` | Auto-updated |

**Current flag values:**

| Flag | Value | Meaning |
|------|-------|---------|
| `shadow_mode` | `TRUE` | Orders stored, no TikTok write-back |
| `chatbot_suggest_mode` | `FALSE` | Waiting for Phase 2 |
| `chatbot_auto_mode` | `FALSE` | Waiting for Phase 2 |

> ⚠️ **Never flip `shadow_mode=false` without passing Gate 1 checks.** See [shadow-mode.md](./shadow-mode.md).

---

## Row Level Security (RLS)

RLS is enabled on all 8 tables. **Migration `002` implemented proper role-scoped policies.**

### Live policy matrix

| Table | `admin` (authenticated) | `service_role` (server) | `anon` |
|-------|------------------------|------------------------|--------|
| `orders` | ALL (full CRUD) | Bypasses RLS | ❌ |
| `print_specs` | ALL | Bypasses RLS | ❌ |
| `print_jobs` | ALL | Bypasses RLS | ❌ |
| `feature_flags` | SELECT only | Bypasses RLS | ❌ |
| `conversations` | ❌ (Phase 2) | Bypasses RLS | ❌ |
| `messages` | ❌ (Phase 2) | Bypasses RLS | ❌ |
| `sms_logs` | SELECT (audit trail) | Bypasses RLS | ❌ |
| `pre_order_intents` | ❌ (Phase 2) | Bypasses RLS | ❌ |
| `shop_tokens` | ❌ | service_role policy | ❌ |

> **How admin check works:** `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`  
> The JWT claim is set in `auth.users.raw_app_meta_data` in Supabase Auth.

> **Note on `service_role`:** Postgres's RLS is bypassed entirely for the `service_role` key — no explicit policy is needed. All server-side writes (webhooks, edge functions, cron) use the service key.

---

## Trigger Functions

### `set_updated_at()`
Automatically updates `updated_at` timestamp on `orders`, `print_jobs`, and `feature_flags`.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = '';  -- search_path fixed for security
```

---

## Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | All 8 core tables, enums, indexes, RLS scaffold, feature flag seed data |
| `002_rbac_policies_and_fk_indexes.sql` | RBAC: role-scoped RLS policies + missing FK indexes for perf |
| `003_messaging_tables.sql` | `conversations` + `messages` tables for chatbot pipeline |
| `004_chatbot_spec_step.sql` | Added `spec_step` + `spec_draft` columns to `conversations` |
| `005_shop_tokens.sql` | `shop_tokens` table for TikTok OAuth token storage |

To re-apply from scratch:
```bash
# Via Supabase MCP (recommended)
# Or paste into Dashboard → SQL Editor
```

To regenerate TypeScript types after schema changes:
```bash
npx supabase gen types typescript --project-id qgonuztynqabujtamorm > types/database.ts
```
