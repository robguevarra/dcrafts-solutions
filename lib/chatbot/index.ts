/**
 * Chatbot Orchestrator (T-C6)
 *
 * The single entry point for the chatbot pipeline. Called by the API route.
 * Ties together: intent detection → handoff check → spec collection → reply generation → DB persistence.
 *
 * Pipeline per turn:
 * 1. Load conversation + last 10 messages from DB
 * 2. Detect intent
 * 3. Check for escalation (short-circuits if true)
 * 4. Advance spec collection state machine
 * 5. Generate reply (Answer + Redirect pattern)
 * 6. Persist: INSERT message, UPDATE conversation state
 * 7. On confirm + YES: write print_specs (post-order) or pre_order_intents (pre-order)
 * 8. Return result to route handler
 */

import { createClient } from '@/lib/supabase/server'
import { detectIntent } from './intentDetector'
import { advanceSpec, deriveQuantity } from './specCollector'
import { checkHandoff } from './handoffDetector'
import { generateReply } from './replyGenerator'
import type {
  ChatbotProcessRequest,
  ChatbotProcessResult,
  ConversationRow,
  MessageRow,
  SpecDraft,
  SpecStep,
} from './types'
import type { Database } from '@/types/database'

/** Convenience alias for the resolved Supabase client */
type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type ConversationState = Database['public']['Enums']['conversation_state']

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function loadConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationRow | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id, state, spec_step, spec_draft, order_id, is_escalated')
    .eq('id', conversationId)
    .single()
  return data as ConversationRow | null
}

async function loadRecentMessages(
  supabase: SupabaseClient,
  conversationId: string
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, suggested_reply, was_sent, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)
  // DB role is plain string; cast to our union for type safety
  return ((data ?? []).reverse() as MessageRow[])
}

async function getFontFromOrder(
  supabase: SupabaseClient,
  orderId: string | null
): Promise<string | undefined> {
  if (!orderId) return undefined
  const { data } = await supabase
    .from('print_specs')
    .select('font_name')
    .eq('order_id', orderId)
    .single()
  return data?.font_name ?? undefined
}

async function persistTurn(
  supabase: SupabaseClient,
  conversationId: string,
  buyerMessage: string,
  suggestedReply: string,
  nextState: ConversationState,
  nextSpecStep: SpecStep,
  updatedDraft: SpecDraft,
  shouldEscalate: boolean,
  shadowMode: boolean
): Promise<void> {
  // Insert buyer message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'buyer',
    content: buyerMessage,
    was_sent: false,
  })

  // Insert bot suggested reply
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'bot',
    content: suggestedReply,
    suggested_reply: suggestedReply,
    was_sent: !shadowMode, // Only mark sent if shadow mode is off
  })

  // Update conversation state, spec progress, escalation flag
  await supabase
    .from('conversations')
    .update({
      state: nextState,
      spec_step: nextSpecStep,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spec_draft: updatedDraft as any,
      is_escalated: shouldEscalate,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

async function writeConfirmedSpec(
  supabase: SupabaseClient,
  draft: SpecDraft,
  orderId: string | null,
  buyerId: string
): Promise<void> {
  const specPayload = {
    letters_text: draft.lettersText,
    color_name: draft.colorName,
    size_cm: draft.sizeCm,
    quantity: draft.quantity ?? deriveQuantity(draft.lettersText ?? ''),
    confirmed_at: new Date().toISOString(),
  }

  if (orderId) {
    // Post-order: upsert into print_specs (linked to order)
    await supabase
      .from('print_specs')
      .upsert({ order_id: orderId, ...specPayload })
  } else {
    // Pre-order: insert into pre_order_intents
    await supabase.from('pre_order_intents').insert({
      tiktok_user_id: buyerId,
      letters_text: specPayload.letters_text,
      color_name: specPayload.color_name,
      size_cm: specPayload.size_cm,
      letter_case: null, // Not collected — text is verbatim
    })
  }
}

// ─── Shadow Mode Flag ─────────────────────────────────────────────────────────

// 60-second in-memory cache to avoid a DB read on every request
let shadowModeCache: { value: boolean; expiresAt: number } | null = null

async function getShadowMode(
  supabase: SupabaseClient
): Promise<boolean> {
  const now = Date.now()
  if (shadowModeCache && now < shadowModeCache.expiresAt) {
    return shadowModeCache.value
  }

  const { data } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('name', 'shadow_mode')
    .single()

  const value = data?.enabled ?? true
  shadowModeCache = { value, expiresAt: now + 60_000 }
  return value
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Process one buyer message through the full chatbot pipeline.
 * This is the only function imported by the API route.
 */
export async function processMessage(
  request: ChatbotProcessRequest
): Promise<ChatbotProcessResult> {
  const { conversationId, buyerMessage, orderId } = request
  const supabase = await createClient()

  // ── Load conversation state ────────────────────────────────────────────────
  const conversation = await loadConversation(supabase, conversationId)
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`)
  }

  const recentMessages = await loadRecentMessages(supabase, conversationId)
  const fontFromOrder = await getFontFromOrder(supabase, orderId ?? conversation.order_id)
  const shadowMode = await getShadowMode(supabase)

  const currentSpecStep: SpecStep = (conversation.spec_step as SpecStep) ?? 'letters_text'
  const currentDraft: SpecDraft = (conversation.spec_draft as SpecDraft) ?? {}
  // Safely cast state; ConversationRow state is typed as string from the DB cast
  let nextState = conversation.state as ConversationState

  // ── Step 1: Intent detection ───────────────────────────────────────────────
  const { intent } = await detectIntent(buyerMessage)

  // ── Step 2: Escalation check ───────────────────────────────────────────────
  const { shouldEscalate } = await checkHandoff(
    buyerMessage,
    recentMessages,
    currentSpecStep
  )

  if (shouldEscalate) {
    const suggestedReply = await generateReply({
      intent,
      currentSpecStep,
      pendingQuestion: '',
      buyerMessage,
      specDraft: currentDraft,
      isEscalation: true,
    })

    await persistTurn(
      supabase,
      conversationId,
      buyerMessage,
      suggestedReply,
      'human_handoff' as ConversationState,
      currentSpecStep,
      currentDraft,
      true,
      shadowMode
    )

    return {
      suggestedReply,
      nextState: 'human_handoff',
      nextSpecStep: currentSpecStep,
      shouldEscalate: true,
      specDraft: currentDraft,
    }
  }

  // ── Step 3: Spec collection ────────────────────────────────────────────────
  const { nextStep, questionToAsk, updatedDraft } = await advanceSpec(
    currentSpecStep,
    buyerMessage,
    currentDraft,
    fontFromOrder
  )

  // ── Step 4: Handle confirmed spec ──────────────────────────────────────────
  if (nextStep === 'confirm' && currentSpecStep === 'confirm') {
    // Check if buyer said YES in this message
    const confirmed = /^(yes|oo|sige|confirm|yep|yup|sure|ok|oke|okay)$/i.test(
      buyerMessage.trim()
    )

    if (confirmed && updatedDraft.lettersText) {
      await writeConfirmedSpec(
        supabase,
        updatedDraft,
        orderId ?? conversation.order_id,
        conversation.id // buyer_id not on ConversationRow; use conversation.id as proxy
      )
      nextState = 'order_confirmation' as ConversationState
    }
  } else if (nextStep === 'confirm') {
    nextState = 'post_order_spec' as ConversationState
  }

  // ── Step 5: Generate reply ─────────────────────────────────────────────────
  const suggestedReply = await generateReply({
    intent,
    currentSpecStep: nextStep,
    pendingQuestion: questionToAsk,
    buyerMessage,
    specDraft: updatedDraft,
    fontFromOrder,
  })

  // ── Step 6: Persist turn ───────────────────────────────────────────────────
  await persistTurn(
    supabase,
    conversationId,
    buyerMessage,
    suggestedReply,
    nextState,
    nextStep,
    updatedDraft,
    false,
    shadowMode
  )

  return {
    suggestedReply,
    nextState,
    nextSpecStep: nextStep,
    shouldEscalate: false,
    specDraft: updatedDraft,
  }
}
