import type { CommerceLink, LinkKind, TransactionDepth } from '../domain/types'

// ── CTA projection (owner decision D8) ───────────────────────────────────────
// The existing [CTA_BUTTONS] contract (web ChatInterface.tsx, Android
// ChatCtaButtons.kt, iOS) carries `{label,type,url,primary}` with type ∈
// maps|call|zalo|website|booking|search|internal_booking. `internal_booking`
// is a fake in-app booking and is NOT used by CCP.
//
// This projection is the SERVER-SIDE shape a Commerce Link takes on its way to
// a client. It keeps the legacy four fields so today's clients render it
// unchanged (type 'booking' for merchant flows, 'website' for detail pages)
// and adds the commerce fields D8 requires. Clients that do not know the extra
// fields ignore them; the three-client extension is Phase 6 and needs the
// owner's go on the seam.

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

function handoffOf(link: CommerceLink): CommerceCta['commerce']['handoff'] {
  if (link.authRequiredAt === 'app_only') return 'app'
  if (link.authRequiredAt === 'none' || link.authRequiredAt === 'at_order') return 'guest'
  return 'merchant_login'
}

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
