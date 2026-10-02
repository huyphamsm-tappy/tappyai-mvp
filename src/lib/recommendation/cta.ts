import type { Action, ActionKind } from './actions'
import type { Recommendation } from './recommendation'

// ── SERVER-AUTHORED [CTA_BUTTONS] ────────────────────────────────────────────
//
// 🔑 SAME WIRE FORMAT, DIFFERENT AUTHOR. `{label, type, url, primary}` is
// unchanged, all three clients keep their existing parsers, and the shared
// fixtures keep passing. The only thing that changes is who writes the URLs:
// the application, from its own builders, instead of the model from templates
// in the system prompt.
//
// 🚨 The model was never a safe URL author. It was given `{maps_link}` and
// `{website_uri}` and ~40 lines of platform templates, plus a self-check list
// telling it to verify its own output — a prompt-level guarantee standing in for
// a structural one, duplicating links the server had already built correctly.

/** The CTA `type` vocabulary the clients already understand. Nothing new is introduced. */
const CTA_TYPE: Record<ActionKind, string> = {
  maps: 'maps',
  directions: 'maps',
  website: 'website',
  order: 'website',
  delivery: 'website',
  booking: 'booking',
  reservation: 'booking',
  ticket: 'booking',
  purchase: 'search',
  review: 'website',
  call: 'call',
  social: 'website',
}

/**
 * Button text, by action and language.
 *
 * 🔑 "Find on ShopeeFood", not "Order on ShopeeFood", when `urlKind` is
 * `search`. The link lands on a results page for the venue's name and the venue
 * may not be listed there at all — so the copy differs from the data, not from
 * whoever remembered the distinction. This is what `urlKind` is FOR.
 */
const LABELS: Record<string, Record<ActionKind, string>> = {
  vi: {
    maps: '📍 Xem trên Maps', directions: '🧭 Chỉ đường', website: '🌐 Website',
    order: '🛵 Đặt món', delivery: '🛵 Giao hàng', booking: '🏨 Đặt phòng',
    reservation: '📅 Đặt chỗ', ticket: '🎟️ Mua vé', purchase: '🛒 Mua ngay',
    review: '⭐ Xem đánh giá', call: '📞 Gọi', social: '🔗 Xem thêm',
  },
  en: {
    maps: '📍 View on Maps', directions: '🧭 Directions', website: '🌐 Website',
    order: '🛵 Order', delivery: '🛵 Delivery', booking: '🏨 Book',
    reservation: '📅 Reserve', ticket: '🎟️ Tickets', purchase: '🛒 Buy now',
    review: '⭐ Read reviews', call: '📞 Call', social: '🔗 More',
  },
}

/** The `search` variant, for the kinds whose direct wording would overpromise. */
const SEARCH_LABELS: Record<string, Partial<Record<ActionKind, string>>> = {
  vi: { order: '🔎 Tìm trên', delivery: '🔎 Tìm trên', booking: '🔎 Tìm trên', purchase: '🔎 Tìm trên', review: '🔎 Tìm đánh giá' },
  en: { order: '🔎 Find on', delivery: '🔎 Find on', booking: '🔎 Find on', purchase: '🔎 Find on', review: '🔎 Search reviews' },
}

const dict = (lang: string) => LABELS[lang] ?? LABELS.vi
const searchDict = (lang: string) => SEARCH_LABELS[lang] ?? SEARCH_LABELS.vi

export function labelFor(a: Action, lang: string, placeName?: string): string {
  const search = a.urlKind === 'search' ? searchDict(lang)[a.kind] : undefined
  const base = search ?? dict(lang)[a.kind]
  const withPlatform = a.platform && search ? `${base} ${a.platform}` : a.platform ? `${base} — ${a.platform}` : base
  // A commerce handoff states its login boundary in the label (CGV before the seat map, Klook
  // before checkout) so the promise matches what the merchant will ask for after the tap.
  const withBoundary = a.commerce?.loginRequired ? `${withPlatform} (${LOGIN_NOTE[lang] ?? LOGIN_NOTE.vi})` : withPlatform
  return placeName ? `${withBoundary} — ${placeName}` : withBoundary
}

const LOGIN_NOTE: Record<string, string> = { vi: 'cần đăng nhập', en: 'login required' }

export interface CtaButton { label: string; type: string; url: string; primary: boolean }

/** How many buttons one reply may carry. Matches what the prompt asked the model for. */
const MAX_BUTTONS = 6

/**
 * Build the CTA block for a turn from its recommendations.
 *
 * Takes the top recommendations in rank order and their highest-priority
 * actions, so the button set mirrors the decision the ranker already made rather
 * than whichever venues the model happened to mention last.
 */
/**
 * The legacy `type` a commerce handoff renders with. A DIRECT merchant page is
 * never `search` — the table above maps `purchase` to `search` because every
 * pre-CCP purchase action was a marketplace search; a CCP product page is a
 * destination, so it takes `website` (opens the URL) like a shop's own site.
 * Booking/reservation/ticket keep the booking affordance. No new type value is
 * introduced (owner decision P6-A: the three-client contract is unchanged).
 */
export function ctaTypeFor(a: Pick<Action, 'kind' | 'urlKind' | 'commerce'>): string {
  if (a.commerce && a.urlKind === 'direct' && a.kind === 'purchase') return 'website'
  return CTA_TYPE[a.kind]
}

export function buildCtaButtons(recs: Recommendation[], lang: string): CtaButton[] {
  const out: CtaButton[] = []
  const seen = new Set<string>()
  // Round-robin across the top three so every named place gets its primary
  // action before any place gets a second one.
  const top = recs.slice(0, 3)
  const maxDepth = Math.max(0, ...top.map(r => r.contextualActions.length))
  for (let depth = 0; depth < maxDepth && out.length < MAX_BUTTONS; depth++) {
    for (const r of top) {
      if (out.length >= MAX_BUTTONS) break
      const a = r.contextualActions[depth]
      if (!a || seen.has(a.url)) continue
      seen.add(a.url)
      out.push({
        label: labelFor(a, lang, top.length > 1 ? r.entity.identity.name : undefined),
        type: ctaTypeFor(a),
        url: a.url,
        primary: out.length === 0,
      })
    }
  }
  return out
}

export const CTA_OPEN = '[CTA_BUTTONS]'
export const CTA_CLOSE = '[/CTA_BUTTONS]'

/** Render the block, or `''` when there is nothing actionable to offer. */
export function renderCtaBlock(recs: Recommendation[], lang: string): string {
  const buttons = buildCtaButtons(recs, lang)
  if (buttons.length === 0) return ''
  return `${CTA_OPEN}${JSON.stringify({ buttons })}${CTA_CLOSE}`
}

/**
 * Remove any CTA block the MODEL wrote.
 *
 * 🚨 Required, not optional. A prompt rule is not a guarantee: if the model
 * emits its own block anyway, the client's parser takes the FIRST match, so
 * which set of buttons the user gets would depend on ordering. Stripping first
 * makes the server's block the only one there is.
 */
export function stripModelCta(text: string): string {
  return text
    .replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/gi, '')
    .replace(/\[CTA_BUTTONS\][\s\S]*$/i, '')
    .replace(/\[\/?CTA_BUTTONS\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd()
}
