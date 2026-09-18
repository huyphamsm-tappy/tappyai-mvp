// ─────────────────────────────────────────────────────────────────────────────
// TappyAI browser extension — the ONE place a deep link into TappyAI is built.
//
// Pure functions, no browser API, no state. Both the service worker and the
// popup import this module, and the web repo's test-suite imports it too
// (src/lib/growth/browserExtension.test.ts), so the URL contract the web app
// expects (`/chat?q=…&src=browser_extension`, `/scam-shield?url=…&src=…`) is
// pinned by the same tests that pin the web side.
//
// Privacy rules enforced here, by construction:
//   · Only http(s) page URLs are ever forwarded. chrome://, file://, about:,
//     extension pages and anything else return null — nothing leaves the
//     browser for those.
//   · Forwarded URLs are stripped of their query string and fragment. A page
//     URL is a "which page" identifier for Tappy, never a session/token carrier.
//   · Selected text is capped and control characters are removed. The cap is
//     the same order as the web app's own prompt limit.
//   · Nothing is stored. These functions return a URL; the caller opens it.
// ─────────────────────────────────────────────────────────────────────────────

/** The canonical public origin. Overridable for local testing only via the popup's storage key. */
export const DEFAULT_ORIGIN = 'https://www.tappyai.com'

/** The attribution value the web app's analytics contract accepts for this surface. */
export const SOURCE = 'browser_extension'

/** Same query parameter the web app reads (`SOURCE_PARAM` in src/lib/analytics/attribution.ts). */
export const SOURCE_PARAM = 'src'

/** Selected text longer than this is truncated before it becomes a question. */
export const MAX_SELECTION_CHARS = 1000

/** Page titles longer than this are truncated. */
export const MAX_TITLE_CHARS = 200

/** Only these schemes describe a page Tappy can be asked about. */
const FORWARDABLE_SCHEMES = new Set(['http:', 'https:'])

/**
 * Normalise a page URL for forwarding: http(s) only, query and fragment
 * dropped, or null. Pure.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function forwardablePageUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null
  let u
  try { u = new URL(raw) } catch { return null }
  if (!FORWARDABLE_SCHEMES.has(u.protocol)) return null
  if (!u.hostname || u.hostname === 'localhost') return null
  // Credentials in a URL are never forwarded, whatever the page did.
  u.username = ''
  u.password = ''
  u.search = ''
  u.hash = ''
  return u.toString()
}

/**
 * Clean a piece of user-selected text for use as a question. Pure.
 * @param {unknown} raw
 * @param {number} [max]
 * @returns {string}
 */
export function cleanText(raw, max = MAX_SELECTION_CHARS) {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const flat = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * @param {string} origin
 * @param {string} path
 * @param {Record<string, string>} params
 */
function build(origin, path, params) {
  const base = (origin || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const qs = new URLSearchParams({ ...params, [SOURCE_PARAM]: SOURCE })
  return `${base}${path}?${qs.toString()}`
}

/**
 * Ask Tappy about a selection. Returns null when the selection is empty.
 * @param {unknown} selection
 * @param {{ origin?: string }} [opts]
 * @returns {string | null}
 */
export function askUrl(selection, opts = {}) {
  const q = cleanText(selection)
  if (!q) return null
  return build(opts.origin ?? DEFAULT_ORIGIN, '/chat', { q })
}

/**
 * Ask Tappy about the current page. The question names the page by its title
 * and its (stripped) URL — the same shape the web app's Share Target builds.
 * Returns null for a non-forwardable page.
 * @param {{ url?: unknown, title?: unknown }} page
 * @param {{ origin?: string, lang?: 'vi' | 'en' }} [opts]
 * @returns {string | null}
 */
export function askAboutPageUrl(page, opts = {}) {
  const url = forwardablePageUrl(page?.url)
  if (!url) return null
  const title = cleanText(page?.title, MAX_TITLE_CHARS)
  const en = opts.lang === 'en'
  const q = title
    ? `${en ? 'Tell me about: ' : 'Cho mình biết về: '}${title}\n${url}`
    : `${en ? 'Tell me about this link: ' : 'Cho mình biết về link này: '}${url}`
  return build(opts.origin ?? DEFAULT_ORIGIN, '/chat', { q })
}

/**
 * Check a link (or the current page) with Scam Shield. The page prefills the
 * input and waits for the person to press Check — a deep link never triggers a
 * network call by itself. Returns null for a non-forwardable URL.
 * @param {unknown} target
 * @param {{ origin?: string }} [opts]
 * @returns {string | null}
 */
export function scamCheckUrl(target, opts = {}) {
  const url = forwardablePageUrl(target)
  if (!url) return null
  return build(opts.origin ?? DEFAULT_ORIGIN, '/scam-shield', { url })
}

/**
 * Plain entry into TappyAI, attributed.
 * @param {{ origin?: string }} [opts]
 */
export function homeUrl(opts = {}) {
  return build(opts.origin ?? DEFAULT_ORIGIN, '/', {})
}
