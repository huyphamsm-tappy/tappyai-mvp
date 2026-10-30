// ── One brain · a card is not shown beside listings that match what was asked for, when it does not (30/10/2026) ──────────
//
// The synthesis marks each listing group against the configuration the person asked for: 'khop' (matches), 'khac' (differs), 'chua_ro' (unclear).
// When at least one matches, the ones that differ or are unclear are left out of the card: a different model line standing next to the right
// ones reads as the same thing. When none matches (no configuration stated, or the lookup could not tell) nothing is left out. Pure; no words.

import { parseShoppingMarker, renderShoppingMarker } from './synthesisView'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** A capacity, size or power ("256gb", "6l", "1000w", "13inch") says WHICH VARIANT, not which model: it is left out when two names are compared. */
const MEASURE = /^\d+(?:gb|tb|mb|kb|mah|hz|ghz|mhz|kg|g|ml|l|w|v|inch|in|mm|cm|m|k|p|hp|btu)$/

/**
 * The answer names no listing, so the card is the tools'. A listing whose NUMBERS (generation, capacity, model code) appear nowhere in the answer is
 * another model of the same family ("16 Pro Max" under an answer about the "15 Pro Max"): it is left out. A listing with no number is kept (nothing to
 * contradict), a capacity written with a space ("256 GB") still counts, and when nothing is consistent the card is left as it was. Pure; no words.
 */
export function cardsConsistentWithAnswer(marker: string, answer: string): string {
  const { view } = parseShoppingMarker(marker)
  if (!view) return marker
  const prose = fold(answer.replace(/\[TAPPY_[A-Z_]+\][\s\S]*?(?:\[\/TAPPY_[A-Z_]+\]|$)/g, ' '))
  const words = new Set(prose.split(' '))
  const compact = prose.replace(/ /g, '')
  const consistent = (name: string): boolean => fold(name).split(' ').filter(t => /\d/.test(t)).every(t => words.has(t) || (/[a-z]/.test(t) && compact.includes(t)))
  const consistentOnes = view.entities.filter(e => consistent(e.name ?? e.config ?? ''))
  if (consistentOnes.length === 0) return marker
  // A name the answer only ever says as the front part of a longer card's name is that longer model ("Pro" inside "Pro Max"): the shorter card goes.
  const P = prose.split(' ').filter(t => !MEASURE.test(t)) // measures are left out of the answer's tokens too, so "Daikin 1HP Inverter" reads as "Daikin Inverter" on both sides
  const core = (name: string): string[] => fold(name).split(' ').filter(t => t && !MEASURE.test(t))
  const countSeq = (seq: readonly string[]): number => { let n = 0; for (let i = 0; i + seq.length <= P.length; i++) if (seq.every((t, k) => P[i + k] === t)) n++; return n }
  const swallowed = (x: string, others: readonly string[]): boolean => {
    const cx = core(x)
    if (cx.length === 0) return false
    const c1 = countSeq(cx)
    if (c1 === 0) return false
    return others.some(y => {
      const cy = core(y)
      for (let i = 0; i + cx.length < cy.length; i++) {
        if (!cx.every((t, k) => cy[i + k] === t)) continue
        const ext = cy.slice(i + cx.length, i + cx.length + 3)
        if (countSeq([...cx, ...ext]) === c1) return true // `ext` is never empty here: the loop bound leaves at least one token after the front part
      }
      return false
    })
  }
  const names = consistentOnes.map(e => e.name ?? e.config ?? '')
  const kept = consistentOnes.filter((e, i) => !swallowed(names[i], names.filter((_, j) => j !== i)))
  if (kept.length === 0 || kept.length === view.entities.length) return marker
  const crownedKept = view.recommendation ? kept.some(e => e.key === view.recommendation!.entityKey) : false
  return renderShoppingMarker({ ...view, entities: kept.map(e => (crownedKept ? e : { ...e, recommended: false })), recommendation: crownedKept ? view.recommendation : null })
}

export function onlyMatchingCards(marker: string): string {
  const { view } = parseShoppingMarker(marker)
  if (!view) return marker
  const kept = view.entities.filter(e => e.matchesRequest === 'khop')
  if (kept.length === 0 || kept.length === view.entities.length) return marker
  const crownedKept = view.recommendation ? kept.some(e => e.key === view.recommendation!.entityKey) : false
  return renderShoppingMarker({
    ...view,
    entities: kept.map(e => (crownedKept ? e : { ...e, recommended: false })),
    recommendation: crownedKept ? view.recommendation : null,
  })
}
