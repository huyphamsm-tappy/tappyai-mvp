import type { LanguageModelV1 } from 'ai'
import { assertCapabilities, type CapabilityKey } from './capabilities'
import type { AIProvider } from './provider'
import { getProviderById } from './registry'
import { resolveProviderId } from './policy'
import type { ModelRole } from './types'

export interface ResolvedModel {
  provider: AIProvider
  model: LanguageModelV1
}

// ── AI Router — a PURE resolver ──────────────────────────────────────────────
//   Capability / Role → Provider Policy → Provider → Model
//
// The Router does NOT: log, cache, retry, fall back, build prompts, mutate
// requests, call an SDK, or read environment variables directly (Policy and
// Config own env access; ai.ts owns telemetry). Every step here is a plain
// function call; nothing is swallowed. If the Policy names a provider with no
// installed adapter, getProviderById's error propagates unchanged — that is
// normal error propagation, not a retry/fallback. If the resolved provider
// can't serve a required capability, assertCapabilities throws
// UnsupportedCapabilityError — never a silent downgrade or an auto-switch to
// a different provider (see ADR-008).
//
// With only Claude installed and no per-role env override — true in
// production today — this always resolves to exactly what
// getProvider().model(role) resolved to before the Router existed (proven in
// golden.test.ts).
export function resolveModel(role: ModelRole, requiredCaps: CapabilityKey[] = []): ResolvedModel {
  const providerId = resolveProviderId(role)
  const provider = getProviderById(providerId)
  assertCapabilities(provider.id, role, provider.capabilities, requiredCaps)
  return { provider, model: provider.model(role) }
}
