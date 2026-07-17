# ADR-012: First Provider Integration (Gemini, staging-only)

**Status:** Accepted (Sprint 4). Validates the architecture from ADR-008–011
against a real second provider. Production traffic remains 100% Claude.
**Related:** ADR-008 (Router), ADR-009 (Provider Policy), ADR-010 (Capability
Registry).

## Context

Sprints 2–3 built and hardened a Router/Policy/Capability Registry that had
never been exercised against more than one *real* adapter — every "what if a
second provider exists" claim in ADR-008–010 was proven only against a
synthetic stub object in tests. Sprint 4's job was to install exactly one
real provider and prove the architecture holds, without letting any
production traffic reach it.

## Decision

### Provider choice and package
Installed `@ai-sdk/google@1.2.22` — **not** the `latest` dist-tag
(`4.0.17`), which depends on `@ai-sdk/provider-utils@5.x` (the `ai@5`
generation). This project runs `ai@4.3.19` alongside
`@ai-sdk/anthropic@1.2.12`, both built on `@ai-sdk/provider@1.1.3` /
`provider-utils@2.2.8`. `@ai-sdk/google@1.2.22` is the newest version on that
same 1.x/2.x generation — confirmed by comparing `npm view`'s
`dependencies` output before installing. Pinned exact (not `^1.2.22`) so a
routine `npm install` can't silently drift this one package onto the
incompatible `ai@5`-targeted line later.

### Adapter (`providers/gemini.ts`)
Mirrors `providers/claude.ts`'s shape exactly: one file, the only place
allowed to import `@ai-sdk/google`, mention a Gemini model id, or read
`GEMINI_API_KEY`. Model mapping: `gemini-2.5-flash` for fast/smart/vision,
`gemini-2.5-pro` for planning (mirrors why Claude's planning role exists —
stronger reasoning for multi-step/agentic work).

### Capability declaration — honest, not copied from Claude
Five capabilities declared `true` (streaming, tools, forcedToolChoice,
vision, jsonMode) matching Gemini's real, known feature set via the AI SDK.
One declared `false`: **`promptCaching`**. Gemini has its own context-caching
mechanism, but it's a structurally different API shape than Anthropic's
`cacheControl` message annotation (`ClaudeProvider.decorateMessages`).
Implementing it is out of scope ("no business logic changes"), so the
adapter declares the gap rather than silently no-op'ing a promise it doesn't
keep. This produced the sprint's most valuable test: `assertCapabilities`
throwing `UnsupportedCapabilityError` against a **real** adapter for the
first time (Sprint 3's equivalent test needed a synthetic stub, since Claude
declares everything true).

### Registration
One `case 'gemini':` line added to `registry.ts`'s existing switch — exactly
the "one adapter file + one case" extension point ADR-009/the original
Sprint 1 design anticipated. No change to the switch's structure.

### Keeping production on Claude
Provider Policy (`policy.ts`, unchanged this sprint) still resolves every
role via `preferredProviderId` → `config.ts`, which defaults to `'claude'`
with no per-role override set. Gemini is *reachable* (via
`getProviderById('gemini')` or the override below) but never *chosen* unless
something explicitly asks for it.

### `LLM_PROVIDER_OVERRIDE` — the staging escape hatch
A temporary, dev/staging-only env var that forces every role to one
provider, checked at the *highest* precedence in both
`defaultProviderId()` and `preferredProviderId()` — ahead of `LLM_PROVIDER`
and any per-role override. Guarded by `isProductionEnvironment()`:

```ts
function isProductionEnvironment(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production'
  return process.env.NODE_ENV === 'production'
}
```

This distinction matters concretely for this project: Vercel sets
`NODE_ENV=production` for **both** Preview and Production deployments, so
`NODE_ENV` alone can't tell staging (Preview) apart from real production on
this host. `VERCEL_ENV` can (`'production' | 'preview' | 'development'`).
Gated this way: local dev → override works; Vercel Preview (the project's
actual pre-UAT staging environment) → override works; Vercel Production →
override is **ignored unconditionally**, even if the var is set by mistake.
`configValidation.ts` still checks `LLM_PROVIDER_OVERRIDE` names a known
provider id regardless of environment, so a typo is caught even where it
wouldn't apply.

## Alternatives Considered

1. **OpenAI instead of Gemini.** The brief ranked Gemini first; Gemini also
   has a materially different capability gap (no equivalent to Claude's
   prompt-caching hook) than OpenAI would, which made for a more informative
   first integration — it forced the Capability Registry's throw path to be
   exercised against something real, not just a test stub.
2. **Use `@ai-sdk/google@latest` (4.0.17).** Rejected: confirmed
   peer-incompatible with this project's `ai@4.3.19` (`provider-utils@5.x`
   vs. the `2.2.8` every other adapter here uses). Installing it would have
   risked type/runtime friction across the whole `ai/llm` module for zero
   benefit, since no production code will call it this sprint anyway.
3. **Gate the override with a hardcoded provider allowlist instead of an
   environment check.** Rejected — the risk isn't "which provider," it's
   "which environment." A safelist of providers doesn't protect production if
   the var is simply set there by mistake; an environment gate does.
4. **Skip capability honesty and declare `promptCaching: true` for Gemini
   too, to keep the adapters symmetric.** Rejected outright — this is
   precisely the "silent downgrade" Sprint 3 exists to prevent, just moved
   into a capability declaration instead of a Router fallback. A false
   capability claim defeats the entire point of the Capability Registry.

## Trade-offs

- **Pro:** the architecture's claims from ADR-008–010 are now proven against
  a real second adapter, not only a test stub — including the one negative
  case (`promptCaching`) that actually matters.
- **Pro:** the staging-override design generalizes to a third/fourth provider
  with zero further changes to the gate itself.
- **Con:** no live-credential verification was possible in this environment
  (no `GEMINI_API_KEY` available) — see Known Limitations in the Sprint 4
  report. Everything verified is either offline-constructible (model/provider
  resolution, capability declarations) or a controlled unit test with a
  placeholder credential string.
- **Con:** `LLM_PROVIDER_OVERRIDE` is explicitly temporary scaffolding for
  *this* validation exercise, not a permanent multi-provider traffic-shaping
  mechanism — see Future Evolution.

## Future Evolution

- Once a real `GEMINI_API_KEY` is available in a staging deployment, run the
  actual end-to-end checks this sprint could only validate offline: a live
  streamed chat turn, a live tool call, a live vision (OCR-style) call.
- `LLM_PROVIDER_OVERRIDE` should be removed once its validation purpose is
  served (or explicitly re-scoped) — the durable mechanism for deliberately
  routing one role to a second provider is the existing `LLM_PROVIDER_<ROLE>`
  per-role override (ADR-009), which the original Sprint 1 migration plan
  names as Phase 6: a measured, single-role, owner-approved flip — not a
  blanket "everything to provider X" switch meant to persist.
- If Gemini's own context-caching is ever wanted, it needs its own
  `decorateMessages`-equivalent hook shaped for Gemini's actual API, tracked
  as its own change — not retrofitted onto Claude's `cacheControl` shape.
