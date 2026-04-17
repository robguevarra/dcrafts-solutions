/**
 * POST /api/chatbot/test-session
 *
 * Creates a fresh test conversation in the DB and returns its ID.
 * Used exclusively by the Bot Playground (/admin/chatbot-test).
 * Requires x-internal-secret header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-internal-secret') === process.env.POLL_INTERNAL_SECRET
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
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
      { error: 'Failed to create test session', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ conversationId: data.id }, { status: 201 })
}
