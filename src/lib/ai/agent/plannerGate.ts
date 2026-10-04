// ── AI Planner pre-search sufficiency gate: no destination → ONE question, ZERO external calls ─────────────────────────────────
//
// Phase 7 closeout 2F. Measured (UAT 04/10, frozen agent): "Lên kế hoạch du lịch cuối tuần" ran get_trip_data around the GPS city
// (10 Serper credits) and only then asked where to go. A trip plan cannot be planned without a destination, so the route answers
// that turn with one question BEFORE the agent runs (no model, no tool, no Serper). Deterministic and deliberately conservative —
// it fires only when NOTHING in the user's words could be a destination, so a named place is never questioned:
//   · a known city / airport city anywhere in the thread, or a stated destination slot → sufficient;
//   · terrain-only trips ("đi biển", "lên núi", "chỗ mát") → sufficient (the agent proposes a place);
//   · otherwise the latest message, once planning / time / party / budget filler is removed, must leave no word that could be a name.
// Typed prompts, the Planner button ("Lên kế hoạch du lịch cuối tuần"), the chat chip and suggested prompts all arrive as the same
// user message, so they all pass through this one gate.

import { normalizeVN } from '@/lib/ai/intent'
import { cityInText } from '@/lib/ai/tools/vietnamCities'
import { cityToIATA } from '@/lib/ai/tools/travel'

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Planning / time / party / budget / politeness words — none of them is a place. Whole-word, folded. */
// A regex LITERAL on purpose: a template-string RegExp matched in vitest and never in the production bundle (Phase 7 UAT 04/10).
const FILLER = /\b(?:len ke hoach|lap ke hoach|ke hoach|lich trinh|plan|trip|tour|du lich|di choi|di|choi|chuyen di|nghi duong|nghi|cuoi tuan|tuan sau|tuan nay|tuan toi|thang sau|thang nay|thang toi|ngay mai|mai|hom nay|dip le|le|tet|he|nay|toi|sau|\d+\s*ngay(?:\s*\d+\s*dem)?|\d+\s*dem|\d+n\d+d|ngay|dem|may ngay|cho|voi|cung|\d+\s*nguoi|nguoi|gia dinh|ban be|nguoi yeu|vo|chong|con|be|cap doi|mot minh|\d+\s*(?:trieu|tr|k|nghin|ngan)|trieu|ngan sach|tiet kiem|re|sang|giup|giup minh|giup tui|minh|tui|toi|em|anh|chi|nhe|nha|nhen|di nao|voi|duoc khong|khong|a|oi|tappy|mot|cai|nao|gi|dau|o dau|the nao|sao|can|muon|dinh|tinh|xem|thu|lam|hay|vui|dep|weekend|this|next|week|a|for|me|please|make|help|travel|vacation|holiday|days?|nights?)\b/g

/** Terrain / vibe words: the user wants a kind of place — the agent can propose one, so the plan is not blocked. */
const TERRAIN = /\b(?:bien|nui|dao|rung|thac|ho|song|cho mat|mat me|sinh thai|cam trai|camping|beach|mountain|island)\b/

/** Does the thread already name a destination (city, airport city, stated slot)? */
function threadHasDestination(userTexts: readonly string[], known?: Record<string, string> | null): boolean {
  if (known?.diem_den?.trim()) return true
  return userTexts.some(t => !!cityInText(t) || /\b(?:di|toi|den|ra|vao|ve|len|xuong|sang)\s+[a-z]/.test(fold(t)) && !!cityToIATA(fold(t).replace(/^.*\b(?:di|toi|den|ra|vao|ve|len|xuong|sang)\s+/, '')))
}

/**
 * True when a TRIP plan was asked for and no destination is known or nameable from the user's words → ask first, search nothing.
 * `userTexts` = the user's own messages of this consultation (oldest first); the last one is the current turn.
 */
export function plannerNeedsDestination(userTexts: readonly string[], known?: Record<string, string> | null): boolean {
  if (userTexts.length === 0) return false
  if (threadHasDestination(userTexts, known)) return false
  const last = fold(userTexts[userTexts.length - 1])
  if (TERRAIN.test(last)) return false
  const residue = last.replace(FILLER, ' ').replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim()
  return residue.length === 0
}

/** The one question (owner wording), adapted to whether the user said "cuối tuần". */
export function plannerDestinationQuestion(userText: string, lang: string): string {
  const weekend = /\bcuoi tuan\b|\bweekend\b/.test(fold(userText))
  if (lang === 'en') return `${weekend ? 'Where would you like to go this weekend?' : 'Where would you like to go?'} If you haven't decided yet, I can suggest a few places that fit.`
  return `${weekend ? 'Cuối tuần này bạn muốn đi đâu?' : 'Bạn muốn đi đâu?'} Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.`
}
