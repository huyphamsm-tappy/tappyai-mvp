import { placesRenderOrder, type PlacesLiveView } from '@/lib/recommendation/liveView'

// ── ONE source of truth for «how many options» (A3, owner 2026-10-02) ─────────────────────────────────────────────────
//
// Three numbers used to be computed three different ways and disagreed on the same screen:
//   · the filter chip «Tất cả (8)»       = the card set (PlacesLiveView.items, ≤ 8)
//   · the button «Xem thêm 5 chỗ»        = the cards behind the fold (placesRenderOrder(view).hidden)
//   · the text «Còn 18 lựa chọn nữa»     = search rows − bold names in the reply (hotel turn: 26 − 8, shopping: 6 cards − 3 names)
//
// The text now takes its N from the same card set the client renders, through the same function the client uses to split the set
// into «above the fold» and «behind Xem thêm». So  chip total = cards shown + N  holds by construction, in every domain that
// has a card set. A footer is offered only when N > 0 AND at least one card is shown — «Còn N lựa chọn nữa» under no card, or
// under a card list that already shows everything, points at nothing.

/** How many cards the fold shows. The client renders `placesRenderOrder(view).visible`, which honours `view.shown`. */
export const CARDS_SHOWN = 3

export interface FoldCounts {
  /** Options in the card set — the number on the «Tất cả (N)» chip. */
  total: number
  /** Cards visible above the fold. */
  shown: number
  /** Cards behind «Xem thêm N chỗ» — the N of the text footer. */
  hidden: number
}

export function placesFoldCounts(view: Pick<PlacesLiveView, 'items' | 'picked' | 'shown'> | null | undefined): FoldCounts {
  if (!view || !Array.isArray(view.items) || view.items.length === 0) return { total: 0, shown: 0, hidden: 0 }
  const { visible, hidden } = placesRenderOrder(view)
  return { total: view.items.length, shown: visible.length, hidden: hidden.length }
}

/** The N for «Còn N lựa chọn nữa»: the hidden cards, and only when a card is actually shown. */
export function footerRemaining(view: Pick<PlacesLiveView, 'items' | 'picked' | 'shown'> | null | undefined): number {
  const c = placesFoldCounts(view)
  return c.shown > 0 ? c.hidden : 0
}
