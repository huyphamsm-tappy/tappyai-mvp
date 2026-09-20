import type { TrackingConfig } from '../registry/types'
import type { TrackingInfo } from '../domain/types'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { compareDestinations, decodeWrapperDestination } from '../validation/paramEcho'

// ── Generic TEMPLATE wrapper — a runtime-configured network (A3.1, 2026-09-20) ────────────────
//
// A provider whose deeplink is not Accesstrade (Traveloka / Vietnam Airlines run on other
// programmes) gets its wrapper from the `commerce_providers` row: an https template with `{url}`
// where the percent-encoded destination goes, e.g.
//   https://track.example.net/click?camp=123&url={url}
// The destination MUST travel in a `url` (or `url_enc`) parameter so the same param echo the
// Accesstrade wrapper is held to can decode it back and prove the merchant page survived. A
// template that hides the destination is rejected, and the direct link is emitted instead —
// never a wrapper nobody can verify.

export type TemplateWrapResult =
  | { ok: true; url: string; tracking: TrackingInfo }
  | { ok: false; reason: 'not_configured' | 'unsafe_wrapper' | 'param_echo_failed'; detail?: string }

export function wrapWithTemplate(input: { directUrl: string; tracking: TrackingConfig; actorHash?: string }): TemplateWrapResult {
  const template = input.tracking.network === 'template' ? input.tracking.template : undefined
  if (!template || !template.includes('{url}')) return { ok: false, reason: 'not_configured' }
  const url = template.replace('{url}', encodeURIComponent(input.directUrl)).replace('{sub1}', encodeURIComponent(input.actorHash ?? ''))
  if (!isSafeHttpsUrl(url)) return { ok: false, reason: 'unsafe_wrapper', detail: 'template did not yield a safe https url' }
  const decoded = decodeWrapperDestination(url)
  if (!decoded) return { ok: false, reason: 'param_echo_failed', detail: 'destination not in a url/url_enc parameter' }
  const echo = compareDestinations(input.directUrl, decoded)
  if (!echo.ok) return { ok: false, reason: 'param_echo_failed', detail: `missing=${echo.missing.join(',')} changed=${echo.changed.join(',')}` }
  let host = ''
  try { host = new URL(url).hostname } catch { /* isSafeHttpsUrl already passed */ }
  return { ok: true, url, tracking: { mode: 'affiliate', network: `template:${host}`, campaignId: 'template', subIds: input.actorHash ? { sub1: input.actorHash } : {}, utm: {} } }
}
