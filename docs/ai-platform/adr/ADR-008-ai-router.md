# ADR-008: AI Router

**Status:** Accepted (Sprint 3). Supersedes the Sprint 2 draft of `router.ts`.
**Related:** ADR-009 (Provider Policy), ADR-010 (Capability Registry).

## Context

Sprint 2 introduced `resolveModel(role, requiredCaps)` in `src/lib/ai/llm/router.ts`
to generalize the old `getProvider().model(role)` call. Its first version tried
an *ordered list* of candidate providers (from the Policy) and, if a candidate
was uninstalled/unconfigured/missing a capability, silently moved to the next
one — falling all the way back to the process's globally active provider if
none qualified.

Sprint 3's brief named this out explicitly: a Router must be a **pure
resolver** —

```
Capability / Role → Provider Policy → Provider → Model
```

— and must **not** log, cache, retry, fall back, build prompts, mutate
requests, call an SDK, or read environment variables directly. The Sprint 2
candidate-list-with-fallback design violates "must not fall back" by
construction: trying provider B after provider A fails *is* an auto-switch,
even though today it could never actually trigger (only one provider is
installed).

## Decision

Rewrite `resolveModel` as a four-line pure function:

```ts
export function resolveModel(role: ModelRole, requiredCaps: CapabilityKey[] = []): ResolvedModel {
  const providerId = resolveProviderId(role)       // Policy: exactly one id
  const provider = getProviderById(providerId)      // Registry: instantiate/memoize
  assertCapabilities(provider.id, role, provider.capabilities, requiredCaps)  // throw or pass
  return { provider, model: provider.model(role) }
}
```

- **No try/catch, no loop.** If `getProviderById` throws (unknown/uninstalled
  provider id), that error propagates unchanged — this is ordinary error
  propagation, not a retry or a fallback branch the Router authored itself.
- **No env reads.** `resolveProviderId` (Policy) and provider instantiation
  (Registry → Config) own environment access; the Router never touches
  `process.env`.
- **No logging/telemetry.** That lives in `ai.ts`, the caller, which wraps
  `resolveModel` in a try/catch *for observability only* and re-throws the
  identical error object — it does not change what the Router itself does.
- **No caching beyond the Registry's own memoization** (which existed before
  the Router and belongs to Provider Registry concerns, not routing).

## Alternatives Considered

1. **Keep the Sprint 2 candidate-list-with-fallback design.** Rejected: it is
   the exact "auto-switch"/"silent downgrade" shape Sprint 3 forbids, even
   though unreachable today. A Router that *can* silently degrade is a latent
   liability the moment a second provider is installed — the whole point of
   this hardening sprint is to close that gap before that day arrives.
2. **Make the Router async, so it could genuinely retry/probe providers
   (e.g. a lightweight health check) before choosing.** Rejected: turns every
   `AI.generate/stream/vision` call into an extra async hop for no current
   benefit, and reintroduces "the Router does more than resolve" — exactly
   what Step 1 forbids. Health-checking, if ever needed, belongs to a
   separate concern (e.g. a periodic background probe feeding the Policy),
   not the per-call resolution path.
3. **Have the Router catch and translate `UnsupportedCapabilityError` into a
   softer return value (e.g. `{ ok: false }`) instead of throwing.** Rejected:
   this is a silent downgrade in a different shape — the caller would have to
   remember to check `ok` or it silently loses the call. Throwing a typed
   error is the only shape that can't be accidentally ignored.

## Trade-offs

- **Pro:** trivially testable in isolation (`golden.test.ts`'s "Router purity"
  suite asserts it's synchronous, reads no env of its own, and resolves
  identically to the pre-Router path for every role).
- **Pro:** a future second provider's failure mode is *loud* (an exception)
  instead of *silent* (a request quietly served by a different model than the
  caller asked for) — the exact property Sprint 3 exists to establish.
- **Con:** without an in-Router fallback, a genuinely misconfigured deployment
  (e.g. `LLM_PROVIDER_VISION` pointing at an uninstalled adapter) fails the
  *first call* that needs that role, rather than degrading. This is
  intentional (see Step 3's "fail fast"), and Config Validation
  (ADR-009 / `configValidation.ts`) exists precisely to catch this class of
  mistake *before* that first call, at startup, once wired in.

## Future Evolution

- When a second provider is installed (a future, separately-approved sprint),
  the Router's shape does not need to change — `resolveProviderId` naming a
  different id for some role, and that provider declaring different
  capabilities, is exactly what this design anticipates.
- If retry/circuit-breaking is ever wanted, it belongs in a layer *above* the
  Router (e.g. in `ai.ts`, wrapping the whole `generateText`/`streamText`
  call, not the resolution step) — keeping "resolve" and "retry" as separate,
  independently reasoned-about concerns.
