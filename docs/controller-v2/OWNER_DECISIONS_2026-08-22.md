# Controller V2 — Owner Decisions, 2026-08-22

**Status:** DECISION RECORD — authoritative and current
**Baseline at decision time:** `origin/main` = `4f23a66` · C1–C11 shipped · Modules 01, 04, 08, 09, C11, B8 live and production-UAT'd
**Input:** the closure decision checklist presented 2026-08-22, after the authenticated Owner UAT recorded in [`STATUS.md`](STATUS.md)
**Authority:** these decisions were made by the Owner. They are recorded in effect, not reinterpreted.

**Relationship to the earlier records:** [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md) and
[`OWNER_DECISIONS_2026-08-19.md`](OWNER_DECISIONS_2026-08-19.md) are untouched. **Decision F stands** — Definition of
Done is the full architecture of [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md), and nothing
below weakens it. **Decision G stands** — the hub taxonomy is unchanged; D7 below only ratifies a reading that
[`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md) §2 already stated and refused to act on alone.

---

## Why this record exists

Every remaining Controller V2 item was in one of three states: an Owner decision no authoritative source answered, an
external prerequisite, or an authenticated UAT. Class 1 — work that was safe to implement without asking — had been
empty since `8b9bf3b`. This record closes the first category.

**Two items were removed from the question set before it was put to the Owner, because the repository already answered
them.** Both had been carried in `STATUS.md` as open, and both were stale:

| Carried as | Measured on 2026-08-22 |
|---|---|
| `/org/memberships` — *"F-10 gate plus four further decisions; the repository still contains no authorization"* | **All five are resolved.** [`FOUNDATION-10_OWNER_DECISION_PACKAGE.md`](FOUNDATION-10_OWNER_DECISION_PACKAGE.md) records *"✅ DECISION C — RESOLVED: OPTION 1, by the Owner, 2026-08-10"*, with A, B, D and E executed, committed as `514505a`. Production carries **one active `DEPARTMENT_HEAD` membership** (`ai_data`, created 2026-08-10). F-10 is live |
| `marketing` · `ai` · `operations` hubs unregistered — *"Owner decision"* | **Derived, not decided.** Taxonomy §1 already assigns modules to all three under Decision G. A hub with no module renders a bare heading — the exact case the Phase 7 mutation suite kills. They register when their first module does |

---

## The decisions

### D1 — Schema authority: **SPLIT**

`01_ARCH` §4.1 draws both `module_registry` and `platform_settings` with column-level detail. `04_Database_Architecture.md`
— declared *the* authoritative schema source by ERRATA-005 — mentions **neither** (measured: 0 occurrences of each). The
Owner split the two rather than ruling on the pair.

#### D1a — `module_registry`: **SUPERSEDED by registry-in-code. K-8 is OUT OF SCOPE, no migration.**

This applies **Decision B15** to the identical shape. B15 held that `01_ARCH` §6.3 (*"roles are data in
`role_definitions`"*) is superseded by the accepted C3/C4 registry-in-code implementation, and that `role_definitions`
and `permission_grants` are therefore not V2 blockers. `registry/adminModules.ts` is a module registry in code, built,
shipped and enforced. The same reasoning gives the same answer.

**Consequence:** K-8 closes as out of scope. `module_registry` is not a Definition-of-Done gap. No table, no migration,
no adapter.

#### D1b — `platform_settings`: **`01_ARCH` §4.1 IS the schema authority. Migration authorized. Runtime tier authorized.**

`platform_settings` is not the same shape, and the difference is measurable rather than aesthetic: **there is no in-code
equivalent.** [`configProvider.ts`](../../src/lib/controller/configProvider.ts) says so in its own header —

> *"The runtime (DB/API) tier is still an explicit adapter returning undefined: it needs the `platform_settings` table of
> `01_CONTROLLER_V2_ARCHITECTURE.md` §4.1, which does not exist. It returns undefined rather than a fake value so
> precedence falls through honestly."*

The **Configuration Provider is named in Decision F's Definition of Done.** A provider whose highest-precedence tier is a
stub is not that provider. So this is a genuine DoD gap, and it is the only one of the four schema-blocked items that is.

**Consequence:** one migration under the ADR-017 pattern, and the runtime tier implemented against it. `04` carries an
errata note pointing at §4.1 for Controller-owned tables it does not define.

### D2 — Layout Presets

1. **Sequencing — after Phases 8/9/10.** Not an Analytics-only subset first. Five of the six presets target hubs those
   phases create; building the layout before the room is the inversion the Phase 5 Event Bus audit already found.
2. **Preset semantics** — a preset is a **layout configuration per hub/page**. It is **not bound to a user**. It has an
   explicit default. It is implemented **only once the target hub/page exists**. No preset may be invented beyond the six
   the contract names.
3. **RULE 8/9/10 — `00_Constitution` governs.** Rule 8 = *AI Assists, Humans Decide* · Rule 9 = *Privacy by Default* ·
   Rule 10 = *Immutable Audit Log*. No alternative rule set is to be created. `01_ARCH` §8 cites a set that exists
   **nowhere in the repository**; that citation is corrected as an erratum.

**Consequence:** Layout Presets stay **DEFERRED by decision**, with the sequencing and semantics now recorded so the
deferral has an end condition instead of being open-ended. §8's uncited rule reference is corrected in this change.

### D3 — Date range: **Analytics only · not persisted · in the page header**

Filters **time-series data only**. Does **not** apply to RBAC, Settings or Deals. Semantics are not to be widened beyond
the contract.

**Consequence:** the scope that was undefined is now defined, and the surface remains unbuilt until it is built to this
scope. The existing test asserting that **no preset string renders** stays — it is what stops the surface appearing by
accident, and it now guards a decided boundary rather than an open question.

### D4 — Command Palette `act`: **navigate-only is final for V2**

No mutating commands. No action entries.

### D5 — Command Palette `search`: **navigate-only is final for V2**

Not widened into user, deal, audit or entity search.

**Consequence of D4 + D5:** the Command Palette is **COMPLETE, by decision** rather than blocked. Two tests already
enforce exactly this boundary — one fails if a mutating command appears, one fails if a query matching a user, deal or
audit row returns anything. They were written when the gap was open; they are now the executable form of this decision.

### D6 — `/admin/org/memberships`: **AUTHORIZED**

A Controller surface for department memberships. The existing API and the F-10 feature stay as they are, and the
authorization model is not changed.

**Consequence:** this is the **eighth** new UI surface, following `/admin/users` (*"This is a seventh"*). It is
**read-only**: the roster is rendered, and assignment, suspension and removal stay where they already are — in the
API, behind `security.membership.manage`. Destructive UAT is not authorized (below), so shipping mutation controls
would ship a surface that cannot be verified.

### D7 — Module 17, Module 20, and further business modules

- **Module 20 Shared Services — RATIFIED as cross-cutting / kernel capability, not a Hub member.** This is the reading
  taxonomy §2 already gave: *"a cross-cutting service layer, which in V2 terms is kernel + capability territory, not a
  Hub member. Placing it under a Hub would contradict `01_ARCH` §5."* It refused to act on its own reading without the
  Owner; it now has the Owner.
- **Module 17 Settings — hub placement follows the existing architecture/taxonomy. `tappy.hub.configuration` is NOT
  retired**, because this decision does not supply the basis to retire it. The hub stays on HOLD exactly as taxonomy §3
  places it.
- **No new business module enters V2** beyond those already defined and authorized.

---

## Not decided — and deliberately not

| Item | State |
|---|---|
| **BL-002** | No second `super_admin` exists. **Not to be simulated.** External prerequisite; only the Owner can create the account |
| **Destructive UAT** — B8 recovery · M08 ban/suspend · C11 revocation · M09 moderation action | **NOT authorized.** Not to be executed |
| **`moderation.queue.assign`** | **NOT authorized** while no RBAC authority defines it. `12_RBAC` §3 lists seven moderation rows and none is Assign; `04` §4.4's `assigned_to` column is a place to record an assignee, not an authority to make one |
| **M09 content-safety writer** | **OUT OF CONTROLLER V2 SCOPE.** Content Safety Gate, under ADR-024, which `moderationModule.ts` declares |

---

## Consequences for the burn-down

| Bucket | Before | After |
|---|---|---|
| Phase 7 — 5 open | 5 blocked on Owner decision | **2 COMPLETE by decision** (CP `act`, CP `search`) · **2 DEFERRED with scope defined** (Layout Presets, date range) · **1 unblocked to implement** (the runtime config tier D1b enables) |
| K-8 `module_registry` | blocked, no schema | **OUT OF SCOPE** (D1a) |
| Module 20 | ambiguous | **RATIFIED as kernel** (D7) |
| Module 17 | ambiguous | hub unchanged; still schema-blocked, now with a schema authority (D1b) |
| `/org/memberships` | wrongly recorded as blocked | **AUTHORIZED** (D6) |
| BL-002 · destructive UAT | open | unchanged, and explicitly not simulated |

**Controller V2 is not declared COMPLETE by this record.** It records what may now be built and what stays deferred with
a stated reason. Completion is measured against Decision F, in `STATUS.md`, after production UAT.
