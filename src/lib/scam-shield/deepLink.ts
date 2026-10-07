// ─────────────────────────────────────────────────────────────────────────────
// Scam Shield deep link — `/scam-shield?url=<https://…>`.
//
// The one public way for another surface (the browser extension, a share-out
// page, a QR, a chat card) to hand Scam Shield a link to check. The page
// PREFILLS the input and waits for the person to press Check: a deep link
// never triggers the check itself, so a crafted URL cannot make a visitor's
// browser spend their quota or hit the engine on someone else's behalf.
//
// Pure. The same rules the extension applies on its side (extensions/browser/
// src/links.js) are re-applied here because the web app trusts nothing it is
// handed: http(s) only, no credentials, bounded length.
// ─────────────────────────────────────────────────────────────────────────────

export const SCAM_SHIELD_URL_PARAM = 'url'
export const SCAM_SHIELD_PREFILL_MAX = 2048

/** The link to prefill from a query string, or null when there is nothing safe to prefill. */
export function readScamShieldPrefill(search: string | null | undefined): string | null {
  if (!search) return null
  let raw: string | null
  try { raw = new URLSearchParams(search).get(SCAM_SHIELD_URL_PARAM) } catch { return null }
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > SCAM_SHIELD_PREFILL_MAX) return null
  let u: URL
  try { u = new URL(trimmed) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname) return null
  u.username = ''
  u.password = ''
  return u.toString()
}

/** The deep link itself, for surfaces inside the web app. Pure. */
export function scamShieldDeepLink(target: string, src?: string): string | null {
  const clean = readScamShieldPrefill(`?${SCAM_SHIELD_URL_PARAM}=${encodeURIComponent(target)}`)
  if (!clean) return null
  const qs = new URLSearchParams({ [SCAM_SHIELD_URL_PARAM]: clean, ...(src ? { src } : {}) })
  return `/scam-shield?${qs.toString()}`
}
