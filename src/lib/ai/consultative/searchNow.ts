// ── CONSULTATIVE V1 — the concrete first step for a vague place request ──────
//
// Measured 2026-09-18 (F7 "ăn gì ngon giờ", T5 "đi chơi ở đâu", both with GPS): three separate
// prompt rules said "assume and search now, never ask", and the reply was still one line —
// "Mình giả sử … phải không?" / "Bạn thích loại gì?" — with no tool call. Abstract rules do not
// move the model on these turns; a concrete instruction with the exact call does. The route
// cannot force a tool (architecture lock: toolChoice stays 'auto'), so the V1 block carries the
// call the model must make first, with arguments derived here from the frames — deterministic,
// no model involved in deciding it.
//
// Only for the VAGUE first turn: a place decision, no clarification pending, a low-confidence
// situation (assumptions made), a short message the forced-tool detector already read as a place
// search, and no movie-recommendation turn (its place tool is dropped on purpose).

import type { DecisionFrame } from './decisionFrame'
import type { SituationFrame } from './situationFrame'

export interface SearchNow { query: string; type: 'restaurant' | 'cafe' | 'spa' | 'bar' | 'attraction' | 'cinema' }

const MEAL_QUERY: Record<NonNullable<DecisionFrame['occasion']['meal']>, string> = {
  breakfast: 'quán ăn sáng ngon', lunch: 'quán ăn trưa ngon', dinner: 'quán ăn tối ngon', late: 'quán ăn khuya',
}

export const VAGUE_MAX_CHARS = 30

export function deriveSearchNow(input: {
  text: string
  situation: SituationFrame | null
  frame: DecisionFrame
  forcedTool: string | null
  isFirstReply: boolean
  movieRecommend: boolean
}): SearchNow | null {
  const { situation, frame } = input
  if (!situation || !input.isFirstReply || input.movieRecommend) return null
  if (!frame.placeDecision || frame.clarify) return null
  if (input.forcedTool !== 'search_places') return null
  if (situation.assumptions.length === 0 || situation.confidence >= 0.5) return null
  if (input.text.trim().length > VAGUE_MAX_CHARS) return null

  if (frame.domains.includes('food')) return { query: frame.occasion.meal ? MEAL_QUERY[frame.occasion.meal] : 'quán ăn ngon', type: 'restaurant' }
  if (frame.domains.includes('spa')) return { query: 'spa massage', type: 'spa' }
  if (frame.domains.includes('entertainment')) return { query: 'địa điểm vui chơi giải trí', type: 'attraction' }
  if (frame.domains.includes('travel')) return { query: 'điểm tham quan', type: 'attraction' }
  return null
}
