# AI Chatbot — Spec Collection Engine

> **Status:** Phase 2 — Core pipeline complete, shadow mode active  
> **Last updated:** 2026-04-18

---

## Overview

The Dcrafts AI chatbot automates post-order spec collection for paper cut letter orders. When a buyer messages after ordering, the bot collects four pieces of information — the **text to print**, the **color**, and the **size** — then presents a recap for confirmation before writing the spec to the database.

The system is stateless per invocation. All conversation state lives in the `conversations` table so it survives serverless cold starts and horizontal scaling.

---

## Business Context

**Product:** Paper cut letters (physical, handcrafted letters in various fonts, colors, and sizes)

**Per-order spec required:**
| Field | Notes |
|-------|-------|
| `letters_text` | Verbatim text — "Lets go GSW" ≠ "GSW". Every character counts. |
| `color` | One of 23 available colors — buyer describes it freeform |
| `size` | S (2cm) / M (4cm) / L (6cm) / XL (8cm) |
| `quantity` | **Derived automatically** from `letters_text`: alphanumeric chars only (spaces don't count) |
| `font` | NOT collected by bot — comes from the TikTok order variant metadata |

**Quantity derivation rule:**
```
"Lets go GSW" → strip [^a-zA-Z0-9] → "LetsgoGSW" → 9 pieces
"Grace"       → "Grace"            → 5 pieces
"ROB@25"      → "ROB25"            → 5 pieces
```

---

## Pipeline Architecture

Every buyer message runs through this sequential pipeline. The pipeline is called by the API route handler and is fully synchronous from the caller's perspective.

```
POST /api/chatbot/process (or /api/chatbot/playground-proxy in dev)
  │
  ▼
processMessage() — lib/chatbot/index.ts
  │
  ├─ 1. Load conversation state + last 10 messages (Supabase service role)
  │
  ├─ 2. detectIntent() — lib/chatbot/intentDetector.ts
  │       GPT-4o-mini classifies: pre_order | post_order_spec | complaint | tracking | general
  │
  ├─ 3. checkHandoff() — lib/chatbot/handoffDetector.ts
  │       4-trigger escalation check (keyword → request → loop → sentiment)
  │       Short-circuits pipeline if escalation triggered
  │
  ├─ 4. advanceSpec() — lib/chatbot/specCollector.ts
  │       Single GPT call extracts ALL spec fields from buyer message at once
  │       Advances to first still-missing field
  │       On confirm step: reads YES/NO and signals orchestrator
  │
  ├─ 5. generateReply() — lib/chatbot/replyGenerator.ts
  │       GPT-4o-mini generates reply in brand voice (Filipino-English, warm, artisan)
  │       Answer + Redirect: answers any tangent, always ends with the pending spec question
  │
  ├─ 6. Shadow mode gate — reads feature_flags table (cached 60s)
  │       shadow_mode=true → log only, do NOT send to TikTok
  │
  └─ 7. Persist to DB
          INSERT into messages (buyer message + bot reply)
          UPDATE conversations (state, spec_step, spec_draft)
          On confirmed YES → INSERT into print_specs
```

---

## Module Reference

### `lib/chatbot/index.ts` — Orchestrator

**Entry point:** `processMessage(request: ChatbotProcessRequest)`

Coordinates all modules. Reads and writes to Supabase using `createServiceClient()` (service role — bypasses RLS; auth is enforced at the route handler level).

| Function | Purpose |
|----------|---------|
| `processMessage` | Main exported function. Full pipeline per buyer turn. |
| `loadConversation` | Reads conversation + spec state from DB |
| `loadRecentMessages` | Fetches last 10 messages for reply context |
| `getFontFromOrder` | Reads font from `orders.raw_payload` variant metadata |
| `getShadowMode` | Reads `feature_flags.shadow_mode` with 60s in-process cache |
| `writeConfirmedSpec` | Writes final spec to `print_specs` table on buyer YES |

---

### `lib/chatbot/specCollector.ts` — Spec State Machine

**Key design decision:** Uses a **single GPT call per buyer turn** to extract ALL spec fields simultaneously. This handles the common case where a buyer provides multiple fields in one message (e.g. `"Lets go GSW" po na kulay red, XL`).

#### How extraction works

```typescript
// One GPT call extracts all four fields at once:
{
  letters_text: "Lets go GSW",  // verbatim from quotes or phrase
  color: "red",
  size_cm: 8,                   // XL → 8
  confirmed: null               // not a confirm step
}
```

#### Verbatim text rules (critical)

The extraction prompt enforces these rules strictly:

1. **Quoted text extracted literally** — `"Lets go GSW" po` → `Lets go GSW`
2. **NEVER drop words** — `LETS GO WARRIORS` stays `LETS GO WARRIORS`, not `WARRIORS`
3. **Only strip clearly separate filler** — `po`, `sana`, `gusto ko`, `please`, `I want`
4. **Preserve buyer's capitalization and spacing** exactly

```
✅ "Lets go GSW" po na kulay red → letters_text: "Lets go GSW"
✅ HAPPY BIRTHDAY sana           → letters_text: "HAPPY BIRTHDAY"
✅ Grace po                      → letters_text: "Grace"
❌ lets go GSW                   → letters_text: "GSW"   ← OLD WRONG BEHAVIOR
✅ lets go GSW po                → letters_text: "lets go GSW"
```

#### Step resolution

After updating the draft with whatever was extracted, the collector resolves the **first still-missing field** in this fixed order:

```
letters_text → color → size → confirm
```

If a buyer provides all three in one message, their next reply will be on the confirm step directly.

#### `deriveQuantity(text: string): number`

```typescript
// Exported utility — also used in admin views
deriveQuantity("Lets go GSW") // → 9 (LetsgoGSW = 9 alphanumeric)
deriveQuantity("Grace")       // → 5
deriveQuantity("HAPPY BIRTHDAY") // → 12
```

---

### `lib/chatbot/intentDetector.ts` — Intent Classification

Classifies buyer intent so the reply generator can pick the right tone and context.

| Intent | When used |
|--------|-----------|
| `post_order_spec` | Buyer has placed an order and is providing spec |
| `pre_order` | Buyer hasn't ordered yet, asking about products/pricing |
| `complaint` | Issue with received order |
| `tracking` | Asking about shipping/delivery |
| `general` | Everything else |

**Model:** GPT-4o-mini, `temperature: 0`, JSON output, fails safe to `general`.

---

### `lib/chatbot/handoffDetector.ts` — Escalation

Runs four escalation checks in order (cheapest first):

1. **Keyword match** — regex for explicit human requests ("refund", "complaint", "wrong item")
2. **Explicit human request** — "talk to a person", "real agent"
3. **Loop detection** — same question asked 3+ times in recent history
4. **GPT sentiment** — negative sentiment in last 3 messages (last resort, costs a GPT call)

On escalation:
- `conversations.is_escalated = true`
- `conversations.state = 'human_handoff'`
- Reply is a fixed handoff message (no GPT call)

---

### `lib/chatbot/replyGenerator.ts` — Reply Generation

Generates the buyer-facing reply using the **Answer + Redirect** pattern:

> _Answer any tangent the buyer raised briefly (1–2 sentences), then end the reply with the pending spec question._

**Brand voice constraints:**
- Filipino-English mix (Taglish) — casual but professional
- Warm, artisan tone — never robotic
- Maximum 3 sentences
- Always ends with the spec question for the current step

**System prompt injects:**
- Current spec step and what's already been collected
- Pending question to redirect to
- Dcrafts brand voice guidelines

---

### `lib/chatbot/types.ts` — Shared Types

Key types used across all chatbot modules:

```typescript
type SpecStep = 'letters_text' | 'color' | 'size' | 'confirm'

interface SpecDraft {
  lettersText?: string   // verbatim, preserved
  colorName?: string     // freeform from buyer
  sizeCm?: number        // 2 | 4 | 6 | 8
  quantity?: number      // derived, not collected
}

interface ChatbotProcessRequest {
  conversationId: string
  buyerMessage: string
  orderId?: string       // present for post-order flows
}

interface ChatbotProcessResult {
  suggestedReply: string
  nextState: string
  nextSpecStep: SpecStep
  shouldEscalate: boolean
  specDraft: SpecDraft
}
```

---

## Database State

All conversation state is persisted to the `conversations` table.

| Column | Type | Purpose |
|--------|------|---------|
| `state` | `conversation_state` enum | Overall conversation lifecycle |
| `spec_step` | `text` | Current step in spec collection (`letters_text` / `color` / `size` / `confirm`) |
| `spec_draft` | `jsonb` | Accumulated spec values mid-conversation |
| `is_escalated` | `boolean` | True once handoff has been triggered |

**Conversation state machine:**

```
new → post_order_spec → order_confirmation
             │
             └──► human_handoff  (on escalation)
```

**RLS policy:** `conversations` is `service_role` only in Phase 1. All chatbot DB reads/writes use `createServiceClient()`. See [database.md](./database.md) for full policy details.

---

## Testing: Bot Playground

An internal test page at `/admin/chatbot-test` lets you run the full pipeline against a real DB conversation without needing a TikTok account.

**How to use:**
1. Navigate to `/admin/chatbot-test` in the dashboard sidebar
2. Click **New Session** — creates a real `conversations` row in the DB
3. Type as the buyer — messages go through the full pipeline
4. Watch the **debug panel** (right side) for live spec_draft accumulation and step progress

**Quick prompts available in the debug panel:**
- `Grace po` — simple text
- `"Lets go GSW" po na kulay red, XL` — all fields in one message
- `Talk to a real person please` — triggers escalation
- `YES` — confirms the spec

**API routes used by the Playground:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chatbot/playground-proxy` | GET | Creates a test session in DB, returns `conversationId` |
| `/api/chatbot/playground-proxy` | POST | Runs the full pipeline, returns `ChatbotProcessResult` |

Auth: session cookie (admin must be logged in). No API secrets required in the browser.

---

## API Routes

### `POST /api/chatbot/process`

The production endpoint — called by TikTok CS API webhooks.

**Auth:** `x-internal-secret` header must match `POLL_INTERNAL_SECRET` env var

**Request:**
```json
{
  "conversationId": "uuid",
  "buyerMessage": "Grace po, rose gold, M",
  "orderId": "uuid"
}
```

**Response (200):**
```json
{
  "suggestedReply": "Rose gold at M size, ang ganda naman! ...",
  "nextState": "post_order_spec",
  "nextSpecStep": "confirm",
  "shouldEscalate": false,
  "specDraft": {
    "lettersText": "Grace",
    "colorName": "rose gold",
    "sizeCm": 4,
    "quantity": 5
  }
}
```

**Error responses:**

| Code | Reason |
|------|--------|
| `400` | Missing or invalid `conversationId` / `buyerMessage` |
| `401` | Missing or invalid `x-internal-secret` |
| `500` | Pipeline error (conversation not found, OpenAI failure, DB write failure) |

---

## Shadow Mode Behavior

When `feature_flags.shadow_mode = true`:
- The pipeline runs fully (intent → spec → reply generation)
- The suggested reply is **logged and returned** in the API response
- The reply is **NOT sent** to TikTok
- `conversations.state` and `spec_draft` are still updated in the DB

This lets you observe bot behavior on real buyer messages before enabling auto-send.

See [shadow-mode.md](./shadow-mode.md) for full shadow mode strategy.

---

## Known Limitations & Planned Improvements

| Issue | Status |
|-------|--------|
| Color is stored as freeform string — not validated against the 23 official colors | Planned: add color list to extraction prompt |
| Font lookup requires a real order with `raw_payload.variant` | Playground shows "see order variant" fallback |
| Buyer can't change a single field after seeing the recap (e.g. "change color to blue") | Planned: detect field change intent in confirm step |
| No TikTok CS API send yet — pipeline generates replies but doesn't auto-send | Pending TikTok Partner Center approval |
