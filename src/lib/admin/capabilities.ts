// Controller V2 — Capability identifiers (placeholder ahead of component 5).
//
// The Capability Registry (Phase 1 component 5) is the only sanctioned path for
// cross-module calls: a module declares `requires: CapabilityId[]` and the
// kernel resolves it against whichever module declares `provides`. None of that
// exists yet.
//
// This module exists NOW so that `Actor.capabilities` can be present from
// component 2 onward and the Actor interface does not change shape when the
// registry lands (owner decision, 2026-08-03).

// Widened to `string` until the registry defines the real identifier union.
// Component 5 narrows this to a union built from the registered manifests, at
// which point every existing consumer type-checks unchanged.
export type CapabilityId = string

/**
 * The canonical empty capability set.
 *
 * ⚠️ CONTRACT — READ BEFORE USING `Actor.capabilities`:
 *
 * An empty array means **"the Capability Registry is not installed yet"**. It
 * does NOT mean "this actor has been denied every capability". Nothing may make
 * an authorization decision from this field until component 5 populates it —
 * doing so today would deny every actor, including the Platform Owner.
 *
 * Authorization currently flows through `hasRole` (and, from component 4, the
 * Policy Decision Point). This field is a reserved slot, not an input.
 *
 * Frozen so an accidental `actor.capabilities.push(...)` fails loudly in
 * development rather than silently mutating a shared array.
 */
export const NO_CAPABILITIES: readonly CapabilityId[] = Object.freeze([])
