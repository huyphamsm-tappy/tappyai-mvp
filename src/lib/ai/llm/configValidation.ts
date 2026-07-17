import { ALL_CAPABILITY_KEYS } from './capabilities'
import { getProviderById } from './registry'
import type { ProviderId } from './types'
import { ALL_MODEL_ROLES, KNOWN_PROVIDER_IDS, defaultProviderId, preferredProviderId } from './config'

// ── Config Validation ────────────────────────────────────────────────────────
// Validates every piece of AI-layer configuration this process would actually
// use, and fails LOUD with a typed error rather than silently tolerating a
// bad value. Does NOT run automatically on import (see "Known Limitations" in
// the Sprint 3 report for why) — call validateAIConfig() explicitly from a
// startup hook when the app wires one in, or from tests.

export class ConfigValidationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(`[ai] config validation failed (${reason}): ${message}`)
    this.name = 'ConfigValidationError'
  }
}

/** Throws ConfigValidationError('duplicate_entry', ...) on the first repeated item. */
export function assertNoDuplicates<T>(items: T[], label: string): void {
  const seen = new Set<T>()
  for (const item of items) {
    if (seen.has(item)) {
      throw new ConfigValidationError('duplicate_entry', `duplicate ${label}: "${String(item)}"`)
    }
    seen.add(item)
  }
}

function assertKnownProviderId(id: string, context: string): void {
  if (!KNOWN_PROVIDER_IDS.includes(id as ProviderId)) {
    throw new ConfigValidationError(
      'unknown_provider',
      `${context} = "${id}" is not a recognized provider id. Known: ${KNOWN_PROVIDER_IDS.join(', ')}`,
    )
  }
}

function assertSaneModelOverride(envVar: string): void {
  const v = process.env[envVar]
  if (v !== undefined && v.trim().length === 0) {
    throw new ConfigValidationError('invalid_model_override', `${envVar} is set but empty/whitespace-only`)
  }
}

/**
 * Validates:
 *  - LLM_PROVIDER, every LLM_PROVIDER_<ROLE>, and LLM_PROVIDER_OVERRIDE (if
 *    set) name a known provider id — checked regardless of environment, so a
 *    typo in a staging-only var is still caught even where it wouldn't apply
 *                                                         → 'unknown_provider'
 *  - LLM_*_MODEL overrides (if set) are non-empty           → 'invalid_model_override'
 *  - KNOWN_PROVIDER_IDS / ALL_CAPABILITY_KEYS / ALL_MODEL_ROLES contain no
 *    duplicates — structurally guaranteed today by TypeScript's type system,
 *    but a real, meaningful guard the moment a second provider or capability
 *    is added by hand and mistyped               → 'duplicate_entry'
 *  - every provider id actually referenced by configuration (the global
 *    default, plus each role's resolved preference) has an installed adapter
 *    AND is configured (has credentials)             → 'missing_provider'
 *
 * Throws on the FIRST problem found. Never corrects, downgrades, or picks a
 * fallback on the caller's behalf.
 */
export function validateAIConfig(): void {
  assertNoDuplicates(KNOWN_PROVIDER_IDS, 'provider id')
  assertNoDuplicates(ALL_CAPABILITY_KEYS, 'capability key')
  assertNoDuplicates(ALL_MODEL_ROLES, 'model role')

  const envProvider = process.env.LLM_PROVIDER
  if (envProvider) assertKnownProviderId(envProvider.toLowerCase(), 'LLM_PROVIDER')

  const envOverrideVar = process.env.LLM_PROVIDER_OVERRIDE
  if (envOverrideVar) assertKnownProviderId(envOverrideVar.toLowerCase(), 'LLM_PROVIDER_OVERRIDE')

  const usedProviderIds = new Set<ProviderId>([defaultProviderId()])
  for (const role of ALL_MODEL_ROLES) {
    const envOverride = process.env[`LLM_PROVIDER_${role.toUpperCase()}`]
    if (envOverride) assertKnownProviderId(envOverride.toLowerCase(), `LLM_PROVIDER_${role.toUpperCase()}`)
    usedProviderIds.add(preferredProviderId(role))
  }

  assertSaneModelOverride('LLM_FAST_MODEL')
  assertSaneModelOverride('LLM_SMART_MODEL')
  assertSaneModelOverride('LLM_PLANNING_MODEL')
  assertSaneModelOverride('LLM_VISION_MODEL')

  for (const id of usedProviderIds) {
    let provider
    try {
      provider = getProviderById(id)
    } catch (e) {
      throw new ConfigValidationError(
        'missing_provider',
        `provider "${id}" is referenced by configuration but has no adapter installed (${(e as Error).message})`,
      )
    }
    if (!provider.isConfigured()) {
      throw new ConfigValidationError(
        'missing_provider',
        `provider "${id}" is referenced by configuration but is not configured (missing credentials)`,
      )
    }
  }
}
