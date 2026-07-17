# ADR-011: Telemetry Contract

**Status:** Accepted (Sprint 2, hardened Sprint 3). Contract defined and
validated only — **not** persisted, **not** dashboarded (explicitly out of
scope per Sprint 3 Step 4).
**Related:** ADR-008 (AI Router).

## Context

Before Sprint 2, the only AI-call observability was ad-hoc: the chat route
logged `tappyai_model` (which role was picked) and `tappyai_usage` (token
counts + latency), and `tools/common.ts` logged verbose `tappyai_photo_debug`
lines. Nothing was normalized across the 14 call sites, and nothing recorded
*which provider/model* actually served a request — a gap that matters the
moment a second provider exists to compare against.

Sprint 3's Step 4 specified an exact field list every request must be able to
expose: `requestId`, `role`, `capability`, `provider`, `model`, `latencyMs`,
`inputTokens`, `outputTokens`, `estimatedCost`, `success`, `errorCode`,
`retryCount` — and was explicit that this sprint only *defines and validates*
the shape; it does not wire up persistence or a dashboard.

## Decision

`telemetry.ts` defines `AITelemetryEvent` with exactly those twelve fields
(plus `method` and an optional `finishReason`, kept for local debugging —
see Trade-offs). `ai.ts` emits one event per `generate`/`stream`/`vision`
call via `emitTelemetry` (a `console.log` of `{ type: 'ai_platform_telemetry',
...evt }`), alongside — not replacing — the chat route's own existing
`tappyai_usage`/`tappyai_model` logs.

Field semantics, chosen to be honest rather than aspirational:

- **`requestId`**: generated internally per call (`generateRequestId()`, Web
  Crypto `randomUUID()` with a fallback) — purely a log-correlation id, never
  accepted from or returned to business code.
- **`estimatedCost`**: always `null`. No per-provider/per-model pricing table
  exists for a single-provider system; the field exists so the contract's
  *shape* doesn't need to change when pricing data lands.
- **`retryCount`**: always `0`. No retry logic exists anywhere in the AI
  layer today (confirmed during the Sprint 3 audit) — `0` is accurate, not a
  placeholder lie.
- **`errorCode`**: the failing error's `.name` (e.g.
  `'UnsupportedCapabilityError'`), or `null` on success. Chosen over a
  hand-maintained string-enum catalog, which would be new business logic
  this sprint doesn't call for.
- **Resolution-time failures are covered too**: if `resolveModel` itself
  throws (see ADR-008), `ai.ts` catches it, emits a telemetry event with
  `provider`/`model` as `'unknown'` (since resolution never completed) and
  the real `errorCode`, then **re-throws the identical error object** —
  telemetry can observe a resolution failure without changing what the
  caller sees.

## Alternatives Considered

1. **Persist events to a table (e.g. Supabase) instead of `console.log`.**
   Explicitly rejected by Step 4 ("do NOT persist telemetry"). Deferred to a
   future, separately-scoped sprint once there's a real multi-provider
   comparison to make.
2. **Compute a real `estimatedCost` now, using Anthropic's published
   per-token pricing.** Rejected: hardcoding one vendor's price table into a
   provider-neutral contract is itself a provider-specific leak, and pricing
   changes over time — better to land a real pricing abstraction once it's
   actually needed for provider comparison (the reason cost matters at all).
3. **Rename existing fields in place (`promptTokens`→keep) instead of
   adopting the Step 4 vocabulary (`inputTokens`).** Rejected: nothing
   external consumes the Sprint 2 field names (no persistence, no dashboard,
   confirmed), so there is no compatibility cost to adopting the exact
   vocabulary the owner specified, and doing so avoids two competing
   vocabularies for the same concept.
4. **Attach telemetry via a global `generateText`/`streamText` wrapper/hook
   instead of explicit calls inside each of the three `AI.*` methods.**
   Rejected as unnecessary indirection — the AI SDK doesn't expose a global
   hook point, and three explicit, readable call sites are clearer than a
   monkey-patch.

## Trade-offs

- **Pro:** purely additive — every emission path is either a `.then()`
  attached to (not replacing) the promise already returned to the caller, or
  a try/catch that re-throws the identical error. Verified: no call site's
  return type, timing, or error propagation changed (Sprint 3 report,
  Regression Proof).
- **Pro:** one schema for `generate`/`stream`/`vision`, not three, so a
  future dashboard (when built) only needs to understand one shape.
- **Con:** `estimatedCost`/`retryCount` are honest-but-inert today — they
  exist in the contract but carry no real signal until pricing/retry logic
  exists. This is intentional per Step 4's own scoping, not an oversight.
- **Con:** telemetry events are unbounded `console.log` lines with no
  sampling/rate-limiting. Acceptable today (no worse than the pre-existing
  `tappyai_usage`/`tappyai_photo_debug` logs), but worth revisiting before
  this feeds a real high-volume pipeline.

## Future Evolution

- **Persistence + dashboard**: once a second provider exists and cost/latency
  comparison is a real question, wire `emitTelemetry` to a sink (a queue,
  a table) instead of `console.log` — the event shape shouldn't need to
  change, only where it goes.
- **Real `estimatedCost`**: land a small per-provider/per-model pricing table
  once there's more than one provider to compare against; compute it in
  `ai.ts` next to where `inputTokens`/`outputTokens` are already read from
  `usage`.
- **Real `retryCount`**: if retry logic is ever added (see ADR-008's Future
  Evolution — it belongs above the Router, not inside it), thread the actual
  attempt count through to the telemetry event instead of the current
  constant `0`.
