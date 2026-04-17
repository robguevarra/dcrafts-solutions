# Phase Roadmap & Task Tracker

> **Current Phase:** Phase 1 — Core OMS + KDS (Shadow Mode)  
> **Sprint start:** 2026-04-16  
> **Gate 1 target:** 7 days after TikTok webhook goes live

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `[x]` | Complete |
| `[/]` | In progress |
| `[ ]` | Not started |
| `[-]` | Blocked / deferred |

---

## Phase 1 — Core OMS + KDS (Shadow Mode)

**Goal:** Zero duplicate orders. Designers have a real-time view. Production untouched.

### Foundation

| Task | Status | Notes |
|------|--------|-------|
| T1.1 — Scaffold Next.js 15 project | ✅ Done | App Router, Tailwind v4, TypeScript strict |
| T1.2 — Supabase schema + migrations | ✅ Done | 8 tables, all migrations applied via MCP |
| T1.3 — Auth + role system | ⬜ Pending | Supabase Auth, `app_metadata.role` (admin/designer/qc_uploader) |
| T1.4 — Feature flags seeded | ✅ Done | `shadow_mode=true`, chatbot flags = false |

### TikTok Order Ingestion

| Task | Status | Notes |
|------|--------|-------|
| T1.5 — Webhook receiver + HMAC verify | ✅ Done | `app/api/webhooks/tiktok/route.ts` |
| T1.6 — Order normalize + dedup | ✅ Done | `lib/tiktok/webhook.ts`, UPSERT with conflict key |
| T1.7 — `pg_cron` reconciliation job | ⬜ Pending | Poll GetOrderList every 15min as fallback |

### Admin Dashboard

| Task | Status | Notes |
|------|--------|-------|
| T1.8 — Admin Order Inbox UI | ✅ Done | `/admin/orders` — live data visible |
| T1.9 — Order Detail page | ✅ Done | `/admin/orders/[id]` — buyer info, status pipeline, spec card, raw payload |
| T1.10 — Shopee paste ingestion tool | ✅ Done | `/admin/shopee-import` — parser lib + 3-step import UI |

### Designer KDS

| Task | Status | Notes |
|------|--------|-------|
| T1.11 — KDS page with Supabase Realtime | ✅ Done | `/admin/kds` — Realtime subscription active |
| T1.12 — JobCard component | ✅ Done | Framer Motion slide-in, spec display |
| T1.13 — Photo upload flow (QC role) | ✅ Done | `/api/qc/upload` + `ProofUpload` component, `proofs/` bucket created |
| T1.14 — Shadow Stats dashboard | ✅ Done | `/admin/stats` — ingestion metrics + Gate 1 checklist |

### Phase 1 Progress
```
Foundation:              ███░  3/4 tasks
TikTok Ingestion:        ██░   2/3 tasks  
Admin Dashboard:         ███   3/3 tasks ✅
Designer KDS:            ████  4/4 tasks ✅
─────────────────────────────────────────
TOTAL:                   12/14 tasks (86%)
```

---

## Phase 2 — Messaging Studio + AI Chatbot

**Goal:** All buyer messaging managed through our UI. Chatbot live in Suggested Reply mode.  
**Starts after:** Gate 1 passed

### TikTok CS API Integration

| Task | Status | Notes |
|------|--------|-------|
| T2.1 — OAuth 2.0 token flow | ⬜ Pending | Exchange App Key + Secret, auto-refresh |
| T2.2 — CS API message proxy | ⬜ Pending | `lib/tiktok/messages.ts` |

### Bot Playground

| Task | Status | Notes |
|------|--------|-------|
| T2.3 — Bot Playground UI | ⬜ Pending | `/admin/messaging/playground` |

### Chatbot State Machine

| Task | Status | Notes |
|------|--------|-------|
| T2.4 — Intent detector (GPT-4o-mini) | ⬜ Pending | `lib/chatbot/intentDetector.ts` |
| T2.5 — System prompt builder | ⬜ Pending | Inject full font/color/size catalog |
| T2.6 — Spec collector (6-step flow) | ⬜ Pending | `lib/chatbot/specCollector.ts` |
| T2.7 — Human handoff detector | ⬜ Pending | `lib/chatbot/handoff.ts` |
| T2.8 — Pre-order spec intake | ⬜ Pending | `pre_order_intents` table link |
| T2.9 — Order confirmation flow | ⬜ Pending | Full spec recap → buyer message |
| T2.10 — Chatbot API endpoint | ⬜ Pending | `/api/chatbot/process` |

### Messaging Studio UI

| Task | Status | Notes |
|------|--------|-------|
| T2.11 — Conversation Inbox | ⬜ Pending | `/admin/messaging` with Realtime |
| T2.12 — Chat View + Suggested Reply Panel | ⬜ Pending | Approve/edit/discard bot reply |
| T2.13 — QA & Analytics tab | ⬜ Pending | Intent analytics, QA scoring |

---

## Phase 3 — QC Proof Delivery + SMS

**Goal:** Proof auto-sent to buyer; wrong orders corrected via SMS.  
**Starts after:** Gate 2 passed

| Task | Status | Notes |
|------|--------|-------|
| T3.1 — Go-live proof auto-send | ⬜ Pending | CS API image send on `print_jobs.status='done'` |
| T3.2 — Semaphore SMS integration | ⬜ Pending | `lib/sms/semaphore.ts` |
| T3.3 — Wrong-order SMS flow | ⬜ Pending | Admin flags order → sends pre-filled SMS |

---

## Phase 4 — Intelligence & Scale (Month 3+)

> Backlog. Do not start until Phase 3 is stable.

| Task | Description |
|------|-------------|
| T4.1 | Batch print optimizer (group jobs by font + color) |
| T4.2 | Shopee Open Platform API integration |
| T4.3 | Automated prompt improvement from QA flagged convos |
| T4.4 | Re-order memory ("same as last time?" detection) |
| T4.5 | Analytics: designer throughput, peak hours, top SKUs |

---

## Overall Progress

```
Phase 1  ████████████  86%
Phase 2  ░░░░░░░░░░░░   0%
Phase 3  ░░░░░░░░░░░░   0%
Phase 4  ░░░░░░░░░░░░   0%  (backlog)
```
