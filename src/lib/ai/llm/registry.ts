import type { AIProvider } from './provider'
import type { ModelOverrides, ProviderId } from './types'
import { createClaudeProvider } from './providers/claude'

// ── Provider registry — the single place a provider is instantiated ─────────
//
// Configuration (all optional; defaults in parentheses):
//   LLM_PROVIDER        which adapter to use: claude | openai | gemini | grok
//                       | deepseek                                  (claude)
//   LLM_FAST_MODEL      model id for the 'fast' role      (provider default)
//   LLM_SMART_MODEL     model id for the 'smart' role     (provider default)
//   LLM_PLANNING_MODEL  model id for the 'planning' role  (falls back to
//                       LLM_SMART_MODEL, then provider default)
//   LLM_VISION_MODEL    model id for the 'vision' role    (provider default)
//
// Credentials stay per-vendor (e.g. ANTHROPIC_API_KEY) and are read only
// inside the matching adapter in providers/*.
//
// Adding a provider = one adapter file + one case below. Grok and DeepSeek
// expose OpenAI-compatible APIs, so their adapters are the OpenAI adapter with
// a custom baseURL; Gemini uses Google's. No business code changes.
//
// ── Why the cache is keyed (P0) ──────────────────────────────────────────────
// This used to memoise ONE provider for the lifetime of the process:
//
//     let provider: AIProvider | null = null
//     if (provider) return provider
//
// Correct while exactly one provider exists, and structurally fatal the moment
// a second one does: the first caller's provider is silently returned to every
// later caller, whatever they asked for. A request routed to one vendor would
// be served by another with no error and no log, and the telemetry would agree
// with the lie. Keying the cache by id makes that unrepresentable — an id with
// no adapter throws instead of resolving to somebody else's.
//
// Instances are still created lazily and reused, so with only Claude registered
// the observable behaviour is exactly as before: one adapter, built on first
// use. Nothing here selects a provider per request; that is P1's job.

function modelOverridesFromEnv(): ModelOverrides {
  return {
    fast: process.env.LLM_FAST_MODEL,
    smart: process.env.LLM_SMART_MODEL,
    planning: process.env.LLM_PLANNING_MODEL ?? process.env.LLM_SMART_MODEL,
    vision: process.env.LLM_VISION_MODEL,
  }
}

const SUPPORTED: readonly ProviderId[] = ['claude', 'openai', 'gemini', 'grok', 'deepseek']

/** Every id the architecture recognises — installed or not. The routing layer
 *  walks this to discover the fleet; ids without an adapter contribute nothing. */
export const SUPPORTED_PROVIDER_IDS = SUPPORTED

/** One instance per provider id, built on first use. Failures are NOT cached. */
const instances = new Map<ProviderId, AIProvider>()

function create(id: ProviderId): AIProvider {
  switch (id) {
    case 'claude':
      return createClaudeProvider(modelOverridesFromEnv())
    case 'openai':
    case 'gemini':
    case 'grok':
    case 'deepseek':
      // Recognized extension points — adapter not installed yet.
      throw new Error(
        `[ai] Provider "${id}" is supported by the architecture but has no adapter installed. ` +
        `Create src/lib/ai/llm/providers/${id}.ts implementing AIProvider and register it here.`,
      )
    default:
      throw new Error(
        `[ai] Unknown provider "${String(id)}". Supported: ${SUPPORTED.join(', ')}.`,
      )
  }
}

/** The provider used when a caller does not name one. Read per call so a
 *  deployment's LLM_PROVIDER is authoritative rather than whatever happened to
 *  be set when the first request warmed the module. */
export function defaultProviderId(): ProviderId {
  return (process.env.LLM_PROVIDER ?? 'claude').toLowerCase() as ProviderId
}

export function getProvider(id: ProviderId = defaultProviderId()): AIProvider {
  const cached = instances.get(id)
  if (cached) return cached
  const created = create(id)
  instances.set(id, created)
  return created
}

/** Which providers have actually been constructed. Diagnostics and tests only —
 *  never branch on this. */
export function registeredProviderIds(): ProviderId[] {
  return [...instances.keys()]
}
