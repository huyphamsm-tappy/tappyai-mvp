import { actionLabel } from './actionLabel'
import { isDirectEntityUrl } from '@/lib/links/directUrl'
import type { ActionKind } from './actions'

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

/** Every button, validated. Order and count are preserved — nothing is dropped. */
export function validateModelCtaButtons(
  buttons: readonly ModelCtaButton[],
  t: (key: string, vars?: Record<string, string>) => string,
): ModelCtaButton[] {
  return buttons.map(b => validateModelCtaButton(b, t))
}
