/**
 * POST /api/chatbot/process (T-C7)
 *
 * The single external entry point for the chatbot pipeline.
 * Called by:
 *   - The Messaging Studio Playground tab (in-browser testing)
 *   - The TikTok CS webhook handler (once CS API is approved)
 *   - Future: automated polling job
 *
 * Auth: x-internal-secret header (same pattern as poll-tiktok-orders)
 * Shadow mode: read from feature_flags table — fully runtime-toggleable
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processMessage } from '@/lib/chatbot'

// ─── Request Schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  buyerMessage: z.string().min(1, 'buyerMessage is required').max(2000),
  orderId: z.string().optional(),
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = request.headers.get('x-internal-secret')
  return secret === process.env.POLL_INTERNAL_SECRET
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse + validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Run the chatbot pipeline
  try {
    const result = await processMessage(parsed.data)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Pipeline error', message },
      { status: 500 }
    )
  }
}

// Block other HTTP methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
