/**
 * Intent Detector (T-C2)
 *
 * Single GPT-4o-mini call that classifies a buyer message into one of 5 intents.
 * Uses structured JSON output for reliable parsing.
 * Fails safe: returns { intent: 'general', confidence: 0 } on any OpenAI error.
 */

import OpenAI from 'openai'
import type { Intent, IntentResult } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are a classifier for a Filipino stationery shop called Dcrafts that sells custom paper cut letters.
Each letter is an individual hand-cut paper piece sold per piece.

Classify the buyer's message into EXACTLY ONE of these intents:
- "pre_order": Buyer is asking about products, pricing, fonts, colors, or sizes before placing an order
- "post_order_spec": Buyer has already placed an order and wants to provide or clarify the print specification (what text, color, size)
- "complaint": Buyer has an issue with a received order (wrong text, damaged, missing pieces, color mismatch)
- "tracking": Buyer is asking about shipping status, delivery timeline, or order tracking
- "general": Anything else (greetings, thank you, random questions)

Respond with a valid JSON object only: { "intent": "<intent>", "confidence": <0.0 to 1.0> }`

/**
 * Classify a buyer message into one of 5 intent categories.
 * Never throws — returns fallback on failure.
 */
export async function detectIntent(buyerMessage: string): Promise<IntentResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 60,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buyerMessage },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { intent?: string; confidence?: number }

    const validIntents: Intent[] = [
      'pre_order',
      'post_order_spec',
      'complaint',
      'tracking',
      'general',
    ]

    const intent = validIntents.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : 'general'

    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5

    return { intent, confidence }
  } catch {
    // Fail safe — never crash the pipeline over intent detection
    return { intent: 'general', confidence: 0 }
  }
}
