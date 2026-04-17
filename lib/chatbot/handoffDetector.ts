/**
 * Handoff Detector (T-C4)
 *
 * Determines whether the conversation should be escalated to a human agent.
 * Checks 4 escalation triggers — any one is sufficient to escalate.
 *
 * Runs BEFORE spec collection each turn so the spec machine never runs
 * on a conversation that needs urgent human attention.
 */

import OpenAI from 'openai'
import type { HandoffResult, MessageRow } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Keyword Trigger ─────────────────────────────────────────────────────────

const ESCALATION_KEYWORDS = [
  'refund',
  'wrong order',
  'wrong text',
  'defective',
  'damaged',
  'missing',
  'complaint',
  'complain',
  'manager',
  'supervisor',
  'report',
  'magrereklamo',
  'ireklamo',
  'ibalik',
  'ibabalik',
  'hindi tama',
  'mali',
]

function hasEscalationKeyword(message: string): boolean {
  const lower = message.toLowerCase()
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Explicit Human Request ───────────────────────────────────────────────────

const HUMAN_REQUEST_PHRASES = [
  'talk to a human',
  'real person',
  'human agent',
  'real agent',
  'tao na',
  'makipag-usap sa tao',
  'hindi bot',
  'live agent',
  'customer service',
  'cs representative',
]

function wantsHuman(message: string): boolean {
  const lower = message.toLowerCase()
  return HUMAN_REQUEST_PHRASES.some((phrase) => lower.includes(phrase))
}

// ─── Loop Detection ───────────────────────────────────────────────────────────

/**
 * Detect if the same spec step has been asked 3+ consecutive times without progress.
 * Indicates the bot is stuck and a human should take over.
 */
function isStuck(recentMessages: MessageRow[], currentSpecStep: string): boolean {
  const botMessages = recentMessages
    .filter((m) => m.role === 'bot')
    .slice(-4) // Last 4 bot messages
  if (botMessages.length < 3) return false

  // Count how many of the last 3 bot messages contain the same step question keyword
  const stepKeywords: Record<string, string> = {
    letters_text: 'exact text',
    color: 'color po',
    size: 'size po',
  }
  const keyword = stepKeywords[currentSpecStep]
  if (!keyword) return false

  const matchCount = botMessages.filter((m) =>
    m.content.toLowerCase().includes(keyword)
  ).length

  return matchCount >= 3
}

// ─── GPT Sentiment Check ─────────────────────────────────────────────────────

async function isHighlyNegative(buyerMessage: string): Promise<boolean> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 40,
      messages: [
        {
          role: 'user',
          content: `Is this buyer message highly negative, angry, or expressing strong dissatisfaction?
Message: "${buyerMessage}"
Respond with JSON: { "negative": true or false, "score": 0.0 to 1.0 }`,
        },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { negative?: boolean; score?: number }
    return parsed.negative === true && (parsed.score ?? 0) > 0.7
  } catch {
    return false
  }
}

// ─── Main Detector ────────────────────────────────────────────────────────────

/**
 * Check all 4 escalation triggers. Returns on the first match.
 *
 * Order of checks (cheapest first):
 * 1. Keyword match (free — no API call)
 * 2. Explicit human request (free)
 * 3. Loop detection (free)
 * 4. GPT sentiment (1 API call — only if above 3 pass)
 */
export async function checkHandoff(
  buyerMessage: string,
  recentMessages: MessageRow[],
  currentSpecStep: string
): Promise<HandoffResult> {
  if (hasEscalationKeyword(buyerMessage)) {
    return { shouldEscalate: true, reason: 'complaint_keyword' }
  }

  if (wantsHuman(buyerMessage)) {
    return { shouldEscalate: true, reason: 'explicit_human_request' }
  }

  if (isStuck(recentMessages, currentSpecStep)) {
    return { shouldEscalate: true, reason: 'spec_loop_detected' }
  }

  const negative = await isHighlyNegative(buyerMessage)
  if (negative) {
    return { shouldEscalate: true, reason: 'high_negative_sentiment' }
  }

  return { shouldEscalate: false }
}
