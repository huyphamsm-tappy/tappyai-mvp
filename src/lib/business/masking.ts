// Tappy Business — what a tracking link may echo back.
//
// ============================================================================
// WHY MASK AT ALL, WHEN THE CUSTOMER TYPED THIS THEMSELVES
// ============================================================================
// The tracking URL is a bearer credential the customer is told to copy and
// share, and P0 §24 assumes it WILL leak: browser history, a screenshot, a
// forwarded Zalo message, a link-preview bot that fetches every URL it sees.
//
// So the reader of a tracking page is not necessarily the person who placed the
// order. The page has to be useful to the customer — "yes, that is my order,
// and the shop has my details" — without being a place to read a stranger's
// phone number and address.
//
// ============================================================================
// FOLLOWS `maskEmail` IN src/lib/admin/users/fieldVisibility.ts
// ============================================================================
// Two rules taken from it deliberately:
//
//   * FIXED-WIDTH masks. `090••••567` would leak the number's length; `09••••567`
//     does not. Repeating the real length narrows a guess.
//   * A value that is not the shape we expect reveals NOTHING rather than being
//     split on an assumption — a malformed value is exactly when a naive split
//     leaks the part it meant to hide.
//
// These are deliberately NOT the admin module's functions: importing
// `@/lib/admin/*` into Business would pull the admin permission model into a
// public customer surface. The philosophy is shared; the code is not.

const HIDDEN = '•••'

/**
 * `0901234567` → `09••••567`.
 *
 * Enough for the customer to recognise their own number at a glance, not enough
 * for a link-holder to dial it: four of the ten digits stay hidden, and the mask
 * is a fixed four characters regardless of the real length.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D+/g, '')
  // Too short to mask meaningfully — showing five characters of a six-digit
  // value would reveal most of it.
  if (digits.length < 8) return HIDDEN
  return `${digits.slice(0, 2)}••••${digits.slice(-3)}`
}

/**
 * `128 Nguyễn Văn Cừ, Q5` → `••• Nguyễn Văn Cừ, Q5`.
 *
 * Drops the first whitespace-delimited token, which in the ordinary Vietnamese
 * format is the house number, and keeps the street and district so the customer
 * can see the shop has the right place.
 *
 * ⚠️ STATED PLAINLY: this reveals the street. It is a deliberate trade decided
 * in P0 §24 — an address a courier cannot use is not an address the customer
 * can verify, and verification is the entire purpose of echoing it back. A
 * street name without a number does not reach anybody's door, but it is not
 * anonymity, and an address written in an unusual order (`Số 5 ngõ 12 …`) will
 * keep a digit that a house-number-first address would not.
 */
export function maskAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length < 4) return HIDDEN

  const firstBreak = trimmed.search(/\s/)
  // One long token with no spaces: there is no house number to separate, so
  // reveal nothing rather than guess where to cut.
  if (firstBreak <= 0) return HIDDEN

  const rest = trimmed.slice(firstBreak + 1).trim()
  if (rest.length === 0) return HIDDEN
  // Capped so a very long address cannot be echoed back wholesale.
  return `${HIDDEN} ${rest.length > 60 ? `${rest.slice(0, 60)}…` : rest}`
}

/**
 * `Nguyễn Thị Lan` → `Nguyễn Thị L.`
 *
 * The last name-part is reduced to an initial. A customer recognises their own
 * name from the rest; a link-holder gets one letter less to work with, which is
 * a small gain and costs nothing.
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return HIDDEN
  if (parts.length === 1) return `${parts[0][0]}.`
  return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1][0]}.`
}
