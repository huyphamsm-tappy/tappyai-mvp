import type { TrackingConfig } from '../registry/types'
import type { TrackingInfo } from '../domain/types'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { VEXERE_DIRECT_AID, VEXERE_DIRECT_PARAMS } from '@/lib/config/vexereDirect'

// ── VEXERE DIRECT programme (12/11/2026) — Vexere's own affiliate parameters on Vexere's own page ──────────────
//
// No wrapper host, no redirect: the tracked URL is the direct URL with `utm_source=affiliate&utm_campaign=380&utm_medium=aff_link&aid=380`
// appended as text (so an existing query, and the percent-encoded brackets of the train list, stay byte for byte). The identifiers are
// public and live in config/vexereDirect.ts only.
//
// COLLISION RULE: Accesstrade's Vexere landing also uses `aid` (a different id) and `aff_sid`. A destination that already carries `aid`
// with another value, or `aff_sid`, is REFUSED (the caller then emits the plain direct link) — two programmes never share one link.

export type VexereDirectResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'not_vexere' | 'program_collision' | 'unsafe_url'; detail?: string }

const HOSTS = new Set(['vexere.com', 'www.vexere.com'])
const FOREIGN_KEYS = ['aff_sid', 'aff_id', 'sub1']

export function withVexereDirectParams(rawUrl: string): VexereDirectResult {
  let u: URL
  try { u = new URL(rawUrl) } catch { return { ok: false, reason: 'unsafe_url', detail: 'does not parse' } }
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname.toLowerCase()) || !isSafeHttpsUrl(rawUrl)) return { ok: false, reason: 'not_vexere' }
  for (const k of FOREIGN_KEYS) if (u.searchParams.has(k)) return { ok: false, reason: 'program_collision', detail: k }
  const have = VEXERE_DIRECT_PARAMS.filter(([k]) => u.searchParams.has(k))
  if (have.length > 0) {
    // Already ours, exactly? Then nothing to add (idempotent). Anything else is another programme's or a partial copy: refuse.
    const exact = have.length === VEXERE_DIRECT_PARAMS.length && VEXERE_DIRECT_PARAMS.every(([k, v]) => u.searchParams.getAll(k).length === 1 && u.searchParams.get(k) === v)
    return exact ? { ok: true, url: rawUrl } : { ok: false, reason: 'program_collision', detail: have.map(([k]) => k).join(',') }
  }
  const hashAt = rawUrl.indexOf('#')
  const base = hashAt === -1 ? rawUrl : rawUrl.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : rawUrl.slice(hashAt)
  const add = VEXERE_DIRECT_PARAMS.map(([k, v]) => `${k}=${v}`).join('&')
  const sep = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&'
  const url = `${base}${sep}${add}${hash}`
  const out = new URL(url)
  if (out.host !== u.host || out.pathname !== u.pathname) return { ok: false, reason: 'unsafe_url', detail: 'changed the destination' }
  for (const [k, v] of u.searchParams) if (out.searchParams.get(k) !== v) return { ok: false, reason: 'unsafe_url', detail: `changed=${k}` }
  return { ok: true, url }
}

export type VexereWrapResult =
  | { ok: true; url: string; tracking: TrackingInfo }
  | { ok: false; reason: 'not_configured' | 'campaign_not_approved' | 'unsafe_wrapper' | 'param_echo_failed'; detail?: string }

/** Resolver step 3–4 for the `vexere_direct` network. Same result shape as the other networks. */
export function wrapWithVexereDirect(input: { directUrl: string; tracking: TrackingConfig }): VexereWrapResult {
  if (input.tracking.network !== 'vexere_direct') return { ok: false, reason: 'not_configured' }
  if (input.tracking.approval !== 'approved') return { ok: false, reason: 'campaign_not_approved', detail: input.tracking.approval }
  const r = withVexereDirectParams(input.directUrl)
  if (!r.ok) return { ok: false, reason: r.reason === 'program_collision' ? 'param_echo_failed' : 'unsafe_wrapper', detail: `${r.reason}${r.detail ? `: ${r.detail}` : ''}` }
  return { ok: true, url: r.url, tracking: { mode: 'affiliate', network: 'vexere_direct', campaignId: VEXERE_DIRECT_AID, subIds: {}, utm: {} } }
}
