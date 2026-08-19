# Controller V2 — Owner Decisions, 2026-08-19

**Status:** DECISION RECORD — authoritative and current
**Baseline at decision time:** `origin/main` = `4f9fd0e` · every Phase 1 component (C1–C11) shipped, ADR-017 applied, required checks enabled
**Input:** the Phase 0 Architecture Reconciliation presented 2026-08-19
**Authority:** these two decisions were made by the Owner. They are recorded in effect, not reinterpreted.

**Relationship to [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md):** Decision **F** below supersedes Decision **A** of that record by date. Decisions **B, C, D, E** of 2026-08-13 are untouched and remain in force. The superseded text is not deleted there — a decision record is a historical instrument.

---

## Why this record exists

The 2026-08-13 record answered *"what does COMPLETE mean for the components then in flight?"* It answered it correctly for that question, and the answer — **C1–C11 per their contracts** — was executed in full.

It was then read as the definition of Controller V2 itself. That reading was wrong, and the repository always said so. [`03_PHASE1_FOUNDATION_DESIGN.md:36`](03_PHASE1_FOUNDATION_DESIGN.md) records the Owner's own scope resolution from 2026-08-03:

> *"**Conflict C3 is resolved.** Every business Hub, Deals/Commerce included, is **feature-frozen** and migrates to Hub/Plugin **only after Block C completes**."*

and bounds that freeze explicitly — *"binding for the duration of Phase 1."* Block C is complete. The freeze has therefore lapsed by its own terms, and the Hub/Plugin migration it deferred is the next designed phase, not new scope.

C1–C11 was the **Foundation**. Controller V2 is the architecture in [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) that the Foundation exists to carry.

---

## The decisions

### F — Definition of Done: **FULL ARCHITECTURE** *(supersedes Decision A, 2026-08-13)*

Controller V2 is **COMPLETE** when the architecture of [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) is implemented, production-used, and verified — Controller Core, Module Kernel, Module Registry, enforced Manifests, Hub Registry, real Hubs owning real Modules, active Capability/Service binding, Configuration Provider, versioning and dependency resolution, lifecycle, failure isolation, a non-no-op Event Bus, registry-driven navigation, the V2 Shell, Founder/Home with its data pipeline, legacy migration completed and bypass paths removed.

C1–C11 completion is a **necessary precondition**, not the definition.

What Decision A got right and this decision keeps: **technical debt outside the architecture must not silently become a blocker.** Debt outside the target architecture stays tracked and scheduled on its own merits. What changes is only which set is "outside" — an item named by `01_CONTROLLER_V2_ARCHITECTURE.md` is inside.

### G — Hub taxonomy: **MERGED — 8 Hubs contain the 20 Modules**

This resolves **Open Decision #4** of [`00_LEGACY_AUDIT.md:202`](00_LEGACY_AUDIT.md), open since 2026-08-03.

The frozen `docs/backoffice` v1.1 set is **NOT superseded**. Its 20 modules remain the approved statement of *what the Back Office does*. The 8 Hubs of `01_CONTROLLER_V2_ARCHITECTURE.md` §2.2 are the approved statement of *how those modules are contained and governed*. The two are re-homed against each other rather than one discarding the other.

The audit's own recommendation was "superseded". The Owner chose merge instead, and the reason is recorded so the choice is not re-litigated: the two documents describe different axes. Discarding v1.1 would have thrown away 36 approved documents of product definition to settle a question that was only ever about containers.

The binding mapping is [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md). Where that mapping could not be derived from an approved source it says so and does not guess.

---

## Consequences

1. **Controller V2 is NOT COMPLETE.** The Foundation is. See [`STATUS.md`](STATUS.md) § Post-Foundation work and the Phase 0 reconciliation for the gap.
2. **No component of C1–C11 is reopened.** They are complete under Decision A and stay complete; Decision F does not re-audit them.
3. **The Phase 1 feature freeze on business Hubs is lifted**, by the terms of `03_PHASE1_FOUNDATION_DESIGN.md` §1 itself.
4. **Decisions B, C, D, E of 2026-08-13 survive unchanged.** BL-002 remains deferred; required checks remain enabled; C7 remains accepted on existing evidence.
5. **The final manual Owner UAT is unchanged in kind but not in scope**: it now covers the full architecture, not the Foundation alone.

## Still open — not decided here

| Item | Source | Why it is still open |
|---|---|---|
| **Deployment isolation** | [`00_LEGACY_AUDIT.md`](00_LEGACY_AUDIT.md) §5.3, open since 2026-08-03 | Whether the Controller stays in-app at `/admin` or becomes its own deployment. Does not block kernel or capability work; does decide whether modules relocate to `src/controller/` per `01_CONTROLLER_V2_ARCHITECTURE.md` §2.3 |
| **Module table ownership** | `01_CONTROLLER_V2_ARCHITECTURE.md` §2.1 `data.tables` + §4.2 vs [`06_COMPONENT6…CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §1 | The implemented manifest has no `data` section, and the C6 contract states *"modules do not own tables in this codebase."* That silently drops the one-module-one-table rule. Needs a decision before any Hub owns new tables |
| **Break-glass owner recovery (R6)** | `01_CONTROLLER_V2_ARCHITECTURE.md` §10 | Flagged **Critical** at design time, never decided. Owner key loss is still permanent lockout |
