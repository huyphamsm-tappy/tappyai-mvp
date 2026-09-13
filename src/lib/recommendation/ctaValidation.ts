import { actionLabel } from './actionLabel'
import { isDirectEntityUrl } from '@/lib/links/directUrl'
import type { ActionKind } from './actions'
// The registry module only (providers + domain types): this file is client-bundled.
import { PROVIDER_REGISTRY } from '@/lib/ccp/registry'

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
const CCP_MERCHANT_HOSTS = new Set(PROVIDER_REGISTRY.flatMap(e => e.allowedHosts.map(h => h.toLowerCase())))

/**
 * CCP Phase 8 (owner-like UAT R1, P1-7 / P2-4): two model-authored buttons that no relabelling
 * can make honest, so they are DROPPED rather than downgraded.
 *
 *   · A ticket promise on a hotel OTA ("🎫 Tìm vé trên Booking.com" for a theme park): Booking
 *     and Agoda sell rooms; "search for tickets there" sends the user to a hotel search.
 *   · A front-door / search link on a merchant host the Commerce Capability Platform owns
 *     (cgv.vn, pasgo.vn, klook.com, dienmayxanh.com, trip.com — the registry allow-lists).
 *     The application is the only URL authority for those merchants: their verified handoff
 *     arrives on the card as a Commerce Link when one exists, and when none does the honest
 *     state is no button — not a homepage the model typed from memory. A DIRECT entity page
 *     on such a host (one the tool result carried) is left alone.
 */
export function isMisleadingModelCta(btn: ModelCtaButton): boolean {
  const host = hostOf(btn.url)
  if (!host) return false
  const kind = promisedKind(btn.label) ?? (btn.type === 'ticket' ? 'ticket' : null)
  if (kind === 'ticket' && HOTEL_OTA_HOST.test(host)) return true
  if (CCP_MERCHANT_HOSTS.has(host) && !isDirectEntityUrl(btn.url)) return true
  return false
}

/** Every button, validated. Order is preserved; only a button that cannot be made honest is dropped. */
export function validateModelCtaButtons(
  buttons: readonly ModelCtaButton[],
  t: (key: string, vars?: Record<string, string>) => string,
): ModelCtaButton[] {
  return buttons.filter(b => !isMisleadingModelCta(b)).map(b => validateModelCtaButton(b, t))
}
