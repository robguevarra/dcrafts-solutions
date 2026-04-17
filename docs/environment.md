# Environment Variables

> Never commit secrets to git. `.env.local` is in `.gitignore`.  
> For new team members: request values from the project lead.

---

## All Variables

```bash
# ──────────────────────────────────────────────────
# TikTok Shop Open API
# ──────────────────────────────────────────────────
TTS_APP_KEY=                     # Your TikTok app key (from TikTok Partner Center)
TTS_APP_SECRET=                  # Your TikTok app secret

TIKTOK_WEBHOOK_SECRET=           # Secret used to verify HMAC-SHA256 signatures
                                 # Set this in TikTok Partner Center → Webhooks

# ──────────────────────────────────────────────────
# Supabase
# ──────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=        # e.g. https://xxxx.supabase.co
                                 # Public — safe to expose to browser

NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Publishable anon/service key
                                 # Public — used by browser Supabase client
                                 # Format: sb_publishable_...

SUPABASE_SERVICE_ROLE_KEY=       # Service role key (bypasses RLS)
                                 # SECRET — server-side only (webhooks, cron)
                                 # Format: sb_secret_...

# ──────────────────────────────────────────────────
# OpenAI (Phase 2)
# ──────────────────────────────────────────────────
OPENAI_API_KEY=                  # Used by chatbot intent detector + spec collector
                                 # Model: gpt-4o-mini

# ──────────────────────────────────────────────────
# Semaphore SMS (Phase 3)
# ──────────────────────────────────────────────────
SEMAPHORE_API_KEY=               # From semaphore.co dashboard
                                 # Used for wrong-order correction SMS
```

---

## Variable Usage Map

| Variable | Used in | Exposed to browser? |
|----------|---------|-------------------|
| `TTS_APP_KEY` | `lib/tiktok/*` | ❌ No |
| `TTS_APP_SECRET` | `lib/tiktok/webhook.ts` (signature) | ❌ No |
| `TIKTOK_WEBHOOK_SECRET` | `app/api/webhooks/tiktok/route.ts` | ❌ No |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts`, `lib/supabase/server.ts` | ✅ Yes (intentional) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/client.ts` | ✅ Yes (intentional) |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/server.ts` (service client only) | ❌ Never |
| `OPENAI_API_KEY` | `lib/chatbot/*` (Phase 2) | ❌ No |
| `SEMAPHORE_API_KEY` | `lib/sms/semaphore.ts` (Phase 3) | ❌ No |

---

## `.env.example` Template

Copy this file and fill in real values:

```bash
# TikTok Shop
TTS_APP_KEY=your_app_key_here
TTS_APP_SECRET=your_app_secret_here
TIKTOK_WEBHOOK_SECRET=your_webhook_secret_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx

# OpenAI (Phase 2)
OPENAI_API_KEY=sk-proj-xxxxx

# Semaphore (Phase 3)
SEMAPHORE_API_KEY=your_semaphore_key_here
```

---

## Security Notes

1. **`SUPABASE_SERVICE_ROLE_KEY`** bypasses all RLS policies. If this leaks, anyone can read/write all data. Keep it strictly server-side.
2. **`OPENAI_API_KEY`** has direct billing impact. Set usage limits in OpenAI dashboard.
3. **`TTS_APP_SECRET`** is used to verify incoming webhooks. If it leaks, attackers can spoof order events.
4. All variables without `NEXT_PUBLIC_` prefix are automatically excluded from the browser bundle by Next.js.
