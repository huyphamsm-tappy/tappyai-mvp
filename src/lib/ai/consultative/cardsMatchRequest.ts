// ── One brain · a card is not shown beside listings that match what was asked for, when it does not (30/10/2026) ──────────
//
// The synthesis marks each listing group against the configuration the person asked for: 'khop' (matches), 'khac' (differs), 'chua_ro' (unclear).
// When at least one matches, the ones that differ or are unclear are left out of the card: a different model line standing next to the right
// ones reads as the same thing. When none matches (no configuration stated, or the lookup could not tell) nothing is left out. Pure; no words.

import { parseShoppingMarker, renderShoppingMarker } from './synthesisView'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

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
  const kept = view.entities.filter(e => consistent(e.name ?? e.config ?? ''))
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
