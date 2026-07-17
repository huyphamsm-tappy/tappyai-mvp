# ADR 0001: Clock and UUID Provider Abstractions

**Status:** Accepted (ClockProvider implemented; UuidProvider was deferred, then implemented
during Phase 1B — see the update at the bottom of the UuidProvider section)
**Date:** Phase 1A Gate Review follow-up, before Phase 1B
**Governed by:** `android/docs/Android_Architecture.md` §7 (Architecture Freeze Rules)

## Context

Two small testability abstractions were proposed after the Phase 1A gate review: a
`ClockProvider` (wrapping `System.currentTimeMillis()`) and a `UuidProvider` (wrapping
`UUID.randomUUID()`), both optional — "implement if they naturally fit the existing
architecture, otherwise document as a future ADR."

## Decision — ClockProvider: implemented

`EncryptedTokenStorage.isAccessTokenExpired()` (`core:security`) already called
`System.currentTimeMillis()` directly to compare against a decoded JWT's `exp` claim — a real,
existing call site, not a hypothetical one. This is exactly the case the request anticipated
("improve testing of JWT expiration, cache freshness, and future synchronization logic").

- **`ClockProvider`** (interface, `nowMillis(): Long`) lives in `core:common` — pure Kotlin,
  zero dependencies, consistent with how `core:common` already holds `UiState<T>`.
- **`SystemClockProvider`** (default impl) and its Hilt `@Binds` binding are co-located in
  `core:security`, **not** `core:common` — `core:common` is a plain `kotlin("jvm")` module
  (no Android Gradle plugin), and Hilt's `@InstallIn(SingletonComponent::class)` binding
  machinery is not something to introduce into a pure-JVM module without being able to verify
  it actually compiles in this environment (no JDK/Gradle available — see every prior phase's
  verification section). Placing the binding in `core:security`, which already has full
  Hilt+Android wired and is `ClockProvider`'s only real consumer today, is the option with
  zero compilation risk.
- **`EncryptedTokenStorage`** now takes `ClockProvider` as a constructor parameter instead of
  calling `System.currentTimeMillis()` directly.

**This placement is intentionally temporary.** `core:security` hosting a general-purpose clock
binding is a pragmatic choice justified only by "it's the sole consumer and already has the
DI machinery," not by any architectural ownership of "what time it is." When a second real
consumer appears — most likely `core:sync`'s stale-while-revalidate logic or
`core:database`'s cache-freshness checks (both Phase 2+) — move the `SystemClockProvider`
binding to whichever module those land in, or to a new lightweight module if two or more
unrelated modules need it independently. That move is a binding relocation, not an interface
change, so it doesn't ripple through consumers.

## Decision — UuidProvider: deferred

Grepped the entire `android/` tree for `UUID` — **zero matches**. There is no current call
site to replace. Building a `UuidProvider` now would be introducing an abstraction with no
consumer, which conflicts with this project's own stated principle (Phase 0's "no unnecessary
abstraction," reaffirmed at every phase since): abstractions get built when a real call site
needs one, not preemptively.

**Revisit this when:** the first feature that needs to generate a client-side unique
identifier lands (a plausible candidate: idempotency keys for `core:payment`'s future
mutating calls, or a local-only draft ID before a server round-trip assigns a real one). At
that point, add `UuidProvider` (interface in `core:common`, matching `ClockProvider`'s shape)
and a `RandomUuidProvider` default implementation, bound in whichever module owns that first
consumer — same reasoning as `ClockProvider`'s placement above.

**Update, Phase 1B:** the trigger condition above was met sooner than expected — Google
Sign-In's nonce generation (`features:auth`'s `GoogleSignInClient`, replay-attack protection
for the ID-token exchange) is a real, concrete need for a random UUID, not a hypothetical one.
Implemented exactly as anticipated: `UuidProvider` (interface, `randomUuid(): String`) in
`core:common`; `RandomUuidProvider` (default impl, wraps `UUID.randomUUID()`) and its Hilt
`@Binds` binding co-located in `features:auth` — the same "bind where the first real consumer
already has the DI machinery" reasoning as `SystemClockProvider`'s placement in `core:security`
above, and the same temporariness: if a second unrelated consumer needs it later, that's the
trigger to relocate the binding, not the interface.

## Consequences

- `core:security` now depends on `core:common` (new `implementation(project(":core:common"))`
  in `core/security/build.gradle.kts`) — a permitted composition under
  `Android_Architecture.md`'s existing rules (nothing prohibits a `core:*` module depending on
  `core:common`; it exists to be a base dependency).
- No change to `Android_Architecture.md` itself — no new module was created, no documented
  dependency-direction rule was violated, so per §7.1 this addition doesn't require amending
  the frozen document.
- Future work: when relocating `SystemClockProvider`'s binding (see above), update this ADR's
  Status line rather than silently moving it — the whole point of the ADR is that the
  reasoning for today's placement stays visible even after it's superseded.
