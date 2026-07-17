# ADR-010: Capability Registry

**Status:** Accepted (Sprint 2, hardened Sprint 3).
**Related:** ADR-008 (AI Router).

## Context

Every call site expresses *capability need* implicitly: a `stream({tools})`
call needs tool-calling; a `vision()` call needs image input; a
`stream({prepareStep})` call needs forced tool choice. Before Sprint 2,
nothing in the codebase declared which capabilities the *active provider*
actually supports — it worked only because Claude happens to support
everything every call site needs. That fact was true by accident, not by
contract.

Sprint 3's Step 2 sharpened the requirement: a provider that can't serve a
required capability must be a **hard failure**, never a silent downgrade or
an automatic switch to a different provider.

## Decision

- `capabilities.ts` defines `ProviderCapabilities` — six declared booleans:
  `streaming`, `tools`, `forcedToolChoice`, `vision`, `jsonMode`,
  `promptCaching`. Each `AIProvider` now carries a `capabilities` field
  (Sprint 2); the Claude adapter declares all six `true`, matching its
  audited real behavior.
- `assertCapabilities(providerId, role, caps, required)` throws a typed
  `UnsupportedCapabilityError` — naming the provider, the role, and every
  missing capability — the moment a gap is found. `hasCapabilities` remains
  as a non-throwing predicate for callers that want a boolean instead of an
  exception (used by tests; not used by the Router, which always wants the
  throw).
- `ALL_CAPABILITY_KEYS` is an explicit runtime array mirroring the type
  (TypeScript erases the type at runtime, so there is no automatic way to
  enumerate `keyof ProviderCapabilities` in JS). `golden.test.ts` asserts this
  array stays in sync with the Claude adapter's actual declared keys, so the
  two can't silently drift apart.

## Alternatives Considered

1. **A capability "score" (e.g. 0–1 confidence) instead of booleans.**
   Rejected: nothing in the app has graduated capability needs — every call
   site either needs a capability or doesn't. Booleans are the simplest
   contract that's actually load-bearing today; a score would be
   unfalsifiable (unclear what threshold "enough" means) and is exactly the
   kind of speculative generality this sprint's brief forbids.
2. **Infer required capabilities from the AI SDK call shape at the
   `generateText`/`streamText` layer, rather than having `ai.ts` compute them
   explicitly.** Rejected: the AI SDK's own types don't expose "does this
   `LanguageModelV1` support forced tool choice" as an introspectable
   property — capability information has to come from the *adapter*
   declaring it, since only the adapter author knows the vendor's real
   feature set.
3. **Silently drop an unsupported option (e.g. ignore `prepareStep` if the
   provider can't honor it) instead of throwing.** Rejected outright by Step
   2 ("do NOT silently downgrade") — dropping a `prepareStep` the caller
   asked for would change the model's behavior in a way the caller never
   agreed to and couldn't detect.

## Trade-offs

- **Pro:** a future adapter (e.g. DeepSeek, which per the Sprint 1 Provider
  Matrix has no vision support) is *structurally* prevented from being
  silently used for a `vision()` call — `assertCapabilities` throws the
  moment that adapter is selected for that role.
- **Pro:** capability declarations are colocated with the adapter that makes
  them true (`providers/claude.ts`), not maintained separately — reducing the
  chance of an adapter's capabilities object drifting from its real behavior.
- **Con:** every new capability an adapter might need in the future requires
  a coordinated change to `ProviderCapabilities` (the interface) AND
  `ALL_CAPABILITY_KEYS` (the runtime mirror) AND every existing adapter's
  declared object (TypeScript will fail the build if any adapter omits a
  newly-added required field — a feature, not a bug, since it forces an
  explicit true/false decision rather than an implicit "false" that could
  silently disable something).

## Future Evolution

- When a second provider is installed, its adapter must declare this same
  six-field object honestly (not "declare everything true to make tests
  pass") — the whole value of this registry depends on each adapter's
  capabilities matching its real, tested behavior.
- If `jsonMode`/`promptCaching` type distinctions ever need to be more
  granular (e.g. "supports JSON mode via response_format vs. via prompt
  instruction only"), that's a capability-shape change requiring its own ADR
  — not something to smuggle in as a boolean's implicit meaning shifting
  underneath existing callers.
