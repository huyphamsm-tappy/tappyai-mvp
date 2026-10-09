// ── Phase 8 M5 — the ranking contract: Luna's semantic order, carried to the cards (TAPPY_AGENT=2, web) ─────────────────────────
//
// Luna ranks the valid candidates itself (candidateSet.ts hands it the hard-constrained set in provider order, with no score). Its
// prose names the choice; at the end of the reply it adds ONE machine line the user never sees:
//
//   [TAPPY_RANK]{"picks":[{"name":"…","why":"…","tradeoff":"…","fits":"…","refs":["S1"]}],"none":false,"confidence":"medium"}[/TAPPY_RANK]
//
//   · picks — ONLY the candidates Luna genuinely recommends, in its order (1, 2 or 3; never padded to a count);
//   · none  — nothing fits: no card carries a recommendation, and no filler card is shown;
//   · why / tradeoff / fits — short QUALITATIVE rationale for the card ("Vì sao" / trade-off). A figure in them is dropped from the card:
//     numbers belong in the prose, where the M4 evidence-aware guards check them;
//   · confidence, refs — carried for the trace; no numeric score exists anywhere in the contract.
//
// Code only validates: the block is parsed and removed from the reply BEFORE any guard runs; each pick must name a candidate the tools
// returned this turn (unknown names are dropped, never invented); text is length-capped, de-linked, secret- and instruction-filtered.
// The card layer renders this order — it does not rank (no filler from row order, no re-homing to a fixed rating/reviews/distance
// reason). A reply without the block keeps the pre-M5 behaviour: cards follow the venues Luna named, in the order it named them.

import { cutSecrets, isInstructionLike } from '../guards'
import { quantitiesIn } from '@/lib/ai/guardEvidence'
import type { Recommendation, RecommendationReason } from '@/lib/recommendation/recommendation'
import { parseShoppingMarker, renderShoppingMarker, type SynthesisView } from '@/lib/ai/consultative/synthesisView'

export const RANK_OPEN = '[TAPPY_RANK]'
export const RANK_CLOSE = '[/TAPPY_RANK]'
export const MAX_PICKS = 5

export interface RankedPick { name: string; why: string | null; tradeoff: string | null; fits: string | null; refs: string[] }
export interface RankingContract { picks: RankedPick[]; none: boolean; confidence: 'high' | 'medium' | 'low' | null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = cutSecrets(v.replace(/\*\*|__|`/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+|www\.\S+/gi, ' ')).text.replace(/\s+/g, ' ').trim()
  if (!t || isInstructionLike(t)) return null
  return t.slice(0, max)
}
/** A card reason must be qualitative: numbers stay in the guarded prose. */
const qualitative = (s: string | null): string | null => s && quantitiesIn(s).length === 0 ? s : null

/**
 * Removes every ranking block from the reply and parses the LAST complete one. An unclosed block (truncated stream) is removed to the
 * end of the text and treated as absent. Never throws.
 */
export function extractRanking(text: string): { text: string; contract: RankingContract | null; malformed: boolean } {
  // Tolerant of how the model spells the tags: "[ TAPPY_RANK ]", "[/ TAPPY_RANK]", any case (measured M5 eval: "[ TAPPY_RANK ]…[ /TAPPY_RANK ]"
  // was not removed, the guards mangled its JSON and it reached the user).
  if (!/tappy_rank/i.test(text)) return { text, contract: null, malformed: false }
  const bodies: string[] = []
  let out = text.replace(/\[\s*TAPPY_RANK\s*\]([\s\S]*?)\[\s*\/\s*TAPPY_RANK\s*\]/gi, (_m, body: string) => { bodies.push(body); return '' })
  const open = out.search(/\[\s*TAPPY_RANK\s*\]/i)
  if (open >= 0) out = out.slice(0, open)
  // Anything left that still names the tag (a stray closing tag, a mangled fragment) goes with its line.
  out = out.split('\n').filter(l => !/tappy_rank/i.test(l)).join('\n')
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  const raw = bodies.at(-1)
  if (raw === undefined) return { text: out, contract: null, malformed: true }
  try {
    const j = JSON.parse(raw.trim()) as Record<string, unknown>
    const picks: RankedPick[] = []
    const seen = new Set<string>()
    for (const p of Array.isArray(j.picks) ? j.picks : []) {
      if (!p || typeof p !== 'object') continue
      const o = p as Record<string, unknown>
      const name = clean(o.name, 120)
      if (!name || seen.has(fold(name))) continue
      seen.add(fold(name))
      picks.push({ name, why: clean(o.why, 160), tradeoff: clean(o.tradeoff, 160), fits: clean(o.fits, 120), refs: (Array.isArray(o.refs) ? o.refs : []).filter((x): x is string => typeof x === 'string' && /^S\d{1,2}$/.test(x)).slice(0, 5) })
      if (picks.length >= MAX_PICKS) break
    }
    const confidence = j.confidence === 'high' || j.confidence === 'medium' || j.confidence === 'low' ? j.confidence : null
    return { text: out, contract: { picks, none: j.none === true || picks.length === 0, confidence }, malformed: false }
  } catch {
    return { text: out, contract: null, malformed: true }
  }
}

/** The candidate a pick names: exact (folded) first, else the ONE candidate whose name contains it or is contained by it. */
export function matchPick(pick: string, names: readonly string[]): number {
  const p = fold(pick)
  if (p.length < 2) return -1
  const exact = names.findIndex(n => fold(n) === p)
  if (exact >= 0) return exact
  const partial = names.map((n, i) => ({ f: fold(n), i })).filter(x => x.f.length >= 4 && p.length >= 4 && (x.f.includes(p) || p.includes(x.f)))
  return partial.length === 1 ? partial[0].i : -1
}

export interface AppliedRanking<T> { items: T[]; matched: number; unmatched: number; none: boolean }

/**
 * Place / hotel cards in Luna's order: ONLY the ranked candidates (no filler), the first one `recommended` with Luna's qualitative
 * rationale and trade-off. `none` → no card. No pick matching a candidate → null (the caller keeps the pre-M5 behaviour).
 */
export function applyRankingToRecs(recs: readonly Recommendation[], c: RankingContract): AppliedRanking<Recommendation> | null {
  if (c.none) return { items: [], matched: 0, unmatched: 0, none: true }
  const names = recs.map(r => r.entity.identity.name ?? '')
  const out: Recommendation[] = []
  let unmatched = 0
  for (const p of c.picks) {
    const i = matchPick(p.name, names)
    if (i < 0 || out.includes(recs[i])) { unmatched++; continue }
    // A LOW-confidence ranking orders the cards but crowns none: a label must not claim more than Luna's own confidence (and its prose) does.
    const first = out.length === 0 && c.confidence !== 'low'
    const why = qualitative(p.why)
    const trade = qualitative(p.tradeoff)
    const reasons: RecommendationReason[] = first && why ? [{ attribute: 'rationale', evidence: why }] : []
    out.push({ ...recs[i], rank: out.length, shortlistPosition: out.length + 1, role: null, recommended: first, reasons, tradeOff: first && trade ? { attribute: 'tradeoff', evidence: trade } : null, ...(why ? { summary: why } : {}) })
  }
  if (!out.length) return null
  return { items: out, matched: out.length, unmatched, none: false }
}

/**
 * The shopping card in Luna's order: only the ranked entities, Luna's first pick `recommended`, its qualitative rationale as the
 * recommendation reason. `none` → no card (null marker). No pick matching an entity → the marker unchanged.
 */
export function applyRankingToShoppingMarker(marker: string, c: RankingContract): { marker: string | null; applied: boolean; matched: number; unmatched: number } {
  const { view } = parseShoppingMarker(marker)
  if (!view) return { marker, applied: false, matched: 0, unmatched: 0 }
  if (c.none) return { marker: null, applied: true, matched: 0, unmatched: 0 }
  const names = view.entities.map(e => e.name ?? e.config ?? '')
  const ordered: SynthesisView['entities'] = []
  let unmatched = 0
  for (const p of c.picks) {
    const i = matchPick(p.name, names)
    if (i < 0 || ordered.includes(view.entities[i])) { unmatched++; continue }
    ordered.push({ ...view.entities[i], recommended: ordered.length === 0 && c.confidence !== 'low' })
  }
  if (!ordered.length) return { marker, applied: false, matched: 0, unmatched }
  const first = c.picks.find(p => matchPick(p.name, names) >= 0)!
  const why = qualitative(first.why), trade = qualitative(first.tradeoff)
  const next: SynthesisView = {
    ...view,
    entities: ordered.map(e => ({ ...e, recommended: e === ordered[0] && c.confidence !== 'low' })),
    recommendation: c.confidence === 'low' ? null : { entityKey: ordered[0].key, seller: null, reasons: why ? [{ attribute: 'rationale', evidence: why }] : [], tradeOff: trade ? { attribute: 'tradeoff', evidence: trade } : null, conditional: false },
  }
  return { marker: renderShoppingMarker(next), applied: true, matched: ordered.length, unmatched }
}

/**
 * The shopping card WITHOUT a crowned option: no entity is `recommended`, no recommendation block. Used when the agent runtime has no
 * ranking of Luna's to carry (no block, none matching, or the decision record absent) — the engine's own pick is not Luna's decision, and
 * the label "NÊN CHỌN" must not appear next to a reply that says it cannot conclude (UAT-10, 2026-10-09). A marker that does not parse
 * is returned unchanged.
 */
export function withoutRecommendation(marker: string): string {
  const { view } = parseShoppingMarker(marker)
  if (!view) return marker
  return renderShoppingMarker({ ...view, entities: view.entities.map(e => ({ ...e, recommended: false })), recommendation: null })
}
