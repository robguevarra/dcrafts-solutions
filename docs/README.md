# Dcrafts Operations Platform — Documentation

> **Last updated:** 2026-04-16  
> **Status:** Phase 1 — Active Development (Shadow Mode)  
> **Live URL:** `localhost:3000` (dev) · Vercel (prod — TBD)

---

## What is this?

The **Dcrafts Ops Platform** replaces a manual Excel-based workflow for a custom paper-cut letter business. It handles order ingestion from TikTok Shop and Shopee, routes jobs to designers in real-time, automates customer service via AI chatbot, and delivers QC proofs automatically.

---

## Documentation Index

| Doc | What it covers |
|-----|---------------|
| [architecture.md](./architecture.md) | System design, data flow, tech decisions |
| [database.md](./database.md) | Full schema, enums, indexes, RLS policies |
| [api.md](./api.md) | All API routes — request/response contracts |
| [roadmap.md](./roadmap.md) | Phase-by-phase task tracker with current status |
| [shadow-mode.md](./shadow-mode.md) | Shadow Mode strategy, gates, and go-live checklist |
| [environment.md](./environment.md) | Environment variables and secrets guide |
| [runbook.md](./runbook.md) | How to run, deploy, test, and debug |
| [design-system.md](./design-system.md) | Colors, typography, component patterns |

---

## Quick Status

```
Phase 1 — Core OMS + KDS        ████████░░  80% complete
Phase 2 — AI Chatbot             ░░░░░░░░░░   0% (starts after Phase 1)
Phase 3 — QC Proof + SMS         ░░░░░░░░░░   0% (starts after Phase 2)
Phase 4 — Scale Intelligence     ░░░░░░░░░░   0% (backlog)
```

**Immediate next tasks:**
- [ ] T1.9 — Order Detail page  
- [ ] T1.10 — Shopee paste ingestion tool  
- [ ] T1.13 — Photo upload flow (QC role)  
- [ ] T1.3 — Auth + RBAC (admin / designer / qc_uploader)
