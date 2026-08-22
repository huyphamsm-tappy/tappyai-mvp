# Controller V2 — Component 6: Plugin / Module Registry — CONTRACT

**Status:** CONTRACT — authoritative and current · **Date:** 2026-08-13
**Scope decision:** Owner, 2026-08-13 — **LIFECYCLE-COMPLETE** (narrowed; see §1)
**Absorbs:** Component 5 (Capability Registry), FROZEN by [ADR-018](../architecture/ADR-018-capability-registry-frozen.md)

---

## 0. Why this document exists

C6 had no contract. `ADR-018` says so explicitly:

> *"What this ADR does NOT decide: the internal design of the C6 Plugin/Module Registry (that is C6's own work)."*

Meanwhile `ROADMAP.md` recorded C6 as **"not started"** while `ControllerCore` was already running in production — registering 5 hubs and 8 modules and deriving the entire admin navigation. Both statements were wrong in opposite directions. This document replaces them with a testable contract.

---

## 1. Scope — narrowed by Owner decision, 2026-08-13

The original Phase 1 scope table ([`03_PHASE1_FOUNDATION_DESIGN.md:321`](03_PHASE1_FOUNDATION_DESIGN.md)) reads:

> `6 | Plugin Registry | Manifest validation, dependency resolution, enable/disable/rollback, health checks, migration versioning`

**That historical row is preserved and is not edited.** The Owner narrowed the *delivered* scope for C6 to **lifecycle-complete**, because three of those terms appear in that single table cell and are defined nowhere else in the repository — implementing them would have meant inventing their semantics.

| Item | C6 scope |
|---|---|
| Manifest validation | ✅ in scope |
| Dependency resolution | ✅ in scope |
| enable / disable | ✅ in scope |
| **ready** | ✅ in scope — as a *derived* condition (§3) |
| **deregister** | ✅ in scope — dependency-protected (§4) |
| **Permission-collision validation** | ✅ in scope (§5) |
| **rollback** | ⏸️ **DEFERRED** — undefined anywhere; not implemented, not invented |
| **health checks** | ⏸️ **DEFERRED** — undefined anywhere |
| **migration versioning** | ⏸️ **DEFERRED — still** ([ADR-024](../architecture/ADR-024-module-data-ownership.md)). Its reason is *"undefined anywhere"*, which does not expire; `manifest.data.migrations` was deliberately **not** added. The clause *"modules do not own tables in this codebase"* is superseded — ownership is now expressible, though no module declares any |

The three deferred items remain named debt. They are not removed from the historical scope and are not silently reinterpreted.

---

## 2. Lifecycle

From [`FOUNDATION_01_CONTRACTS.md`](FOUNDATION_01_CONTRACTS.md) §5 (FROZEN):

```
register → validate → enable → ready → (disable) → deregister
```

- **register / validate** — `ControllerCore.register()`. Fail-closed: an invalid manifest, unknown hub, duplicate id, route collision, permission collision, unsatisfied dependency or incompatible controller version registers **nothing**. There is no partial load.
- **enable / disable** — `enable()` / `disable()`, both audited. They move `status` only.
- **ready** — §3.
- **deregister** — §4.

---

## 3. `ready` — a derived condition, not a state

**`ready` is NOT a third `ModuleStatus`.** It is:

```
ready(module) := registered ∧ status === 'enabled' ∧ available === true
```

`available` has exactly one writer in the codebase: `runIsolated()` sets it `false` when a module throws. So **ready means "enabled and not currently broken"**.

`isModuleAccessible()` calls `isReady()` and then consults the PDP, so the two predicates cannot drift apart. Accessibility is `ready ∧ PDP-allows`.

Consequences that are tested, not assumed:

- A module registered with `status: 'disabled'` is never ready.
- A runtime failure removes readiness **without** changing `status`.
- `enable()` does **not** clear a runtime failure — a module that threw stays unavailable.

> ⚠️ **Terminology collision.** The legacy `nav.ts` has `ready:false` entries meaning *"COMING SOON placeholder"*. That is unrelated to this lifecycle condition, and V2 removes those placeholders (`00_LEGACY_AUDIT.md:155`).

---

## 4. `deregister` — dependency-protected, non-cascading

`deregister(moduleId)` removes a module from the registry.

**It is refused when any registered module depends on the target**, directly (`dependencies[].moduleId`) or through a capability the target provides (`dependencies[].capabilityId`).

| Rule | Behaviour |
|---|---|
| Unknown module | rejected |
| Dependents exist | **rejected**, error names every dependent, **sorted** for determinism |
| On rejection | registry **unchanged** — no module removed, no capability released, no audit row |
| Cascade | **never** — dependents are not disabled or removed |
| Orphans | **never** — a dependency pointing at nothing cannot be created |
| Disabled dependent | **still blocks** — a switched-off dependency is still declared |
| On success | module removed; its capability bindings released; audited as `controller.module.deregistered` |
| Routes | freed implicitly — route ownership is derived by scanning registered modules, so no route table exists to update and **no routing architecture is introduced** |

A permission or route freed by deregistration can be claimed by a later module. This falls out of the same derivation and is tested.

---

## 5. Permission-collision validation

Architecture §5 lists the validate step as *"schema · permission collisions · table collisions"*.

**Cross-module collision → registration rejected.** Two modules may not declare the same permission: it would make the navigation's visibility source ambiguous and let one permission grant silently widen a second module's surface.

**Same-module repetition is not a collision.** `permissions` is a declaration list, not a set. The check dedupes the incoming manifest first, so a manifest repeating a permission reports the conflict **once**, not once per repetition.

Verified against the live registry: the 8 production modules declare 8 distinct permissions, so this rule does not reject the existing production registry — pinned by a test that builds the real `buildAdminController()`.

~~**Table collisions are NOT implemented.** Modules do not own tables in this codebase; there is nothing to collide. Deferred with the same discipline as §1.~~

> **SUPERSEDED 2026-08-20 by [ADR-024](../architecture/ADR-024-module-data-ownership.md).** The sentence above was **descriptive, not a repeal** of `01_ARCH` §4.2 — and it was accurate: `ModuleManifest` had no `data` field, so nothing could collide. ADR-024 adds `data.tables` as an **optional** field whose absence means *"owns no tables"*, which is what all eight shipped manifests are. The stated reason for this deferral therefore expired, and **table-collision validation is now implemented**: cross-module collision rejects the registration, same-module repetition dedupes first, and comparison is trimmed and case-folded because an unquoted PostgreSQL identifier folds.
>
> **§1's migration-versioning deferral is NOT affected.** Its reason — *"undefined anywhere"* — does not expire when the field exists, so `migrations` was deliberately not added.
>
> **No module owns a table.** ADR-024 makes ownership expressible and assigns none.

---

## 6. Capability behaviour — unchanged

- `CAPABILITY_GATE_ENABLED` remains **`false`**. C6 does **not** activate it, and does **not** touch the PDP hot path.
- **Unresolved capability dependency → registration is rejected (fail-closed).** This is the authoritative behaviour.

> **Documentation correction.** The lifecycle diagram in [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §5 shows an unresolved capability leaving the module *"disabled with a reason"*. That describes an intended future model, not the shipped behaviour. The registry rejects at registration instead, which is stricter and consistent with the rest of its fail-closed validation. Owner decision 2026-08-13: keep the implementation, correct the description.

---

## 7. Explicitly out of scope

| Item | Why |
|---|---|
| **"Disable → routes 404"** | Routes are Next.js filesystem routes; a manifest listing routes does not control them. Making routes disappear dynamically is a separate capability, not C6. Owner decision 2026-08-13 |
| Capability gate activation | §6 |
| rollback · health checks · migration versioning | §1 |
| Third-party plugin loading | `FOUNDATION_01_CONTRACTS.md` §5: *"Initial scope: first-party only"* |
| Resource Enforcement · F-11 · C8 · C9b · C11 | untouched |

---

## 8. What was already implemented before this contract

Registration · manifest validation (14 rules) · dependency + version resolution (module and capability) · duplicate module id · route collision · enable/disable with audit · failure isolation via `runIsolated` · hub ordering · first-party build-time registration. All live in production via `admin/page.tsx` → `buildAdminController()` → `deriveNavigation()`.

C6 added: `ready`, `deregister` with dependency protection, and permission-collision validation.
