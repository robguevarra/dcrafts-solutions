/**
 * Chatbot Core — Shared Types (T-C1)
 *
 * Why DB-persisted state:
 *   Vercel is stateless across invocations. State lives in `conversations`
 *   so the pipeline works correctly across edge nodes and server restarts.
 *
 * Spec collection design:
 *   4 steps only: letters_text → color → size → confirm
 *   Font is NOT collected by the bot — it comes from the TikTok order variant
 *   metadata (orders.raw_payload) and is shown at confirm only.
 *   letter_case is NOT a separate step — text is stored verbatim ("Grace", "ROB@25").
 */

// ─── Intent ──────────────────────────────────────────────────────────────────

/** Buyer message classification. Used by intentDetector. */
export type Intent =
  | 'pre_order'       // Buyer hasn't placed an order yet; asking about products/pricing
  | 'post_order_spec' // Buyer placed an order; needs to provide print spec
  | 'complaint'       // Issue with received order (wrong, damaged, missing)
  | 'tracking'        // Asking about shipping / delivery status
  | 'general'         // Anything else

export interface IntentResult {
  intent: Intent
  confidence: number // 0–1
}

// ─── Spec Collection ─────────────────────────────────────────────────────────

/**
 * The 4 steps of spec collection.
 * Each step maps to one field the bot needs to collect before writing print_specs.
 */
export type SpecStep = 'letters_text' | 'color' | 'size' | 'confirm'

/**
 * Accumulated spec values mid-conversation.
 * Stored as JSONB in conversations.spec_draft.
 * Written to print_specs only on 'confirm' + buyer says YES.
 */
export interface SpecDraft {
  /** Exact text to print. Stored VERBATIM — no normalization, no case change.
   *  "Grace" stays "Grace", "ROB@25" stays "ROB@25". */
  lettersText?: string
  /** One of 23 available colors. Extracted from buyer's freeform description. */
  colorName?: string
  /** Mapped from S/M/L/XL: S=2, M=4, L=6, XL=8 */
  sizeCm?: number
  /** Derived: lettersText.replace(/[^a-zA-Z0-9]/g, '').length
   *  Spaces and emoji don't count. "HAPPY BIRTHDAY" = 12 pieces. */
  quantity?: number
}

// ─── Spec Collector Output ───────────────────────────────────────────────────

export interface SpecCollectorResult {
  nextStep: SpecStep
  questionToAsk: string
  updatedDraft: SpecDraft
  /** True if the bot successfully extracted at least one value from this buyer message */
  extracted: boolean
  /** Only set when currentStep === 'confirm': true = buyer said YES, false = NO/change, null = unclear */
  confirmed: boolean | null
}

// ─── Handoff ─────────────────────────────────────────────────────────────────

export interface HandoffResult {
  shouldEscalate: boolean
  reason?: string
}

// ─── Orchestrator I/O ────────────────────────────────────────────────────────

export interface ChatbotProcessRequest {
  conversationId: string
  buyerMessage: string
  /** Present for post-order flows. Absent for pre-order (spec goes to pre_order_intents). */
  orderId?: string
}

export interface ChatbotProcessResult {
  suggestedReply: string
  /** New value of conversations.state after this turn */
  nextState: string
  /** New value of conversations.spec_step after this turn */
  nextSpecStep: SpecStep
  shouldEscalate: boolean
  specDraft: SpecDraft
}

// ─── DB Row Shapes (subset — only what chatbot modules read) ─────────────────

export interface ConversationRow {
  id: string
  state: string
  spec_step: SpecStep
  spec_draft: SpecDraft
  order_id: string | null
  is_escalated: boolean
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'buyer' | 'bot' | 'agent'
  content: string
  suggested_reply: string | null
  was_sent: boolean
  created_at: string
}
