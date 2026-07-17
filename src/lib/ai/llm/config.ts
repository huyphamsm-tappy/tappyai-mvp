import type { ModelOverrides, ModelRole, ProviderId } from './types'

// Every provider id the architecture recognizes (installed or not — see
// registry.ts). The runtime source of truth for "is this id known at all",
// used by configValidation.ts. Kept here (not derived from the ProviderId
// union, which TS erases at runtime) so it can be checked for accidental
// duplicates the same way ALL_CAPABILITY_KEYS is.
export const KNOWN_PROVIDER_IDS: ProviderId[] = ['claude', 'openai', 'gemini', 'grok', 'deepseek']

export const ALL_MODEL_ROLES: ModelRole[] = ['fast', 'smart', 'planning', 'vision']

// ── Config Contract — the single place every AI-layer env var is read ───────
//
//   LLM_PROVIDER          which adapter is active by default: claude | openai
//                         | gemini | grok | deepseek                (claude)
//   LLM_PROVIDER_<ROLE>   per-role override, e.g. LLM_PROVIDER_VISION=gemini.
//                         Falls back to LLM_PROVIDER when unset — with no
//                         per-role var configured (true in production today),
//                         every role resolves to the same provider as before.
//   LLM_FAST_MODEL        model id for the 'fast' role      (provider default)
//   LLM_SMART_MODEL       model id for the 'smart' role     (provider default)
//   LLM_PLANNING_MODEL    model id for the 'planning' role  (falls back to
//                         LLM_SMART_MODEL, then provider default)
//   LLM_VISION_MODEL      model id for the 'vision' role    (provider default)
//
// Credentials stay per-vendor (e.g. ANTHROPIC_API_KEY) and are read only
// inside the matching adapter in providers/*.

function envProviderId(name: string): ProviderId | undefined {
  const v = process.env[name]
  return v ? (v.toLowerCase() as ProviderId) : undefined
}

export function defaultProviderId(): ProviderId {
  return envProviderId('LLM_PROVIDER') ?? 'claude'
}

export function preferredProviderId(role: ModelRole): ProviderId {
  return envProviderId(`LLM_PROVIDER_${role.toUpperCase()}`) ?? defaultProviderId()
}

export function modelOverridesFromEnv(): ModelOverrides {
  return {
    fast: process.env.LLM_FAST_MODEL,
    smart: process.env.LLM_SMART_MODEL,
    planning: process.env.LLM_PLANNING_MODEL ?? process.env.LLM_SMART_MODEL,
    vision: process.env.LLM_VISION_MODEL,
  }
}
