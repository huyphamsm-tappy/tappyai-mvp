// ── "GỢI Ý THÊM" REUSES THE SET ALREADY FETCHED (A1(d), 2026-09-20) ────────────────────────────
//
// Measured (Android B7 and the pre-release turn 6): "gợi ý thêm" after a place turn ran the whole
// two-step turn again — a fresh search (15 credits on a hotel turn), photos, 15–17 s — to name
// venues that were already in the 10 rows of the previous turn. The place search's arguments and
// the names the reply presented are now carried in the turn's decision-evidence row (the same
// durable store the shopping unit uses, ADR-024), and a follow-up that asks for MORE of the same
// set re-runs the identical call through the pre-search: the 30-minute search cache answers it
// on the same instance (0 credits, ~0 ms), a cold instance pays one search — never wrong rows,
// never a second model step — and the model is told which venues were already shown so it picks
// others. Logged (`tappyai_presearch reuse:true`); nothing about it is silent.
//
// This is deliberately NOT a stored copy of the rows: the tool wrapper must run so the ranking,
// the collector (cards), the hard-constraint gate and the audit sink see the turn exactly as any
// other place turn — the invariant the architecture lock protects.

import { normalizeVN } from '../intent'

export interface PlaceSearchEvidence {
  args: { query: string; type?: string; location?: string }
  /** The venues the reply presented (card #1–#3 / named in prose) — the model must pick others. */
  shown: string[]
  at: string
}

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

/**
 * "gợi ý thêm / chỗ khác / còn quán nào nữa / thêm vài chỗ / more options" — a request for more of
 * the SAME thing. A new constraint, area or subject in the same message is not this (the frame
 * reads it as a refinement and the directive searches afresh).
 */
const MORE_RE = /^(?:(?:cho|goi y|gioi thieu|de xuat|tim|xem|con)\s+)?(?:them|nua|khac)\b|\b(?:goi y|de xuat|cho|quan|cho|lua chon|option|options|place|places)\s+(?:them|khac|nua)\b|\bcon (?:quan|cho|cai|lua chon) nao (?:khac|nua)\b|\bthem (?:vai|may|1|2|3|mot vai|vai cai|vai cho|vai quan)\b|\b(?:more|other|another) (?:options?|places?|ones?|choices?|suggestions?)\b|\bshow me more\b|\banything else\b/

const FILLER = new Set(['nua', 'di', 'nhe', 'a', 'oi', 'cho', 'minh', 'toi', 'em', 'ban', 'voi', 'cai', 'chut', 'it', 'vai', 'may', 'them', 'khac', 'quan', 'cho', 'lua', 'chon', 'goi', 'y', 'de', 'xuat', 'con', 'nao', 'khong', 'co', 'gi', 'please', 'more', 'options', 'option', 'other', 'another', 'show', 'me', 'ones', 'places', 'place', 'else', 'anything', 'suggestions', 'choices', 'thu', 'xem', 'tim', 'gioi', 'thieu', '1', '2', '3', 'mot'])

export function wantsMoreFromSet(text: string): boolean {
  const f = fold(text).replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (f.length > 60 || !MORE_RE.test(f)) return false
  // "quán khác ở Phú Nhuận có chỗ đậu xe" asks for MORE and states a new area and constraint — that is
  // a refinement, not a reuse. Anything beyond the "more" phrase and a little filler disqualifies.
  const leftover = f.split(' ').filter(w => w && !FILLER.has(w))
  return leftover.length === 0
}

/** The stored evidence is usable only for the same place kind the user is still talking about. */
export function reusablePlaceSearch(ev: unknown, sameConsultation: boolean): PlaceSearchEvidence | null {
  if (!sameConsultation || !ev || typeof ev !== 'object') return null
  const ps = (ev as { placeSearch?: unknown }).placeSearch
  if (!ps || typeof ps !== 'object') return null
  const p = ps as Partial<PlaceSearchEvidence>
  if (!p.args || typeof p.args.query !== 'string') return null
  return { args: { query: p.args.query, ...(typeof p.args.type === 'string' ? { type: p.args.type } : {}), ...(typeof p.args.location === 'string' ? { location: p.args.location } : {}) }, shown: Array.isArray(p.shown) ? p.shown.filter((x): x is string => typeof x === 'string') : [], at: typeof p.at === 'string' ? p.at : '' }
}
