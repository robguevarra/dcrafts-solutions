/**
 * Reply Generator (T-C5)
 *
 * Generates the final buyer-facing reply using GPT-4o-mini.
 *
 * Brand voice rules (baked into system prompt):
 * - Shop: Dcrafts — custom paper cut letters (stationery), each piece hand-cut
 * - Tone: Warm, artisan pride, Filipino-English natural
 * - Filipino expressions used naturally: po, Salamat!, Sure po!, Pwede po!
 * - Max 3 sentences per reply (TikTok CS best practice)
 * - Always echo letter count when text is just captured
 * - Always end with a clear next action (the pending spec question)
 *
 * The "Answer + Redirect" pattern is implemented here:
 *   If the buyer went off-topic, GPT answers their question AND
 *   ends the reply with the pending spec question from specCollector.
 */

import OpenAI from 'openai'
import type { Intent, SpecStep, SpecDraft } from './types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are a friendly customer service agent for Dcrafts, a Filipino stationery shop that sells custom paper cut letters.

About our product:
- We sell individual paper cut letter pieces (not tumblers, mugs, or printed items)
- Each letter/character is a separate hand-cut paper piece
- Sold per piece: price depends on size (S=2cm, M=4cm, L=6cm, XL=8cm)
- 21 font styles and 23 color options available
- Buyers choose font at checkout via TikTok product variant

Your tone:
- Warm, helpful, proud of the craftsmanship
- Filipino-English mix is natural: use "po", "Salamat!", "Sure po!", "Pwede po!", "Ang ganda naman po niyan!"
- Keep replies SHORT — maximum 3 sentences
- Always end with a clear next action for the buyer (the spec question provided)
- When the buyer just gave you their text, echo the letter count: "GRACE — that's 5 pieces po!"
- Never make up prices — only confirm the size options

If the buyer goes off-topic or asks a question mid-spec, answer it briefly, then return to the pending spec question.`

export interface GenerateReplyParams {
  intent: Intent
  currentSpecStep: SpecStep
  /** The question to embed at the end of the reply (from specCollector) */
  pendingQuestion: string
  buyerMessage: string
  specDraft: SpecDraft
  /** Whether to generate a human handoff message instead of a spec reply */
  isEscalation?: boolean
  /** Font from TikTok order variant — shown at confirm */
  fontFromOrder?: string
}

/**
 * Generate a warm, brand-voice reply for the buyer.
 * Implements Answer + Redirect: answers tangents, ends with pending spec field.
 */
export async function generateReply(params: GenerateReplyParams): Promise<string> {
  const {
    buyerMessage,
    pendingQuestion,
    specDraft,
    isEscalation,
    currentSpecStep,
  } = params

  if (isEscalation) {
    return (
      'Pasensya na po! Inililipat ko na po kayo sa aming team ngayon. ' +
      'May isa sa aming staff na mag-aasikaso sa inyo agad. ' +
      'Salamat sa inyong pasensya po! 🙏'
    )
  }

  /** Context about spec progress so GPT knows what's already collected */
  const specContext = specDraft.lettersText
    ? `Already collected: text="${specDraft.lettersText}" (${specDraft.quantity} pieces)` +
      (specDraft.colorName ? `, color="${specDraft.colorName}"` : '') +
      (specDraft.sizeCm ? `, size=${specDraft.sizeCm}cm` : '')
    : 'No spec collected yet'

  const userPrompt = `Current spec step: ${currentSpecStep}
Spec collected so far: ${specContext}
Buyer's message: "${buyerMessage}"

The next question you MUST include at the end of your reply:
"${pendingQuestion}"

Write a reply (max 3 sentences, Filipino-English, warm) that:
1. Acknowledges or briefly answers what the buyer said
2. Ends with the pending question above (you may rephrase it to sound natural)`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    return (
      response.choices[0]?.message?.content?.trim() ??
      pendingQuestion // fallback: just ask the question directly
    )
  } catch {
    // Fail-safe: return just the spec question if OpenAI is down
    return `Hi po! ${pendingQuestion}`
  }
}
