import type { TrackingConfig } from '../registry/types'
import type { TrackingInfo } from '../domain/types'
import { checkWrapperUrl } from '../validation/url'
import { compareDestinations, decodeWrapperDestination } from '../validation/paramEcho'

// ── ACCESSTRADE tracking wrapper — the ONLY file that knows this network ─────
// Owner decision D4: Deep Link endpoint / API only. The portal's Product Link
// tool is prohibited (it overrides Trip.com destinations with a preset link).
//
// The Deep Link URL is deterministic and click-free to construct:
//   https://go.isclix.com/deep_link/<publisherId>/<campaignId>?url=<encoded>&utm_source=…&sub1=…
// Building it is not a click; opening it is. CCP never opens it.
//
// Credentials: the publisher id is account-scoped (it appears in every public
// link, so it is configuration, not a secret) and is read from
// ACCESSTRADE_PUBLISHER_ID here and nowhere else. ACCESSTRADE_API_KEY is
// reserved for the link-creation / transactions API (later phase) and is also
// read only inside this module — the architecture guard enforces that.

import { ACCESSTRADE_WRAPPER_HOSTS } from './wrapperHosts'
export { ACCESSTRADE_WRAPPER_HOSTS }
const DEEP_LINK_BASE = 'https://go.isclix.com/deep_link'

/** Read at call time so tests can set/unset without module reloads. */
function publisherId(): string | undefined {
  const v = process.env.ACCESSTRADE_PUBLISHER_ID
  return v && /^\d{10,25}$/.test(v.trim()) ? v.trim() : undefined
}

export function isAccesstradeConfigured(): boolean {
  return publisherId() !== undefined
}

export interface WrapInput {
  directUrl: string
  tracking: TrackingConfig
  /** Pseudonymous attribution only — never a raw user id (Plan §13). */
  actorHash?: string
  utmContent?: string
}

export type WrapResult =
  | { ok: true; url: string; tracking: TrackingInfo }
  | { ok: false; reason: 'not_configured' | 'campaign_not_approved' | 'unsafe_wrapper' | 'param_echo_failed'; detail?: string }

/**
 * Wrap a direct URL in the ACCESSTRADE Deep Link and PROVE the destination
 * survived by decoding it back and comparing parameter by parameter. A wrapper
 * that fails the echo is rejected; the caller emits the direct link.
 */
export function wrapWithAccesstrade(input: WrapInput): WrapResult {
  const pub = publisherId()
  if (!pub) return { ok: false, reason: 'not_configured' }
  if (input.tracking.network !== 'accesstrade' || !input.tracking.campaignId) return { ok: false, reason: 'not_configured', detail: 'no accesstrade campaign' }
  if (input.tracking.approval !== 'approved') return { ok: false, reason: 'campaign_not_approved', detail: input.tracking.approval }
  if (input.tracking.safeWrapper !== 'deep_link') return { ok: false, reason: 'unsafe_wrapper', detail: input.tracking.safeWrapper }
  // A merchant whose campaign does not credit the generic Deep Link (TikTok Shop: product-feed
  // links only, portal rule 27 Sep 2026) must never receive one — a link that earns nothing is not
  // "tracked", it is a detour.
  if (input.tracking.unsafeWrappers.includes('deep_link')) return { ok: false, reason: 'unsafe_wrapper', detail: 'deep_link not credited by this campaign' }

  const utm: Record<string, string> = { utm_source: 'tappyai', utm_medium: 'ccp' }
  if (input.utmContent) utm.utm_content = input.utmContent
  // Phương án C (owner 29/09): no sub1 here. The reply links through Tappy's /go/at, which adds a NEW RANDOM
  // sub1 per click and records who clicked (tracking/clickLink.ts, table commerce_click_attributions).
  const subIds: Record<string, string> = {}

  const params = new URLSearchParams()
  params.set('url', input.directUrl)
  for (const [k, v] of Object.entries(utm)) params.set(k, v)
  for (const [k, v] of Object.entries(subIds)) params.set(k, v)
  const url = `${DEEP_LINK_BASE}/${pub}/${input.tracking.campaignId}?${params.toString()}`

  const safety = checkWrapperUrl(url, ACCESSTRADE_WRAPPER_HOSTS)
  if (!safety.ok) return { ok: false, reason: 'unsafe_wrapper', detail: safety.reason }

  // Param echo (D4, mandatory): decode what the wrapper would send the user to.
  const decoded = decodeWrapperDestination(url)
  if (!decoded) return { ok: false, reason: 'param_echo_failed', detail: 'no destination in wrapper' }
  const echo = compareDestinations(input.directUrl, decoded)
  if (!echo.ok) {
    return {
      ok: false,
      reason: 'param_echo_failed',
      detail: `missing=${echo.missing.join(',')} changed=${echo.changed.join(',')} host=${echo.hostMismatch} path=${echo.pathMismatch}`,
    }
  }
  return {
    ok: true,
    url,
    tracking: { mode: 'affiliate', network: 'accesstrade', campaignId: input.tracking.campaignId, subIds, utm },
  }
}

/**
 * Verify an EXTERNALLY produced wrapper (e.g. one pasted from the portal or
 * returned by the link API) against the intended direct URL. Used by tests and
 * by the later API path; rejects Product-Link-style preset overrides.
 */
export function verifyExternalWrapper(wrapperUrl: string, directUrl: string): { ok: boolean; detail: string } {
  const safety = checkWrapperUrl(wrapperUrl, ACCESSTRADE_WRAPPER_HOSTS)
  if (!safety.ok) return { ok: false, detail: safety.reason }
  const decoded = decodeWrapperDestination(wrapperUrl)
  if (!decoded) return { ok: false, detail: 'no destination in wrapper' }
  const echo = compareDestinations(directUrl, decoded)
  if (!echo.ok) return { ok: false, detail: `destination differs: missing=${echo.missing.join(',')} changed=${echo.changed.join(',')} host=${echo.hostMismatch} path=${echo.pathMismatch}` }
  return { ok: true, detail: 'param echo ok' }
}
