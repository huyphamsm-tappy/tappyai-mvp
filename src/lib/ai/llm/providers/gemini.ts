import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { ProviderCapabilities } from '../capabilities'
import type { AIProvider } from '../provider'
import type { ModelOverrides, ModelRole } from '../types'

// ── Gemini (Google) adapter — Sprint 4, staging-only ─────────────────────────
// THE ONLY file in the codebase allowed to import a Google Generative AI SDK,
// mention a Gemini model id, or read GEMINI_API_KEY. Installed to validate the
// architecture supports a second provider; Provider Policy (policy.ts) keeps
// every role on Claude in production — see ADR-012. This adapter receives
// NO production traffic; it is reachable only via the dev/staging-only
// LLM_PROVIDER_OVERRIDE escape hatch (config.ts) or direct
// getProviderById('gemini') calls (e.g. from tests).

// Default model per semantic role. Override per-deployment with LLM_*_MODEL
// env vars (resolved in registry.ts and passed in as `overrides`) — the same
// mechanism the Claude adapter uses; no per-provider config surface needed.
// 'planning' gets the Pro tier (stronger multi-step reasoning, mirroring why
// Claude's planning role exists) — every other role gets the Flash tier.
const DEFAULT_MODELS: Record<ModelRole, string> = {
  fast:     'gemini-2.5-flash',
  smart:    'gemini-2.5-flash',
  planning: 'gemini-2.5-pro',
  vision:   'gemini-2.5-flash',
}

// Declared from Gemini's known real feature set via the AI SDK, NOT copied
// from Claude's capabilities. Two deliberate differences from Claude:
//   - promptCaching: false. Gemini has its own context-caching mechanism, but
//     it is a DIFFERENT API shape than Anthropic's cacheControl message
//     annotation (Claude's decorateMessages hook below). Implementing Gemini's
//     caching is out of scope this sprint ("no business logic changes") — so
//     this adapter honestly declares it unsupported rather than silently
//     no-op'ing a caching promise it doesn't keep. No decorateMessages hook.
//   - forcedToolChoice / tools / vision / jsonMode / streaming: Gemini
//     supports all of these via the AI SDK (function calling incl. forced
//     "ANY" mode, multimodal image input, JSON response mode, streamed
//     deltas). NOT exercised end-to-end this sprint (no GEMINI_API_KEY in
//     this environment) — see the Sprint 4 report's Known Limitations.
const GEMINI_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  tools: true,
  forcedToolChoice: true,
  vision: true,
  jsonMode: true,
  promptCaching: false,
}

export function createGeminiProvider(overrides: ModelOverrides): AIProvider {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  })

  return {
    id: 'gemini',

    capabilities: GEMINI_CAPABILITIES,

    isConfigured: () => !!process.env.GEMINI_API_KEY,

    model: (role) => google(overrides[role] ?? DEFAULT_MODELS[role]),
  }
}
