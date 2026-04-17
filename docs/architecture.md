# Architecture

## Overview

The Dcrafts platform is a **server-centric Next.js 15 app** with a Supabase backend. Everything that can be a Server Component is. Client Components are used only for interactivity (Realtime subscriptions, forms, animations).

---

## System Diagram

```
┌────────────────────────────────────────────────────────────┐
│                     EXTERNAL SOURCES                       │
│                                                            │
│  TikTok Shop ──webhook──► /api/webhooks/tiktok             │
│  Shopee ──manual paste──► /admin/shopee-import             │
│  Buyer ──TikTok chat────► TikTok CS API ──► /api/chatbot   │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│                   NEXT.JS 15 APP (Vercel)                  │
│                                                            │
│  App Router (Server Components by default)                 │
│  ├── (dashboard)/admin/*    Admin order management         │
│  ├── (dashboard)/admin/kds  Designer KDS (Realtime)        │
│  ├── (dashboard)/messaging  Messaging studio               │
│  └── api/*                  Route handlers (webhooks, AI)  │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│                     SUPABASE                               │
│                                                            │
│  PostgreSQL ── RLS per role (admin/designer/qc_uploader)   │
│  Realtime ──── WebSocket channels (print_jobs, orders)     │
│  Storage ───── proofs/ bucket (QC photos)                  │
│  Auth ─────── Email/password + app_metadata.role           │
└────────────────────────────────────────────────────────────┘
```

---

## Data Flow: TikTok Order Ingestion

```
TikTok Shop
  │  ORDER_STATUS_CHANGE webhook (POST)
  ▼
/api/webhooks/tiktok
  1. Read raw body
  2. Verify HMAC-SHA256 (x-tts-signature header)
  3. Return 200 immediately  ◄── TikTok requires < 5s
  4. Fire void async task
       │
       ▼
  processOrderAsync()
  1. Parse webhook payload
  2. Check `shadow_mode` feature flag
  3. Normalize payload → NormalizedOrder shape
  4. UPSERT into `orders` ON CONFLICT(platform, platform_order_id) DO UPDATE
  5. Log result
```

**Shadow mode behavior:** When `shadow_mode = true`, the order is stored `shadow_mode = true` and the system never writes back to TikTok (no messages sent, no status updates pushed).

---

## Data Flow: Designer KDS

```
Admin assigns print job
  │
  ▼
INSERT into print_jobs (order_id, designer_id, status='queued')
  │
  ▼
Supabase Realtime broadcasts postgres_changes event
  │
  ▼
KDS page (Client Component) receives event via WebSocket
  │
  ▼
Framer Motion AnimatePresence drops new JobCard into grid
  │  (< 2 second latency target)
  ▼
Designer sees job with full print spec
```

---

## Data Flow: AI Chatbot (Phase 2)

```
Buyer sends TikTok message
  │
  ▼
TikTok CS API webhook → /api/chatbot/process
  │
  ├─ Load conversation state from DB (conversations table)
  ├─ Detect intent (GPT-4o-mini, last 5 messages)
  ├─ Run state machine transition
  ├─ Generate reply (GPT-4o-mini, product catalog injected)
  │
  ├─ shadow_mode=true  ──► Log only. No send.
  ├─ chatbot_suggest_mode=true ──► Save as suggested_reply. Human approves.
  └─ chatbot_auto_mode=true ──► Send via CS API immediately.
```

---

## Key Architectural Decisions

### 1. No SDK dependency for TikTok
The official TikTok Node.js SDK (`Node.js SDK/` folder) uses the deprecated `request` package and is incompatible with Next.js Edge runtime. We use it as a **reference only** for endpoint paths and type shapes, implementing calls with native `fetch`.

### 2. Service Role Client for webhooks
Webhooks run server-side and need to bypass RLS to write orders without a user session. We use `createServiceClient()` from `lib/supabase/server.ts` which uses the `SUPABASE_SERVICE_ROLE_KEY`. This key is **never** exposed to the browser.

### 3. Async webhook processing
TikTok requires a webhook response in < 5 seconds. We return 200 immediately and fire `processOrderAsync()` as a detached Promise (intentionally fire-and-forget). This avoids timeout failures on slow DB operations.

### 4. Feature flags as operational controls
Three boolean flags in the `feature_flags` table gate every destructive behavior:
- `shadow_mode` → no writes to TikTok, enables safe 7-day testing
- `chatbot_suggest_mode` → bot generates but human approves
- `chatbot_auto_mode` → full autonomy

These are flipped manually by an admin — no code deploy required.

### 5. UPSERT-based deduplication
The `orders` table has `UNIQUE(platform, platform_order_id)`. Every ingestion uses UPSERT with `onConflict: "platform,platform_order_id"`. Duplicate webhooks are silently handled by updating the status row.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 15 (App Router) | Server Components, Route Handlers, native streaming |
| Language | TypeScript strict | Catch shape errors early, especially for Supabase responses |
| Styling | Tailwind CSS v4 | CSS-first config (`@import "tailwindcss"`) |
| Animations | Framer Motion | Spring physics, `AnimatePresence` for KDS card flow |
| Database | Supabase PostgreSQL | RLS, Realtime, Storage, Auth in one platform |
| Realtime | Supabase Realtime | WebSocket, `postgres_changes` for live KDS |
| Auth | Supabase Auth | Email/password, role via `app_metadata.role` |
| AI | OpenAI GPT-4o-mini | Cost-effective, fast, good Taglish/English comprehension |
| SMS | Semaphore PH | ₱0.50/SMS, Philippine numbers, reliable delivery |
| Hosting | Vercel + Supabase | Zero-config Next.js deploy, managed PostgreSQL |

---

## File Structure

```
dcrafts-solutions/
├── app/
│   ├── (dashboard)/
│   │   └── admin/
│   │       ├── layout.tsx          ← Sidebar shell
│   │       ├── orders/page.tsx     ← Order Inbox (Server Component)
│   │       ├── kds/page.tsx        ← Designer KDS (Client Component, Realtime)
│   │       ├── stats/page.tsx      ← Shadow Stats + Gate 1 checklist
│   │       ├── messaging/          ← Phase 2
│   │       └── settings/           ← Phase 1 (feature flags UI)
│   ├── api/
│   │   └── webhooks/tiktok/route.ts  ← HMAC verify + order upsert
│   ├── globals.css                 ← Design tokens (CSS vars)
│   ├── layout.tsx                  ← Root layout (fonts)
│   └── page.tsx                    ← Redirect → /admin/orders
├── components/
│   ├── layout/
│   │   └── DashboardSidebar.tsx    ← Fixed 240px nav rail
│   └── ui/
│       └── StatusBadge.tsx         ← Order status chip
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ← Browser client
│   │   └── server.ts               ← Server + service role clients
│   ├── tiktok/
│   │   └── webhook.ts              ← HMAC verify, order normalizer
│   └── utils.ts                    ← cn(), formatOrderTime(), truncate()
├── types/
│   └── database.ts                 ← Auto-generated Supabase types
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  ← All 8 tables, enums, RLS, seed data
│       └── 002_fix_search_path.sql ← Security fix on set_updated_at()
└── docs/                           ← You are here
```
