# ADR-024 — Module table ownership: absence means none, and collisions are checked

**Status:** Accepted
**Date:** 2026-08-20
**Context:** Controller V2 — B14 / K-5, the smallest clarification the Owner asked for
**Authority:** [Owner Decision B14, 2026-08-19](../controller-v2/STATUS.md#owner-decisions-2026-08-19-second-set--locked) — *"YES in principle — module data ownership (`manifest.data.tables`, §2.1/§4.2) stays an architectural rule. **Contract first**: name the conflict with C6 §1, decide whether an ADR is needed, write the smallest clarification. **No DB change** until the contract is resolved, and existing modules do **not** thereby acquire tables."*
**Related:** [`01_CONTROLLER_V2_ARCHITECTURE.md`](../controller-v2/01_CONTROLLER_V2_ARCHITECTURE.md) §2.1, §4.2, §5 · [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](../controller-v2/06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §1, §5

---

## The conflict, quoted from all three sides

| Source | Text |
|---|---|
| `01_ARCH` §2.1 | the manifest carries `data: { tables: string[]; migrations: string[] }` — *"ownership assertion; no other module may query these"*. Written as a **required** field |
| `01_ARCH` §4.2 | *"One module owns each table \| Declared in `manifest.data.tables`. Cross-module reads go through the owning module's **capability**, never a direct join."* |
| `01_ARCH` §5 | the validate step is *"schema · permission collisions · **table collisions**"* |
| C6 §1 | migration versioning ⏸️ DEFERRED — *"undefined anywhere; **modules do not own tables in this codebase**"* |
| C6 §5 | *"**Table collisions are NOT implemented.** Modules do not own tables in this codebase; there is nothing to collide."* |
| **implemented** | `src/lib/controller/types.ts` — `ModuleManifest` had **no `data` field at all** |

So a required field of the central contract was absent from every one of the eight shipped manifests, and two C6 deferrals rested on that absence.

## The finding: C6 is not a repeal

C6's sentence is **descriptive**, not normative. *"Modules do not own tables **in this codebase**"* is a measured statement about the registry as it stood — and every word of it is true today. It does not say the §4.2 rule is wrong; it says nothing currently exercises it.

That distinction is the whole resolution, and it is why **neither side needs to be repealed**. What was genuinely missing is the third statement nobody had written down: **what the absence of `data` means.**

## Decision

### 1. `manifest.data` is OPTIONAL, and its absence means the module owns no tables

This is the smallest clarification that removes the contradiction. It changes the status of the eight shipped manifests from *silently non-conformant to a required field* to *conformant, owning nothing* — which is what C6 already measured them to be.

`§4.2 stays an architectural rule`, exactly as B14 directs. Nothing is repealed.

### 2. Table-collision validation is implemented

`01_ARCH` §5 already required it. C6 deferred it on one stated ground — *"there is nothing to collide"* — and **that ground expires the moment the field exists**. A field that can be declared but is never checked is worse than no field, because it reads as a guarantee it does not provide.

The check mirrors permission-collision validation (C6 §5) exactly: cross-module collision rejects the registration, same-module repetition is deduped first and is not a collision, and a rejected registration loads nothing.

Comparison is **normalized — trimmed and case-folded** — because PostgreSQL lower-cases an unquoted identifier. `USER_NOTES` and `user_notes` are one table, and a raw string comparison would let two modules each own it while reporting no conflict.

### 3. `migrations` is deliberately NOT added

§2.1 pairs `tables` with `migrations`. Its semantics are *migration versioning*, which C6 §1 defers as **"undefined anywhere"** — and unlike the collision check, **that reason does not expire** when the field exists. Adding it would create a field nothing can consume: decoration, and the same anti-pattern the Layout Presets audit rejected.

**C6's migration-versioning deferral therefore stands unchanged.** Its table-collision deferral does not.

### 4. The §4.2 naming rule is NOT enforced

§4.2 states a naming convention — `<hub>_<module>_<entity>`, kernel tables unprefixed. It is **not** enforced by this ADR, and that is deliberate rather than an oversight: every table a module could claim today predates V2 (`account_status`, `audit_log`, `event_outbox`, `user_acquisition`), so enforcing the convention would reject the first genuine declaration. A test pins the non-enforcement, so adding the rule later is a deliberate act rather than a silent one.

Whether the convention binds new V2 tables is a separate Owner decision, not taken here.

### 5. No module acquires a table

B14 says it literally, and a test asserts it: **zero of the eight production manifests declare a `data` block.** This ADR makes ownership *expressible*; it assigns none.

**No migration. No DB change. No production mutation.** B14's constraint is met by construction — nothing here touches the database.

## Classification under Constitution §8.2

**Design Change.** It alters the module manifest contract and adds a validation gate, and §8.2 directs that *"if there is any doubt whether a change is Editorial or Design, it is treated as a Design Change."* Hence this ADR, per the Owner's instruction to *"decide whether an ADR is needed"*.

## Consequences

**Positive.** The central contract and its implementation agree for the first time. The first module that genuinely owns a table — Module 08 over `account_status` is the obvious candidate — can declare it, and a second module claiming the same table is refused at registration rather than discovered later as a silent shared-write.

**Costs.** One optional field and one validation loop in the registration path. The check is O(modules × tables) over a registry of eight.

**Residual, stated rather than hidden.**

- **Ownership is declarative, not enforced at the query layer.** §4.2's *"no other module may query these"* is an assertion the registry records; nothing stops a module importing a repository and reading another's table. Enforcing that needs the `src/controller/modules/` directory shape that `01_ARCH` §1 rules 1–3 describe and the repository has not adopted — the same reason those three Architecture Guard rules are deliberately unwritten.
- **Migration versioning stays undefined**, so a module declaring a table still has no contract for how its schema evolves.
- **No table is currently owned**, so the collision check protects a set of size zero until a module declares one.

## What this ADR does NOT change

- **`01_ARCH` §4.2** — the rule stands, unedited.
- **C6 §1's migration-versioning deferral** — stands, and its stated reason still holds.
- **Any manifest.** Zero modules gain a `data` block.
- **The database.** No migration, no DDL, no production mutation.
- **The §4.2 naming convention** — neither enforced nor repealed.
- **`CAPABILITY_GATE_ENABLED`**, the PDP, or any authorization path.
