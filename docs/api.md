# API Reference

All routes are Next.js App Router Route Handlers (`app/api/*/route.ts`).

---

## Webhooks

### `POST /api/webhooks/tiktok`

Receives `ORDER_STATUS_CHANGE` events from TikTok Shop.

**Auth:** HMAC-SHA256 signature in `x-tts-signature` header  
**Source:** `lib/tiktok/webhook.ts`

#### Request

TikTok sends raw JSON with this shape:

```json
{
  "type": 1,
  "shop_id": "...",
  "timestamp": 1713200000,
  "data": {
    "order_id": "TK-001",
    "order_status": "AWAITING_SHIPMENT",
    "buyer_uid": "uid_xyz",
    "buyer_username": "Juan dela Cruz"
  }
}
```

**Event type mapping:**

| TikTok `type` | Meaning | Handled? |
|---------------|---------|----------|
| `1` | ORDER_STATUS_CHANGE | ✅ Yes |
| Other | Other events | Ignored |

#### Response

```json
{ "ok": true }
```

Always returns `200` immediately. Processing is async.

#### TikTok Status → Internal Status Mapping

| TikTok `order_status` | Internal `status` |
|-----------------------|-------------------|
| `UNPAID`, `ON_HOLD` | `pending_spec` |
| `AWAITING_SHIPMENT`, `AWAITING_COLLECTION` | `spec_collected` |
| `IN_TRANSIT`, `DELIVERED`, `COMPLETED` | `shipped` |
| `CANCELLED` | `cancelled` |
| (anything else) | `pending_spec` |

#### Error Responses

| Code | Reason |
|------|--------|
| `401` | Invalid or missing `x-tts-signature` |
| `500` | `TIKTOK_WEBHOOK_SECRET` env var not set |

---

## Orders (Phase 1 — server component data, no separate route yet)

Order data is fetched directly in Server Components via `lib/supabase/server.ts`.

A dedicated REST API (`/api/orders/[id]`) will be added in T1.9 for client-side navigation.

---

## Chatbot

See [chatbot.md](./chatbot.md) for full pipeline documentation.

### `POST /api/chatbot/process`

Production endpoint — intended for TikTok CS API webhooks once Partner Center is approved.

**Auth:** `x-internal-secret` header = `POLL_INTERNAL_SECRET` env var  
**Source:** `app/api/chatbot/process/route.ts`

```typescript
// Request
{
  conversationId: string;   // UUID of existing conversations row
  buyerMessage: string;     // Raw message text from buyer (max 2000 chars)
  orderId?: string;         // Optional — links spec to an order
}

// Response (200)
{
  suggestedReply: string;   // GPT-generated reply in Dcrafts brand voice
  nextState: string;        // New conversations.state value
  nextSpecStep: string;     // 'letters_text' | 'color' | 'size' | 'confirm'
  shouldEscalate: boolean;  // True if handoff triggered
  specDraft: {
    lettersText?: string;   // Verbatim text to print
    colorName?: string;     // Freeform color description
    sizeCm?: number;        // 2 | 4 | 6 | 8
    quantity?: number;      // Derived from lettersText (alphanumeric count)
  };
}
```

**Error responses:**

| Code | Reason |
|------|--------|
| `400` | Missing / invalid request fields |
| `401` | Missing or wrong `x-internal-secret` |
| `500` | Pipeline error (DB, OpenAI, conversation not found) |

---

### `GET /api/chatbot/playground-proxy`

Creates a fresh test conversation in the DB for the Bot Playground.

**Auth:** Supabase session cookie (admin must be logged in)  
**Source:** `app/api/chatbot/playground-proxy/route.ts`

```typescript
// Response (201)
{ conversationId: string }  // UUID of newly created conversations row
```

### `POST /api/chatbot/playground-proxy`

Runs the full chatbot pipeline. Same response shape as `POST /api/chatbot/process`.

**Auth:** Supabase session cookie (admin must be logged in)

```typescript
// Request
{
  conversationId: string;
  buyerMessage: string;
}
// Response — same shape as /api/chatbot/process
```

---

## SMS (Phase 3)

### `POST /api/sms/send`

Proxy to Semaphore SMS API. Not yet implemented (T3.2).

```typescript
// Request body
{
  orderId: string;
  phone: string;
  message: string;
}

// Response
{
  ok: boolean;
  semaphoreMessageId?: string;
}
```

---

## Internal Utilities

### `lib/utils.ts`

```typescript
cn(...inputs: ClassValue[]): string
// Merges Tailwind class names, handles conflicts.

formatOrderTime(unixSeconds: number): string
// Formats unix timestamp to Philippine local time.
// e.g. "Apr 16, 02:18 PM"

truncate(str: string, maxLength: number): string
// Truncates with ellipsis.
```

### `lib/supabase/client.ts`

```typescript
createClient(): SupabaseClient<Database>
// Browser-side. Use in Client Components only.
```

### `lib/supabase/server.ts`

```typescript
createClient(): Promise<SupabaseClient<Database>>
// Server-side. Reads auth cookies. Use in Server Components + Route Handlers.

createServiceClient(): SupabaseClient<Database>
// Service role (bypasses RLS). Use ONLY in server-side webhook handlers.
// NEVER pass to client.
```

### `lib/tiktok/webhook.ts`

```typescript
verifyTikTokWebhookSignature(
  rawBody: string,
  receivedSignature: string,
  appSecret: string
): boolean
// Constant-time HMAC-SHA256 comparison. Returns false on any mismatch.

normalizeTikTokOrder(payload: TikTokWebhookPayload): NormalizedOrder
// Converts raw TikTok payload to our internal order shape, ready for upsert.
```
