/**
 * Spec Collector State Machine (T-C3)
 *
 * Pure function: given the current spec draft + buyer message,
 * extracts ALL provided spec fields in a SINGLE GPT call, then
 * advances to the first still-missing field.
 *
 * Design principles:
 * - ONE GPT call per turn (not one per field) — catches buyers who give
 *   text + color + size all in a single message.
 * - Text stored VERBATIM. Quoted text ("Lets go GSW") is extracted literally.
 *   No interpretation, no abbreviation, no word removal.
 * - Quantity derived from alphanumeric chars: "Lets go GSW" → "LetsgoGSW" → 9
 * - Font is NOT collected here — comes from orders.raw_payload variant metadata.
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

/**
 * Derives piece count from the text string.
 * Only alphanumeric characters count — spaces and punctuation do not.
 *
 * "Lets go GSW" → "LetsgoGSW" → 9 pieces
 * "Grace"       → "Grace"     → 5 pieces
 * "ROB@25"      → "ROB25"     → 5 pieces
 */
export function deriveQuantity(text: string): number {
  return text.replace(/[^a-zA-Z0-9]/g, '').length
}

// ─── Unified GPT Extractor ────────────────────────────────────────────────────

interface ExtractedFields {
  lettersText: string | null
  colorName: string | null
  sizeCm: number | null
  confirmed: boolean | null
}

/**
 * Single GPT call that extracts ALL spec fields present in the buyer's message.
 * This handles buyers who give text + color + size in a single message.
 *
 * VERBATIM rule for letters_text:
 * - If buyer used quotes: extract exactly what is inside the quotes.
 * - If no quotes: extract the entire indicated phrase as-is, removing only
 *   clearly separate Tagalog/English filler (po, sana, gusto ko, etc.).
 * - NEVER remove words from the intended text. NEVER abbreviate.
 */
async function extractAllSpecFields(buyerMessage: string): Promise<ExtractedFields> {
  const prompt = `You are a spec extractor for a paper cut letter stationery store. 
Extract ALL spec fields present in the buyer's message in one pass.

=== FIELD DEFINITIONS ===

letters_text (string | null):
  The EXACT verbatim text the buyer wants cut in paper letters.
  CRITICAL RULES — apply strictly:
  1. If the buyer wrapped the text in quotes ("..." or '...'), extract EXACTLY what
     is inside those quotes, character for character.
  2. If no quotes, extract every word of the intended text. Do NOT drop any words.
  3. NEVER abbreviate, NEVER interpret, NEVER remove words from the text itself.
  4. Only strip clearly separate conversational filler that is NOT part of the text:
     filipino fillers: po, sana, ate, kuya, na, gusto ko, yung, naman
     english fillers: please, thanks, I want, I'd like, can you make
  5. Preserve the buyer's exact capitalization and spacing inside the extracted text.

color (string | null):
  The color the buyer describes. Store as a simple descriptive string.
  If the buyer says "red" accept it; if they say "rose gold", store "rose gold".

size_cm (number | null):
  Map buyer's size mention to cm: S→2, M→4, L→6, XL→8.
  Words like "large" → 6, "extra large" or "xl" → 8, "small" → 2, "medium" → 4.

confirmed (true | false | null):
  Whether the buyer confirmed the spec summary. 
  true for: YES, yes, oo, sige, confirm, go, tama, yep, ok confirmed
  false for: NO, hindi, wait, ayaw, change, mali
  null if not a confirmation response.

=== EXAMPLES (read carefully) ===

Input: '"Lets go GSW" po na kulay red, XL'
Output: {"letters_text":"Lets go GSW","color":"red","size_cm":8,"confirmed":null}

Input: '"lets go GSW" po'
Output: {"letters_text":"lets go GSW","color":null,"size_cm":null,"confirmed":null}

Input: 'Grace po'
Output: {"letters_text":"Grace","color":null,"size_cm":null,"confirmed":null}

Input: 'HAPPY BIRTHDAY sana, rose gold, M'
Output: {"letters_text":"HAPPY BIRTHDAY","color":"rose gold","size_cm":4,"confirmed":null}

Input: 'gusto ko ROB@25'
Output: {"letters_text":"ROB@25","color":null,"size_cm":null,"confirmed":null}

Input: 'LETS GO WARRIORS!'
Output: {"letters_text":"LETS GO WARRIORS!","color":null,"size_cm":null,"confirmed":null}

Input: 'rose gold po'
Output: {"letters_text":null,"color":"rose gold","size_cm":null,"confirmed":null}

Input: 'XL'
Output: {"letters_text":null,"color":null,"size_cm":8,"confirmed":null}

Input: 'YES po'
Output: {"letters_text":null,"color":null,"size_cm":null,"confirmed":true}

Input: 'magkano po isang order'
Output: {"letters_text":null,"color":null,"size_cm":null,"confirmed":null}

=== BUYER MESSAGE ===
"${buyerMessage}"

Respond ONLY with valid JSON matching this exact shape:
{"letters_text": <string|null>, "color": <string|null>, "size_cm": <number|null>, "confirmed": <true|false|null>}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as {
      letters_text?: unknown
      color?: unknown
      size_cm?: unknown
      confirmed?: unknown
    }

    const sizeCm = typeof parsed.size_cm === 'number' ? parsed.size_cm : null
    const validSizes = [2, 4, 6, 8]

    return {
      lettersText: typeof parsed.letters_text === 'string' && parsed.letters_text.length > 0
        ? parsed.letters_text
        : null,
      colorName: typeof parsed.color === 'string' && parsed.color.length > 0
        ? parsed.color
        : null,
      sizeCm: sizeCm !== null && validSizes.includes(sizeCm) ? sizeCm : null,
      confirmed: typeof parsed.confirmed === 'boolean' ? parsed.confirmed : null,
    }
  } catch {
    return { lettersText: null, colorName: null, sizeCm: null, confirmed: null }
  }
}

// ─── Step Resolution ──────────────────────────────────────────────────────────

/**
 * Given a fully updated draft, returns the next step that still needs a value.
 * Follows the fixed order: letters_text → color → size → confirm.
 */
function resolveNextStep(draft: SpecDraft): SpecStep {
  if (!draft.lettersText) return 'letters_text'
  if (!draft.colorName)   return 'color'
  if (!draft.sizeCm)      return 'size'
  return 'confirm'
}

// ─── Main State Machine ───────────────────────────────────────────────────────

/**
 * Advance the spec collection state machine by one buyer message.
 *
 * Extracts ALL provided spec fields in a single GPT call, updates the draft,
 * then resolves the next missing step. Handles buyers who give multiple
 * fields in a single message without re-asking for already-provided values.
 *
 * @param currentStep     - Current step in the spec flow (for confirm handling)
 * @param buyerMessage    - Raw message from the buyer
 * @param currentDraft    - Accumulated spec values so far
 * @param fontFromOrder   - Font name from the TikTok order variant (shown at confirm)
 * @returns Next step, question to ask, updated draft, and whether any value was extracted
 */
export async function advanceSpec(
  currentStep: SpecStep,
  buyerMessage: string,
  currentDraft: SpecDraft,
  fontFromOrder?: string
): Promise<SpecCollectorResult> {
  // ── Extract all fields from the buyer's message ────────────────────────────
  const extracted = await extractAllSpecFields(buyerMessage)

  // ── Build updated draft ────────────────────────────────────────────────────
  const draft: SpecDraft = { ...currentDraft }
  let anyExtracted = false

  if (extracted.lettersText !== null) {
    draft.lettersText = extracted.lettersText
    draft.quantity    = deriveQuantity(extracted.lettersText)
    anyExtracted = true
  }
  if (extracted.colorName !== null) {
    draft.colorName = extracted.colorName
    anyExtracted = true
  }
  if (extracted.sizeCm !== null) {
    draft.sizeCm = extracted.sizeCm
    anyExtracted = true
  }

  // ── Handle the confirm step separately ────────────────────────────────────
  if (currentStep === 'confirm') {
    // The orchestrator reads extracted.confirmed to decide if it should write specs.
    // We stay on 'confirm' until the buyer says YES or asks to change something.
    const nextStep: SpecStep = 'confirm'
    const sizeLabel = { 2: 'S', 4: 'M', 6: 'L', 8: 'XL' }[draft.sizeCm ?? 0] ?? '—'
    const font = fontFromOrder ?? 'see order variant'
    const questionToAsk =
      extracted.confirmed === false
        ? `No problem po! What would you like to change? 😊`
        : `📋 Here's your order recap po:\n\n` +
          `• Text: ${draft.lettersText ?? '—'} (${draft.quantity ?? 0} pieces)\n` +
          `• Color: ${draft.colorName ?? '—'}\n` +
          `• Size: ${sizeLabel} (${draft.sizeCm}cm)\n` +
          `• Font: ${font} (from your order)\n\n` +
          `Reply YES to confirm, or let me know if you'd like to change anything! ✅`

    return {
      nextStep,
      questionToAsk,
      updatedDraft: draft,
      extracted: true,
      confirmed: extracted.confirmed ?? null,
    }
  }

  // ── Resolve next missing step ──────────────────────────────────────────────
  const nextStep = resolveNextStep(draft)

  // ── Build question for next step ───────────────────────────────────────────
  let questionToAsk: string
  if (nextStep === 'confirm') {
    const sizeLabel = { 2: 'S', 4: 'M', 6: 'L', 8: 'XL' }[draft.sizeCm ?? 0] ?? '—'
    const font = fontFromOrder ?? 'see order variant'
    questionToAsk =
      `📋 Here's your order recap po:\n\n` +
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
    extracted: anyExtracted,
    confirmed: null,
  }
}
