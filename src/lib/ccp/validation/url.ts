import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import type { ProviderRegistryEntry } from '../registry/types'
import { isAllowedHost } from '../registry'

// ── URL safety for commerce links ────────────────────────────────────────────
// `isSafeHttpsUrl` (src/lib/security/urlGuard.ts) was reviewed before reuse:
//   + https only, no embedded credentials, blocks loopback/private/link-local/
//     CGNAT/internal-TLD literals and names.
//   − no DNS-rebinding defence (a public name can resolve privately) and no
//     opinion about WHICH public hosts are acceptable.
// CCP therefore layers two more controls on top and never fetches a resolved
// URL server-side in MVP (validation is static + decode; `method: 'head'` is
// reserved and unused):
//   1. an exact host allow-list per provider (registry) — the only hosts a
//      Commerce Link may point at are the ones the audit saw;
//   2. a parameter-injection check on the final URL — control characters,
//      whitespace, markdown-breaking characters and nested schemes are refused.

const MAX_URL_LENGTH = 2048
// Raw characters that must never survive into an emitted URL. Anything the
// grammar needs is percent-encoded by URLSearchParams before this runs.
const FORBIDDEN_RAW = /[\s\x00-\x1f\x7f<>"'`\\[\]{}|^]/

export type UrlSafetyResult = { ok: true; url: URL } | { ok: false; reason: string }

export function checkCommerceUrl(raw: string, provider: ProviderRegistryEntry): UrlSafetyResult {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'empty' }
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' }
  if (FORBIDDEN_RAW.test(raw)) return { ok: false, reason: 'forbidden_characters' }
  if (!isSafeHttpsUrl(raw)) return { ok: false, reason: 'unsafe_scheme_or_host' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'unparseable' }
  }
  if (!isAllowedHost(provider, u.hostname)) return { ok: false, reason: `host_not_allowed:${u.hostname}` }
  // A second scheme inside the query (open-redirect shape) is only acceptable
  // when it is a percent-encoded value of a known wrapper parameter; adapters
  // build wrappers through the tracking module, which encodes. A bare "http"
  // in the query string means something bypassed that path.
  if (/[?&][^=&]*=https?:\/\//i.test(raw)) return { ok: false, reason: 'unencoded_nested_url' }
  return { ok: true, url: u }
}

/** Wrapper hosts are validated against the tracking network's own allow-list. */
export function checkWrapperUrl(raw: string, allowedHosts: readonly string[]): UrlSafetyResult {
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' }
  if (FORBIDDEN_RAW.test(raw)) return { ok: false, reason: 'forbidden_characters' }
  if (!isSafeHttpsUrl(raw)) return { ok: false, reason: 'unsafe_scheme_or_host' }
  const u = new URL(raw)
  if (!allowedHosts.includes(u.hostname.toLowerCase())) return { ok: false, reason: `wrapper_host_not_allowed:${u.hostname}` }
  return { ok: true, url: u }
}

/**
 * Encode a query value for a grammar. Adapters must use this rather than
 * string concatenation so every user-influenced value is percent-encoded.
 */
export function q(value: string | number): string {
  return encodeURIComponent(String(value))
}

/** YYYY-MM-DD → DD/MM/YYYY (PasGo) — validated input only. */
export function isoToDmySlash(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** YYYY-MM-DD → YYYYMMDD (CGV `dy`). */
export function isoToCompact(iso: string): string {
  return iso.replace(/-/g, '')
}
