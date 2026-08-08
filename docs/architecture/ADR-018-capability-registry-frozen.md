# ADR-018 — Capability Registry (Component 5) is frozen and folds into Component 6

**Status:** ✅ ACCEPTED — Owner decision, ratified 2026-08-08 (FOUNDATION-01).
**Context layer:** Controller V2 · Module Kernel · Component 5 (Capability Registry).
**Supersedes/relates:** referenced as the freeze authority by
[`docs/controller-v2/STATUS.md`](../controller-v2/STATUS.md) and
[`docs/controller-v2/ROADMAP.md`](../controller-v2/ROADMAP.md). Does not touch the
security foundation (C1–C4, C7, C9a) or PH-0.

---

## Context

The Controller V2 roadmap (`03_PHASE1_FOUNDATION_DESIGN.md`) originally listed
**Component 5 — Capability Registry** as a standalone kernel component. During
implementation two facts became clear:

1. A capability is only meaningful in relation to the thing that *provides* and
   *consumes* it — i.e. a **Module** and its **Manifest**. A capability registry
   with no module/plugin registry to register against has nothing to bind.
2. The current code carries only a **deliberately inert placeholder**:
   `src/lib/admin/capabilities.ts` (`CapabilityId = string`,
   `NO_CAPABILITIES = Object.freeze([])`) and a disabled decision branch in the
   PDP (`src/lib/admin/permissions/engine.ts` — `CAPABILITY_GATE_ENABLED = false`).
   Nothing is registered, looked up, or enforced at runtime today.

Both were **MEASURED** on `origin/main` `526157a` during the FOUNDATION-01 audit.

## Decision

- **Component 5 does NOT ship as a standalone component.** It is **FROZEN**.
- The Capability Registry **folds into Component 6 (Plugin / Module Registry)**.
  Capability identity, versioning, ownership, provider/consumer binding and the
  capability→permission relationship are defined by the Module Manifest contract
  and realised by the C6 registry — not by a separate C5 artefact.
- `src/lib/admin/capabilities.ts` and the PDP capability branch **remain reserved
  and inert** (`CAPABILITY_GATE_ENABLED = false`) until C6 activates them. They
  are **KEEP (reserved)**, not REMOVE — deleting them now would churn the PDP hot
  path for no behavioural gain.

## Consequences

- The capability model is specified in the FOUNDATION-01 contracts
  (`docs/controller-v2/FOUNDATION_01_CONTRACTS.md` §Capability) and will be
  implemented with C6, gated behind the Module Manifest freeze.
- No runtime behaviour changes as a result of this ADR. It records a
  scope/ownership decision only.
- STATUS.md and ROADMAP.md already cite this ADR by filename; this file resolves
  those previously-dangling references.

## What this ADR does NOT decide

- The internal design of the C6 Plugin/Module Registry (that is C6's own work).
- Any change to the security foundation or to the disabled capability gate's
  eventual semantics (defined at C6 time).
