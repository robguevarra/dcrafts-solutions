# Dcrafts Operations Platform — Documentation

> **Last updated:** 2026-04-18  
> **Status:** Phase 1 complete · Phase 2 in progress (chatbot live, CS API pending)  
> **Live URL:** `https://dcrafts.vercel.app` (prod) · `localhost:3000` (dev)

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
| [chatbot.md](./chatbot.md) | AI chatbot pipeline, spec collection, playground |
| [tiktok.md](./tiktok.md) | TikTok OAuth flow, token storage, webhook handler |
| [roadmap.md](./roadmap.md) | Phase-by-phase task tracker with current status |
| [shadow-mode.md](./shadow-mode.md) | Shadow Mode strategy, gates, and go-live checklist |
| [environment.md](./environment.md) | Environment variables and secrets guide |
| [runbook.md](./runbook.md) | How to run, deploy, test, and debug |
| [design-system.md](./design-system.md) | Colors, typography, component patterns |

---

## Quick Status

```
Phase 1 — Core OMS + KDS        ████████░░  80% complete
Phase 2 — AI Chatbot             ███████░░░  70% complete (pipeline + OAuth live)
Phase 3 — QC Proof + SMS         ░░░░░░░░░░   0% (starts after Phase 2)
Phase 4 — Scale Intelligence     ░░░░░░░░░░   0% (backlog)
```

**Current focus:**
- [x] TikTok Shop OAuth authorized — tokens in `shop_tokens`
- [ ] TikTok CS API integration (pending Partner Center approval)
- [ ] Token auto-rotation job (access token expires every ~12h)
- [ ] Color validation against 23 official colors
- [ ] Field change handling in confirm step ("change color to blue")
