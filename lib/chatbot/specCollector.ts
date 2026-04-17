/**
 * Spec Collector State Machine (T-C3)
 *
 * Pure function: given the current spec step + buyer message + accumulated draft,
 * returns the next step, a question to ask, and the updated draft.
 *
 * Design principles:
 * - Conversational flexibility via "Answer + Redirect" pattern:
 *   The buyer can go off-topic at any step. GPT answers their tangent AND
 *   re-surfaces the pending spec field at the end of every reply.
 * - Text stored VERBATIM. No case normalization. "Grace" stays "Grace".
 * - Quantity derived: lettersText.replace(/[^a-zA-Z0-9]/g,'').length
 * - Font is NOT collected here — it comes from orders.raw_payload variant metadata.
 */

import OpenAI from 'openai'
import type { SpecStep, SpecDraft, SpecCollectorResult } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Step Questions ───────────────────────────────────────────────────────────

const STEP_QUESTIONS: Record<SpecStep, string> = {
  letters_text:
    'What exact text would you like printed on your letters? (e.g. "Grace", "ROB@25", "HAPPY BIRTHDAY") 📝',
  color:
    'What color po? We have 23 color options — just describe it (e.g. "rose gold", "navy blue", "pastel pink") or say "show list" to see all options 🎨',
  size: 'What size po? S (2cm) / M (4cm) / L (6cm) / XL (8cm) 📏',
  confirm: '', // Built dynamically from the full draft
}

/** Derive quantity from a text string — alphanumeric characters only. */
export function deriveQuantity(text: string): number {
  return text.replace(/[^a-zA-Z0-9]/g, '').length
}

// ─── GPT Extraction ───────────────────────────────────────────────────────────

/**
 * Use GPT to extract the spec value for the current step from the buyer's message.
 * Returns null if no extractable value found (buyer went off-topic or was ambiguous).
 */
async function extractSpecValue(
  currentStep: SpecStep,
  buyerMessage: string
): Promise<string | null> {
  const extractionPrompts: Record<SpecStep, string> = {
    letters_text: `Extract the exact text the buyer wants printed on their paper letters.
Return ONLY the raw text string, preserving the buyer's exact capitalization and spacing.
If no clear text is provided, return null.
Examples: "Grace po" → "Grace", "HAPPY BIRTHDAY sana" → "HAPPY BIRTHDAY", "gusto ko ROB@25" → "ROB@25"
Buyer message: "${buyerMessage}"
Respond with JSON: { "value": "<extracted text or null>" }`,

    color: `Extract the color name from the buyer's message for their paper cut letters.
Return the color as a simple descriptive string.
If no color is mentioned, return null.
Examples: "rose gold sana" → "rose gold", "navy blue" → "navy blue", "blue and white" → "blue and white"
Buyer message: "${buyerMessage}"
Respond with JSON: { "value": "<color name or null>" }`,

    size: `Extract the size from the buyer's message. Valid sizes: S, M, L, XL.
Map to cm: S=2, M=4, L=6, XL=8. Return the size_cm number.
If no size is mentioned, return null.
Examples: "M po" → 4, "large" → 6, "xl" → 8, "small" → 2
Buyer message: "${buyerMessage}"
Respond with JSON: { "value": <number or null> }`,

    confirm: `Did the buyer confirm/agree? Return true if they said YES, yes, yep, oo, sige, confirm, etc.
Return false if they said NO, hindi, wait, ayaw, etc. Return null if unclear.
Buyer message: "${buyerMessage}"
Respond with JSON: { "value": <true | false | null> }`,
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'user', content: extractionPrompts[currentStep] },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { value?: unknown }

    if (parsed.value === null || parsed.value === undefined) return null
    return String(parsed.value)
  } catch {
    return null
  }
}

// ─── Main State Machine ───────────────────────────────────────────────────────

const STEP_ORDER: SpecStep[] = ['letters_text', 'color', 'size', 'confirm']

function nextStepAfter(current: SpecStep): SpecStep {
  const idx = STEP_ORDER.indexOf(current)
  return STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]
}

/**
 * Advance the spec collection state machine by one buyer message.
 *
 * @param currentStep - Current step in the spec flow
 * @param buyerMessage - Raw message from the buyer
 * @param currentDraft - Accumulated spec values so far
 * @param fontFromOrder - Font name from the TikTok order variant (shown at confirm)
 * @returns Next step, question to ask, updated draft, and whether a value was extracted
 */
export async function advanceSpec(
  currentStep: SpecStep,
  buyerMessage: string,
  currentDraft: SpecDraft,
  fontFromOrder?: string
): Promise<SpecCollectorResult> {
  const extracted = await extractSpecValue(currentStep, buyerMessage)
  const draft = { ...currentDraft }
  let nextStep = currentStep

  if (extracted !== null && extracted !== 'null') {
    // Apply extracted value to draft
    switch (currentStep) {
      case 'letters_text':
        draft.lettersText = extracted
        draft.quantity = deriveQuantity(extracted)
        nextStep = nextStepAfter(currentStep)
        break

      case 'color':
        draft.colorName = extracted
        nextStep = nextStepAfter(currentStep)
        break

      case 'size': {
        const sizeCm = Number(extracted)
        if ([2, 4, 6, 8].includes(sizeCm)) {
          draft.sizeCm = sizeCm
          nextStep = nextStepAfter(currentStep)
        }
        break
      }

      case 'confirm':
        // The orchestrator handles the actual DB write on YES confirmation
        nextStep = 'confirm'
        break
    }
  }

  // Build the question for the next step
  let questionToAsk: string
  if (nextStep === 'confirm') {
    const sizeLabel = { 2: 'S', 4: 'M', 6: 'L', 8: 'XL' }[draft.sizeCm ?? 0] ?? '—'
    const font = fontFromOrder ?? 'see order variant'
    questionToAsk = `📋 Here's your order recap po:\n\n` +
      `• Text: ${draft.lettersText ?? '—'} (${draft.quantity ?? 0} pieces)\n` +
      `• Color: ${draft.colorName ?? '—'}\n` +
      `• Size: ${sizeLabel} (${draft.sizeCm}cm)\n` +
      `• Font: ${font} (from your order)\n\n` +
      `Reply YES to confirm, or let me know if you'd like to change anything! ✅`
  } else {
    questionToAsk = STEP_QUESTIONS[nextStep]
  }

  return {
    nextStep,
    questionToAsk,
    updatedDraft: draft,
    extracted: extracted !== null && extracted !== 'null',
  }
}
