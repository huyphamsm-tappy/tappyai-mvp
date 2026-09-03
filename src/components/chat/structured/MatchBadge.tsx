'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SynthesisEntityView } from '@/lib/ai/consultative/synthesisView'

// ── P4-03/P4-16 · MatchBadge (DD-008: Extract → Generalise → Improve) ───────
//
// Extracted verbatim from `ShoppingDecision.tsx`, where it has been shipping since Phase 9. Same
// three verdicts, same labels, same colours — this is a MOVE, not a redesign, so the component it
// came from keeps behaving exactly as its tests already pin.
//
// Generalised only in that it is now entity-agnostic: nothing about it mentions shopping, so a
// place, a product or a merchant can carry the same verdict without a second component.
//
// A verdict, never a score. The design system is explicit that confidence is expressed as a match
// verdict rather than a percentage, because users over-read numbers the model cannot justify.

export type MatchVerdict = SynthesisEntityView['matchesRequest']

const MATCH_CLS: Record<MatchVerdict, string> = {
  khop: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  khac: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  chua_ro: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

const MATCH_KEY: Record<MatchVerdict, string> = {
  khop: 'shoppingDecision.matchExact',
  khac: 'shoppingDecision.matchDifferent',
  chua_ro: 'shoppingDecision.matchUnknown',
}

/**
 * Colour is never the only carrier of meaning — the label is always rendered as text, so the
 * verdict survives greyscale, colour blindness and a screen reader alike.
 */
export default function MatchBadge({ m }: { m: MatchVerdict }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${MATCH_CLS[m]}`}>
      {t(MATCH_KEY[m])}
    </span>
  )
}
