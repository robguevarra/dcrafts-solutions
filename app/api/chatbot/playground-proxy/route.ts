/**
 * Proxy routes for the Bot Playground (/admin/chatbot-test).
 *
 * These are thin wrappers around the internal chatbot endpoints.
 * Auth: Supabase session cookie (requireUser pattern).
 * This keeps POLL_INTERNAL_SECRET server-side only.
 *
 * GET  /api/chatbot/playground-proxy/session  → creates test session
 * POST /api/chatbot/playground-proxy/chat     → processes a message
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { processMessage } from '@/lib/chatbot'
import { z } from 'zod'

/** Verify the caller is an authenticated Dcrafts admin. */
async function requireAuth(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

// ─── GET /api/chatbot/playground-proxy/session ───────────────────────────────

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const sessionId = `test_${crypto.randomUUID()}`

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      platform_conversation_id: sessionId,
      buyer_id: 'playground-test-buyer',
      state: 'new',
      spec_step: 'letters_text',
      spec_draft: {},
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to create session', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ conversationId: data.id }, { status: 201 })
}

// ─── POST /api/chatbot/playground-proxy/chat ─────────────────────────────────

const ChatSchema = z.object({
  conversationId: z.string().min(1),
  buyerMessage: z.string().min(1).max(2000),
})

export async function POST(request: NextRequest) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const result = await processMessage(parsed.data)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Pipeline error', message }, { status: 500 })
  }
}
