import type { LanguageModelV1 } from 'ai'
import { hasCapabilities, type CapabilityKey } from './capabilities'
import type { AIProvider } from './provider'
import { getProvider, getProviderById } from './registry'
import { resolveCandidates } from './policy'
import type { ModelRole } from './types'

export interface ResolvedModel {
  provider: AIProvider
  model: LanguageModelV1
}

// ── AI Router — (role, required capabilities) → (provider, model) ──────────
// Generalizes the old `getProvider().model(role)` call: tries the Policy's
// ordered candidates for this role, skipping any that are not installed, not
// configured (missing credentials), or missing a capability this call needs.
// Falls back to the process's globally active provider (today's getProvider())
// if no candidate qualifies — so a misconfigured policy degrades to current
// behavior instead of throwing.
//
// With only one provider installed (Claude) and no per-role env overrides —
// true in production today — this always resolves to exactly what
// getProvider().model(role) resolved to before the Router existed.
export function resolveModel(role: ModelRole, requiredCaps: CapabilityKey[] = []): ResolvedModel {
  for (const id of resolveCandidates(role)) {
    let provider: AIProvider
    try {
      provider = getProviderById(id)
    } catch {
      continue // recognized-but-not-installed / unknown id — skip, don't throw
    }
    if (!provider.isConfigured()) continue
    if (hasCapabilities(provider.capabilities, requiredCaps)) {
      return { provider, model: provider.model(role) }
    }
  }
  const provider = getProvider()
  return { provider, model: provider.model(role) }
}
