import type { CommerceLink, IntentType, LinkKind, TransactionDepth } from '../domain/types'
import { handoffTypeOf } from '../row'

// ── Commerce Link → the canonical action vocabulary ─────────────────────────
// On the canonical tree the application's ONE action list is
// src/lib/recommendation/actions.ts (`Action{kind,urlKind,url,labelKey,…}`),
// and the `[CTA_BUTTONS]` wire format is produced from it by
// src/lib/recommendation/cta.ts. CCP therefore does not author buttons; it
// hands the action layer two facts it cannot derive on its own — which KIND of
// action an intent is, and whether a link kind is a destination or a search —
// and the action layer does the rest (labels, priority, dedupe, channels).
//
// `projectToCta` below is the D8 shape from the 77b0bb7-era design. It is kept
// for the native-client contract discussion (Phase 7) and for its tests; the
// canonical web path does not call it.

/** The subset of `ActionKind` a commerce intent maps to. Same spelling as actions.ts, by contract. */
export type CommerceActionKind = 'purchase' | 'booking' | 'reservation' | 'ticket' | 'order' | 'delivery'

/** What a user DOES when they follow a link for this intent. */
export function actionKindFor(intentType: IntentType): CommerceActionKind {
  switch (intentType) {
    case 'buy_product': return 'purchase'
    case 'buy_spa_voucher': return 'purchase'
    case 'book_hotel': return 'booking'
    // A flight or a coach seat is a TICKET the user buys ("Mua vé trên Vietnam Airlines",
    // "Tìm vé trên Vexere"), not a room booking — the label vocabulary follows the purchase.
    case 'book_flight': return 'ticket'
    case 'book_transport': return 'ticket'
    case 'buy_event_ticket': return 'ticket'
    case 'reserve_table': return 'reservation'
    case 'order_delivery': return 'delivery'
    case 'buy_ticket': return 'ticket'
    case 'book_activity': return 'ticket'
  }
}

/**
 * The honesty field. Only a SEARCH_HANDOFF opens a results page; every other
 * kind lands on the subject itself (detail, configured, checkout) — tracked or
 * not, because a validated wrapper resolves to the same destination (D4).
 */
export function urlKindFor(kind: LinkKind): 'direct' | 'search' {
  return kind === 'SEARCH_HANDOFF' ? 'search' : 'direct'
}

// ── Legacy CTA projection (owner decision D8) ────────────────────────────────
// The existing [CTA_BUTTONS] contract (web ChatInterface.tsx, Android
// ChatCtaButtons.kt, iOS) carries `{label,type,url,primary}` with type ∈
// maps|call|zalo|website|booking|search|internal_booking. `internal_booking`
// is a fake in-app booking and is NOT used by CCP.

export interface CommerceCta {
  label: string
  /** Legacy type the current clients understand. */
  type: 'booking' | 'website' | 'search'
  url: string
  primary: boolean
  // ── D8 fields ──
  commerce: {
    provider: string
    merchant: string
    linkKind: LinkKind
    depth: TransactionDepth
    guestDepth: TransactionDepth
    authRequiredAt: CommerceLink['authRequiredAt']
    /** 'merchant_login' | 'guest' | 'app' — what the user should expect after tapping. */
    handoff: 'guest' | 'merchant_login' | 'app'
    freshnessType: CommerceLink['freshness']['freshnessType']
    retrievedAt: string
    expiresAt: string | null
    tracked: boolean
    /** User-facing sentence(s), already localised by the adapter (vi). */
    note: string
  }
}

// Legacy type: 'booking' for every flow that ends in a reservation, ticket or
// voucher (the clients render those with the booking affordance), 'website'
// for a shopping product page, 'search' for a results page.
function legacyType(link: CommerceLink): CommerceCta['type'] {
  if (link.kind === 'SEARCH_HANDOFF') return 'search'
  if (link.domain === 'shopping') return 'website'
  return 'booking'
}

// One definition of the handoff type (row.ts) serves the row, this projection and the clients.
const handoffOf = (link: CommerceLink): CommerceCta['commerce']['handoff'] => handoffTypeOf(link.authRequiredAt)

const VERB: Record<string, string> = {
  shopping: 'Mua tại',
  travel: 'Đặt tại',
  food_drink: 'Đặt bàn tại',
  entertainment: 'Mua vé tại',
  spa: 'Đặt tại',
}

export function projectToCta(link: CommerceLink, opts: { primary?: boolean; label?: string } = {}): CommerceCta {
  const handoff = handoffOf(link)
  const verb = VERB[link.domain] ?? 'Mở'
  const label = opts.label ?? (handoff === 'merchant_login' ? `${verb} ${link.merchantName} (cần đăng nhập)` : `${verb} ${link.merchantName}`)
  return {
    label,
    type: legacyType(link),
    url: link.url,
    primary: opts.primary ?? true,
    commerce: {
      provider: link.providerId,
      merchant: link.merchantId,
      linkKind: link.kind,
      depth: link.depth,
      guestDepth: link.depthProfile.guestDepth,
      authRequiredAt: link.authRequiredAt,
      handoff,
      freshnessType: link.freshness.freshnessType,
      retrievedAt: link.freshness.retrievedAt,
      expiresAt: link.expiresAt,
      tracked: link.tracking.mode !== 'none',
      note: link.limitations.join(' '),
    },
  }
}
