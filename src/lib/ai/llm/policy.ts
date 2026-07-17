import type { ModelRole, ProviderId } from './types'
import { defaultProviderId, preferredProviderId } from './config'

// ── Provider Policy — the ORDERED candidate providers for a role ────────────
// Today this is a single-provider default: the role's preferred provider
// (config.ts, falls back to LLM_PROVIDER / 'claude'). With no per-role env
// var set — true in production — resolveCandidates always returns exactly
// one candidate, identical to what getProvider() alone would resolve.
//
// When a per-role preference IS set and differs from the global default, the
// global default is appended as a second candidate — so the Router (router.ts)
// can fall through to today's active provider if the preferred one turns out
// to lack a required capability, rather than failing the call outright.
export function resolveCandidates(role: ModelRole): ProviderId[] {
  const preferred = preferredProviderId(role)
  const fallback = defaultProviderId()
  return preferred === fallback ? [preferred] : [preferred, fallback]
}
