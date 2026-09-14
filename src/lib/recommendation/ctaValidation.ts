import { actionLabel } from './actionLabel'
import { isDirectEntityUrl } from '@/lib/links/directUrl'
import type { ActionKind } from './actions'
// The registry module only (providers + domain types): this file is client-bundled.
import { PROVIDER_REGISTRY } from '@/lib/ccp/registry'
import { searchTemplates } from '@/lib/ccp/adapters'

// ── MODEL-AUTHORED CTA BUTTONS, VALIDATED DETERMINISTICALLY ─────────────────
//
// 🚨 THE MEASURED DEFECT. While `SERVER_AUTHORED_CTA` is off the model writes
// its own `[CTA_BUTTONS]`, and `parseCTA` returned `parsed.buttons` with NO
// validation at all — label, type and url straight from the model to the render.
// On the event turn 2026-09-09 that produced:
//
//     "🎫 Ticketbox - Mua vé sự kiện"  →  https://ticketbox.vn/
//
// a purchase promise pointing at an aggregator HOMEPAGE, on a turn that had just
// said it found no events. The card layer has been honest about this since
// `actionLabel` was written — a `search` URL renders "Tìm vé trên …", never
// "Mua vé" — but a model-authored button never went through it.
//
// 🔑 THE URL DECIDES THE KIND, THE LABEL NEVER DOES. A button cannot be promoted
// from search to purchase by writing a stronger word: `urlKind` is derived from
// the URL with `isDirectEntityUrl` — the same test the ticket prose rules use —
// and the label is then RE-DERIVED from `actionLabel`. Nothing here invents a
// destination: a downgraded button keeps its URL and only stops over-promising.

/** A button as the model wrote it. */
export interface ModelCtaButton {
  label: string
  type: string
  url: string
  primary?: boolean
}

/**
 * Labels that PROMISE a completed transaction, mapped to the action kind they
 * claim. Anything not listed here is left exactly as the model wrote it — this
 * validator narrows over-promises, it does not rewrite prose.
 */
const PROMISE_KINDS: ReadonlyArray<[RegExp, ActionKind]> = [
  [/(mua vé|đặt vé|mua ve|dat ve|buy tickets?|book tickets?|get tickets?)/iu, 'ticket'],
  [/(đặt phòng|dat phong|book (?:a )?(?:room|hotel)|reserve (?:a )?room)/iu, 'booking'],
  [/(đặt bàn|dat ban|đặt chỗ|dat cho|book (?:a )?table|reserve (?:a )?table)/iu, 'reservation'],
  [/(đặt món|dat mon|gọi món|goi mon|order now|đặt hàng|dat hang)/iu, 'order'],
  [/(mua ngay|mua hàng|mua hang|buy now|purchase now)/iu, 'purchase'],
]

/** The kind a label claims, or null when it promises nothing. */
export function promisedKind(label: string): ActionKind | null {
  for (const [re, kind] of PROMISE_KINDS) if (re.test(label)) return kind
  return null
}

/**
 * Validate one model-authored button against its own URL.
 *
 * A promise backed by a direct entity-level URL stands. A promise backed by a
 * homepage or a search page is DOWNGRADED: the label is re-derived through
 * `actionLabel` for the same kind at `urlKind: 'search'`, which is where "Tìm vé
 * trên {platform}" comes from, and the wire `type` becomes `search` so no
 * downstream reader can mistake it for a purchase.
 */
export function validateModelCtaButton(
  btn: ModelCtaButton,
  t: (key: string, vars?: Record<string, string>) => string,
): ModelCtaButton {
  const kind = promisedKind(btn.label)
  if (!kind) return btn
  if (isDirectEntityUrl(btn.url)) return btn
  return {
    ...btn,
    type: 'search',
    label: actionLabel({ kind, urlKind: 'search', url: btn.url, attributed: false }, t),
  }
}

/** Hotel OTAs: a hotel search there is an honest "Tìm phòng"; a TICKET promise there is not. */
const HOTEL_OTA_HOST = /(^|\.)(booking\.com|agoda\.[a-z.]+|traveloka\.[a-z.]+)$/i

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** Hosts the Commerce Capability Platform owns the handoff for (registry allow-lists, exact). */
const CCP_MERCHANT_HOSTS = new Set(PROVIDER_REGISTRY.flatMap(e => e.allowedHosts.map(h => h.toLowerCase().replace(/^www\./, ''))))
/** The marketplaces' declared search grammars (URL prefixes) — honest L2 searches the registry itself projects. */
// Only a grammar that CARRIES the query is an honest search button. A front-door template (Agoda,
// Vexere — declared so the legacy builders stay registry projections) is a front door here, and a
// model button on it ("🏨 Agoda - Phú Quốc" → agoda.com/vi-vn/, live UAT 14 Sep 2026) is dropped.
const MARKETPLACE_SEARCH_PREFIXES = searchTemplates().filter(t => t.template.includes('{q}')).map(t => t.template.slice(0, t.template.indexOf('{q}')))
const isMarketplaceSearchLink = (url: string) => MARKETPLACE_SEARCH_PREFIXES.some(p => url.startsWith(p))

/**
 * CCP Phase 8 (owner-like UAT R1, P1-7 / P2-4): two model-authored buttons that no relabelling
 * can make honest, so they are DROPPED rather than downgraded.
 *
 *   · A ticket promise on a hotel OTA ("🎫 Tìm vé trên Booking.com" for a theme park): Booking
 *     and Agoda sell rooms; "search for tickets there" sends the user to a hotel search.
 *   · On a merchant host the Commerce Capability Platform owns (cgv.vn, klook.com,
 *     dienmayxanh.com, trip.com, shopee.vn, tiktok — the registry allow-lists): a bare FRONT DOOR
 *     (cgv.vn/), or a search page carrying a transaction PROMISE ("Mua ngay" on a search
 *     page). The application is the only URL authority for those merchants: their
 *     verified handoff arrives on the card as a Commerce Link when one exists. A DIRECT entity
 *     page on such a host is left alone, and so is an honest search link — the marketplaces'
 *     registry search grammars in particular (owner decision 14 Sep 2026), which the
 *     downgrade below labels as searches.
 */
export function isMisleadingModelCta(btn: ModelCtaButton): boolean {
  const host = hostOf(btn.url)
  if (!host) return false
  // Completion Pass live UAT (14 Sep 2026): "🚌 Vexere - Phương Trang" pointed at a redBus page. A
  // label that NAMES a registry merchant must point at that merchant — anything else is a
  // mislabelled destination, and no relabelling can make it honest.
  if (namesOtherMerchant(btn.label, host)) return true
  const kind = promisedKind(btn.label) ?? (btn.type === 'ticket' ? 'ticket' : null)
  if (kind === 'ticket' && HOTEL_OTA_HOST.test(host)) return true
  if (!CCP_MERCHANT_HOSTS.has(host)) return false
  // The marketplaces' registry search grammars are honest as searches (the downgrade below labels
  // them so) — unless the label promises a transaction the page cannot make.
  if (isMarketplaceSearchLink(btn.url)) return !!kind
  let path = '/'
  try { path = new URL(btn.url).pathname.replace(/\/+$/, '') || '/' } catch { return true /* unparseable on a CCP host */ }
  // A front door: the root, or a one-word section like tiktok.com/shop — never a product slug.
  // A locale segment ("/vi-vn/", "/vn/vi/") is not a subject: agoda.com/vi-vn/ is a front door.
  const segments = path.split('/').filter(Boolean).filter(s => !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(s))
  if (segments.length === 0 || (segments.length === 1 && !/[-.\d]/.test(segments[0]))) return true
  if (isDirectEntityUrl(btn.url)) return false
  return !!kind
}

/** Registry merchants by name (longest first, so "ShopeeFood" is matched before "Shopee"). */
const MERCHANTS_BY_NAME = PROVIDER_REGISTRY
  .map(e => ({ name: e.merchantName, re: new RegExp(`(?<![\\p{L}\\p{N}])${e.merchantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'), hosts: e.allowedHosts.map(h => h.toLowerCase().replace(/^www\./, '')) }))
  .sort((a, b) => b.name.length - a.name.length)

/** Does the label name a registry merchant whose hosts do not include the URL's host? */
function namesOtherMerchant(label: string, host: string): boolean {
  const named = MERCHANTS_BY_NAME.find(m => m.re.test(label))
  return !!named && !named.hosts.includes(host)
}

/** Every button, validated. Order is preserved; only a button that cannot be made honest is dropped. */
export function validateModelCtaButtons(
  buttons: readonly ModelCtaButton[],
  t: (key: string, vars?: Record<string, string>) => string,
): ModelCtaButton[] {
  return buttons.filter(b => !isMisleadingModelCta(b)).map(b => validateModelCtaButton(b, t))
}
