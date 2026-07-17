# ADR-009: Provider Policy

**Status:** Accepted (Sprint 3). Revises the Sprint 2 draft of `policy.ts`.
**Related:** ADR-008 (AI Router).

## Context

The Provider Policy answers one question: *which provider should serve this
role?* Sprint 2's version, `resolveCandidates(role): ProviderId[]`, answered
with an **ordered list** — the role's preferred provider, then the global
default as a second candidate — explicitly so the Router could "fall through"
if the first candidate turned out to be unusable.

Sprint 3's Step 2 requirement — *"Do NOT silently downgrade. Do NOT
auto-switch providers"* — makes that list itself the problem: an ordered
candidate list is a fallback chain by definition, regardless of which layer
walks it.

## Decision

Collapse the Policy to name **exactly one provider per role**:

```ts
export function resolveProviderId(role: ModelRole): ProviderId {
  return preferredProviderId(role)  // config.ts: per-role override, else global default
}
```

`preferredProviderId` is unchanged from Sprint 2 (it already only ever
returned one id — the *list* was assembled one layer up, in the old
`resolveCandidates`). This ADR removes the list-assembly, not the underlying
per-role/global-default config semantics, which is why production behavior is
unaffected: with no `LLM_PROVIDER_<ROLE>` set (true today), this always
returns the same single id `getProvider()` already resolved.

A caller (the Router) that receives an id whose provider can't actually serve
the request must fail — it does not get a second option to quietly try.

## Alternatives Considered

1. **Keep the ordered list, but document that only the Router may use the
   first entry.** Rejected: an API that returns a fallback chain invites a
   fallback chain to be *used* as one, by this code or the next person who
   touches it. The type itself should make the "no auto-switch" invariant
   impossible to violate by accident, not merely policy-documented.
2. **Encode the policy as a data table (e.g. a JSON/DB-backed rule set)
   instead of a function over `config.ts`.** Rejected as scope creep for this
   sprint — no requirement here calls for dynamic, runtime-editable routing
   rules, and introducing one would be a new abstraction Sprint 3 explicitly
   forbids ("do not add new abstractions"). `config.ts`'s env vars remain the
   single source of truth.
3. **Score-based selection (e.g. weigh cost/latency across providers and pick
   a "best" one) instead of a deterministic per-role choice.** Explicitly out
   of scope — this sprint is "not a Multi-Provider Sprint." Scoring only makes
   sense once more than one provider is genuinely competing for the same role.

## Trade-offs

- **Pro:** the Policy's return type (`ProviderId`, not `ProviderId[]`) makes
  "one provider, no auto-switch" a type-level guarantee, not a convention the
  Router has to uphold by discipline.
- **Pro:** trivially testable — `golden.test.ts` asserts that with no per-role
  override, every role resolves to exactly the global default, matching
  today's production behavior byte-for-byte.
- **Con:** a role whose preferred provider is misconfigured has no
  automatic recovery path at request time. This is intentional (see ADR-008)
  — recovery belongs to fixing the config (caught early by
  `validateAIConfig`, ADR forthcoming as part of Step 3's Config Validation),
  not to the Policy silently picking something else.

## Future Evolution

- If a genuine need for graceful multi-provider degradation ever arises
  (e.g. "route to Gemini if Claude is down"), that is a **new, explicitly
  approved capability** — not something the Policy silently reacquires by
  reintroducing a list. It would need its own ADR, its own explicit
  provider-health signal, and its own owner sign-off, precisely because
  Sprint 3 spent an ADR removing this exact shape.
- Per-role provider overrides (`LLM_PROVIDER_<ROLE>`) remain the intended seam
  for Phase 6 of the original Sprint 1 migration plan — deliberately flipping
  ONE role to a second provider, once installed, in a measured, reversible
  way.
