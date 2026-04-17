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

## Chatbot (Phase 2)

### `POST /api/chatbot/process`

**Not yet implemented.** Planned for T2.10.

```typescript
// Request body
{
  conversationId: string;
  incomingMessage: string;
  tiktokUserId: string;
}

// Response
{
  reply: string;
  state: ConversationState;
  wasSent: boolean;  // false in suggest mode
  suggestedReply?: string;
}
```

---

## TikTok CS API Proxy (Phase 2)

### `POST /api/tiktok/messages`

Proxy to TikTok CS Open API. Not yet implemented (T2.2).

Shadow mode guard: if `shadow_mode=true`, logs the intent but does **not** call TikTok.

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
