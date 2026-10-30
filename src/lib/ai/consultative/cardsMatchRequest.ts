// ── One brain · a card is not shown beside listings that match what was asked for, when it does not (30/10/2026) ──────────
//
// The synthesis marks each listing group against the configuration the person asked for: 'khop' (matches), 'khac' (differs), 'chua_ro' (unclear).
// When at least one matches, the ones that differ or are unclear are left out of the card: a different model line standing next to the right
// ones reads as the same thing. When none matches (no configuration stated, or the lookup could not tell) nothing is left out. Pure; no words.

import { parseShoppingMarker, renderShoppingMarker } from './synthesisView'

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
