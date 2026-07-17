# ADR-014: Cost Calculator

**Status:** Accepted (Sprint 5). Wired into Telemetry only — never affects
routing, business logic, or what any caller receives.
**Related:** ADR-013 (Pricing Catalog), ADR-011 (Telemetry Contract).

## Context

With a Pricing Catalog in place (ADR-013), something needs to turn a token
count into an estimated dollar figure. The brief is specific about the
shape: a **pure** function — deterministic, no routing logic, no provider
switching, no telemetry, no logging inside it. The Owner Architecture
Principle adds a sharper constraint: this file must **never contain
hardcoded provider-specific pricing logic** — no `if (provider === 'claude')`
branches anywhere. Every provider/model must be priced through the identical
formula, driven entirely by the catalog's data.

## Decision

`costCalculator.ts` exports one function:

```ts
calculateCost(input: { provider, model, inputTokens, outputTokens, cachedInputTokens? }): number | undefined
```

- Looks up `findPricing(provider, model)` (ADR-013). Returns `undefined`
  immediately if there's no entry — the *only* provider-aware step, and it's
  generic (a catalog lookup, not a conditional on a specific id).
- `provider` is typed `string`, not the narrower `ProviderId` union —
  matching `AIProvider.id`'s own declared type (`provider.ts`), since that's
  what's actually available at the real caller (`ai.ts`) without an
  unnecessary cast.
- Cached tokens are clamped to `[0, inputTokens]` (never allowed to imply more
  cached tokens than total input), priced at `cachedInputPrice` if the
  catalog entry has one, else at the plain `inputTokenPrice` (see ADR-013 on
  why that's the safe default direction).
- The whole function is arithmetic plus one lookup — no `Date.now()`, no
  randomness, no I/O, no `console.log`, no import of `router.ts`/`policy.ts`/
  the Telemetry Contract. `golden.test.ts` verifies determinism directly
  (same input → same output, called three times) and — via a comment-stripped
  source-text scan — that the file contains no `=== 'claude'`/`'gemini'`/
  `'openai'` branching.

### Wiring into Telemetry (not into routing)

`ai.ts` calls `calculateCost` once per successful `generate`/`stream`/
`vision` call, using the real `usage.promptTokens`/`usage.completionTokens`
the AI SDK already returns, and attaches the result to the Telemetry Contract
event (`estimatedCost`, `pricingVersion`, `pricingSource` — ADR-011) via the
same `.then()`/`onFinish` attachment pattern established in Sprint 3: the
promise/stream object returned to the caller is unmodified either way. On
`undefined` (unpriced model), those three fields are simply omitted from the
event (`JSON.stringify` drops `undefined` properties) — never a thrown error,
matching the brief's "if pricing data is unavailable: estimated_cost =
undefined, never throw."

This is a **log-line-only** change. It does not touch the Router, the
Provider Policy, any of the 14 call sites, or what any caller receives.

## Alternatives Considered

1. **A per-provider pricing function (e.g. `calculateClaudeCost`,
   `calculateGeminiCost`).** Rejected outright — this is precisely the
   "hardcoded provider-specific pricing logic" the Owner Architecture
   Principle forbids. One generic formula, driven by catalog data, is the
   whole point.
2. **Have the calculator throw on an unknown model, and have `ai.ts` catch
   it.** Rejected — an unpriced model is an expected, common case (every
   Gemini call today), not an error. `undefined` is the honest return value;
   throwing would force every caller to add a try/catch for something that
   isn't exceptional.
3. **Wire cost estimation into business-visible output (e.g. return it from
   `AI.generate()` alongside `.text`).** Rejected — the Owner Architecture
   Principle says business code must never read pricing directly; a
   caller-visible cost field would violate that immediately. Telemetry (a
   log line nothing downstream currently consumes) is the only integration
   point this sprint touches.
4. **Skip cached-token handling entirely (treat all input tokens as
   non-cached).** Rejected — the codebase already uses Claude prompt caching
   (`ClaudeProvider.decorateMessages`), so a calculator that can't represent
   cached tokens at all would be foundation-incomplete from day one, even
   though no caller currently passes `cachedInputTokens` (the AI SDK's
   `usage` object doesn't expose a cached-token breakdown today — see Known
   Limitations in the Sprint 5 report).

## Trade-offs

- **Pro:** trivially testable in isolation — no mocking, no AI SDK, no
  network; every test in `golden.test.ts`'s Cost Calculator suite is a plain
  function call.
- **Pro:** genuinely provider-agnostic — adding Gemini pricing later (a pure
  `pricingCatalog.ts` data change, ADR-013) requires zero changes here.
- **Con:** `ai.ts` currently never has real `cachedInputTokens` to pass
  (the AI SDK's `usage` shape doesn't break that out), so the cached-token
  path is implemented and tested but not yet exercised by a real call —
  disclosed in the Sprint 5 report's Known Limitations, not hidden.

## Future Evolution

- If the AI SDK (or a future adapter) ever exposes a cached-token count in
  `usage`, thread it into `costFields()` in `ai.ts` — no change needed here.
- If a `CostBasedRoutingStrategy` (see `futureRoutingContracts.ts`, ADR-015)
  is ever implemented, it would call `calculateCost` to compare candidates —
  this calculator's pure, provider-agnostic shape is exactly what such a
  strategy would need, without modification.
