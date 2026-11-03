import type { TrackingConfig } from '../registry/types'
import type { TrackingInfo } from '../domain/types'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

// ── PARAM tracking — the merchant's own partner id on its own page (29 Oct 2026) ─────────────────────
//
// Agoda's partner programme is not run through a wrapper network: the partner's site id (`cid`) travels on
// the Agoda page itself (partner portal, 29 Oct 2026: approved site 1974819; the text-link tool emits
// partnersearch.aspx?…&cid=<id>). There is no redirect host to validate, so the rule is stricter than the
// wrappers' param echo: the tracked URL is the direct URL with ONE parameter added — same host, same path,
// every original parameter unchanged — and a direct URL that already carries the parameter is refused
// (never overwritten). Anything else and the direct link is emitted instead.

export type ParamWrapResult =
  | { ok: true; url: string; tracking: TrackingInfo }
  | { ok: false; reason: 'not_configured' | 'campaign_not_approved' | 'unsafe_wrapper' | 'param_echo_failed'; detail?: string }

export function wrapWithParam(input: { directUrl: string; tracking: TrackingConfig }): ParamWrapResult {
  const p = input.tracking.network === 'param' ? input.tracking.param : undefined
  if (!p || !/^[a-z][a-z0-9_]{0,15}$/i.test(p.name) || !/^[A-Za-z0-9_-]{1,40}$/.test(p.value)) return { ok: false, reason: 'not_configured' }
  if (input.tracking.approval !== 'approved') return { ok: false, reason: 'campaign_not_approved', detail: input.tracking.approval }
  let direct: URL
  try { direct = new URL(input.directUrl) } catch { return { ok: false, reason: 'unsafe_wrapper', detail: 'direct url does not parse' } }
  if (direct.searchParams.has(p.name)) return { ok: false, reason: 'param_echo_failed', detail: `${p.name} already present` }
  const tracked = new URL(direct.toString())
  tracked.searchParams.append(p.name, p.value)
  const url = tracked.toString()
  if (!isSafeHttpsUrl(url) || tracked.host !== direct.host || tracked.pathname !== direct.pathname) return { ok: false, reason: 'unsafe_wrapper', detail: 'param changed the destination' }
  // Every original parameter survives with its value (the echo for a wrapper-less network).
  for (const [k, v] of direct.searchParams) if (tracked.searchParams.get(k) !== v) return { ok: false, reason: 'param_echo_failed', detail: `changed=${k}` }
  return { ok: true, url, tracking: { mode: 'affiliate', network: `param:${direct.hostname}`, campaignId: p.value, subIds: {}, utm: {} } }
}
