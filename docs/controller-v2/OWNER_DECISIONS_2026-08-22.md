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

---

# D-K1 — the actor↔capability binding: **ROLE-DERIVED**

**Taken 2026-08-22, after the decisions above.** Recorded here rather than in a new file because it is the same date and
the same closure workstream.

## The decision, as given

> For Controller V2, effective capabilities are initially derived from the actor's effective role permissions.
> Capabilities are a read-only derived abstraction, NOT an independently assigned authorization source.
> `requirePermission()` remains the authoritative mechanism for action authorization.
> The capability-resolution boundary MUST remain extensible so future policy, membership, or other explicitly
> authorized capability sources can be introduced without changing the Actor contract or creating a second
> authorization system.

## What it closes

`Actor.capabilities` has existed since Component 2 and was **permanently empty**. The gap was never an implementation
gap: [`FOUNDATION_01_CONTRACTS.md`](FOUNDATION_01_CONTRACTS.md) §4 defines a capability as something a **module**
provides, with a provider and consumers, while the PDP's third decision step tests **`actor.capabilities`**. Nothing
authoritative said how an **actor** acquires one, so K-1 was classified as *"needs an Owner decision, not an
implementation"*. D-K1 supplies that missing edge.

## As implemented

| Property | Effect |
|---|---|
| **Canonical source** | the permission registry, read through the **same `roleMap` the PDP resolves from** — one mapping, consulted twice, so the projection cannot drift from the permissions actually granted |
| **Projection** | union of `capability` across every permission the actor's roles grant |
| **Shape** | deterministic · de-duplicated · **sorted** · **frozen** |
| **Role inheritance** | **none** — `roleMap` records exactly the permissions declared per role, so a role broad in one module and absent from another projects correctly |
| **Empty case** | an actor with no roles receives `NO_CAPABILITIES` **by identity**, so nothing about the pre-K-1 behaviour changed |
| **Not derived from** | membership · department · policy · per-user grant · any database table |
| **Authority** | unchanged. `Actor.capabilities` is a read-only projection and **never** an authorization input |
| **`CAPABILITY_GATE_ENABLED`** | **still `false`.** Enabling it is a separate decision and was not taken |

Projection as measured from the registry:

| Role | Capabilities |
|---|---|
| `analyst` | 2 — `analytics.read` · `controller.dashboard` |
| `moderator` | 4 — + `moderation.review` · `users.manage` |
| `admin` | 8 — + `audit.read` · `commerce.deals` · `security.sessions` · `settings.read` |
| `super_admin` | 9 — + `security.rbac` (the full declared set) |

## Extensibility — the boundary, and the one rule about it

`CAPABILITY_SOURCES` is the extension point: a frozen list of sources, unioned by `resolveActorCapabilities`. Every
consumer depends on `Actor.capabilities` and on nothing else — not on roles, not on the registry, not on how any source
works. A future authorized source is therefore **appended to that list**, with no change to the Actor contract and no
logic scattered across consumers.

**Controller V2 has exactly ONE source: role-derived.** No second source was designed, sketched or stubbed, and none may
be added without its own Owner decision.

## ⚠️ The mathematical limitation — stated so it is never mis-sold

**Role-derived capabilities make the PDP's capability gate vacuous.** The derived set is
`{ P.capability : P ∈ granted(actor) }`, so any permission an actor holds necessarily contributes its own capability.
Step 3 of `authorize()` therefore **can never deny anything step 4 would allow**.

Turning the gate on would add **no security boundary**. It must not be described as a second authorization layer,
because it is not one. The gate becomes meaningful only when a source can supply *or withhold* a capability
**independently of the permission** — which is precisely why the boundary is a list of sources rather than a single
function.

## Relationship to ADR-018 and FOUNDATION-01 §4

D-K1 **clarifies and supersedes the actor half only**:

- ✅ **Superseded** — the statement that `capabilities.ts` and the PDP capability branch *"remain reserved and inert
  until C6 activates them"*, insofar as it applies to **`Actor.capabilities`**. That field is now populated. The PDP
  branch itself remains inert (`CAPABILITY_GATE_ENABLED = false`), so ADR-018's operative safety claim is untouched.
- ❌ **NOT superseded** — the **module** capability axis. `{id, version, owner, permissions[], dependencies[],
  provider(moduleId), consumers[]}`, provider/consumer binding, and `ControllerCore`'s registry are **unchanged** and
  were not touched by this work. Module capability and actor capability are two different axes that happen to share an
  id space.

ADR-018 carries a dated pointer to this decision in its `Supersedes/relates` header. **No text was removed from it** — a
decision record is a historical instrument, the same treatment Decision F gave Decision A.

## Evidence

45 targeted tests, written **red before implementation**; the RED was proven to be caused solely by the missing module
(project-wide `tsc` reported exactly one error, the missing import). Mutation **13/14 killed**. Full suite
**7102 passed · 0 failed**, required-suites gate **33/33**. One production behaviour changed: one line in
`rbac.ts`. No migration, no schema, no API, no UI.

The single surviving mutant is **equivalent and recorded as such**: the `if (capability)` guard cannot fire, because
`roleMap` is built from the same registry the lookup consults, so every id it yields resolves. It is kept only because
the return type of `registry.get` is optional.

---

# D-K3 — what "a non-no-op Event Bus" means for Controller V2

**Taken 2026-08-23.** Decision F names *"a non-no-op Event Bus"* in the Definition of Done and **defines it nowhere**.
This decision supplies the missing definition. Recorded here alongside the other decisions of this closure workstream.

## The decision, as given

> In Controller V2, *"non-no-op Event Bus"* is satisfied when the production `EventSink` has a real implementation that
> receives and processes the existing `controller.*` lifecycle events.
>
> **K-3 in V2 does NOT require:** Commerce.Orders · `commerce.order.refunded` end-to-end · an Analytics consumer · a
> Marketing.Push consumer · reopening Phase 8 / D7 · migrating existing business mutations to manufacture a demo event ·
> changing `fn_grant_admin_role` or any G1 security-critical RPC.
>
> The Event Bus is **not** an authorization authority. `requirePermission()` remains the authority. Capability binding
> is unchanged. The `ControllerCore` capability axis is unchanged.

## Why the definition was needed — and why the §7 path was not available

`01_ARCH` §7 names the first producer itself: **Commerce.Orders** publishes `commerce.order.refunded`, consumed by
Analytics and Marketing.Push. **All three are `❌ not started`** in taxonomy §1, and **D7 forbids adding a new business
module to V2**. Requiring the §7 flow would therefore have made Decision F demand something another Owner decision
prohibits building — the Definition of Done would contradict D7 and be unreachable inside V2. This decision resolves
that by defining the bar at the kernel's own event stream instead.

Three independent sources also blocked a first producer on the durable path, and none of them is bypassed here:

1. **C8 §10** — *"No producers · no consumers · … no migration of existing business mutations to create a demo event."*
2. **C8 §5** — a producer must be a **database object**: `fn_outbox_publish` has `EXECUTE` revoked from `PUBLIC`, `anon`,
   `authenticated` **and `service_role`**, so the only possible caller is another `SECURITY DEFINER` function. The one
   realistic candidate is `fn_grant_admin_role` — the constitutional G1 fix, proven on production by BL-002 the day
   before. Re-issuing it is explicitly excluded above.
3. **C8 §8** — 0 consumers ⇒ **0 outbox rows**, arithmetically. A producer today would insert nothing.

## ⚠️ What this decision does NOT claim

It does not make the Event Bus durable, ordered, retried or delivered. Those are the **outbox's** guarantees, and the
outbox still has zero consumers by design. `events.ts` already states the boundary — *"An EventSink emit is not an
outbox publish and carries none of its guarantees."* — and that stays true.

It also must not be described as adding a security or authorization property. It adds **observability of the kernel's
own lifecycle**, nothing more.

---

# D8 — Density: **DEFERRED**

**Taken 2026-08-23.** The last of the six Phase 7 shell surfaces B5 unlocked, and the only one that had never been put
to the Owner at all. Recorded here alongside the other decisions of this closure workstream, the same treatment D-K3
received.

## The decision, as given

> Density is **DEFERRED** for Controller V2. It is a UX preference, not a kernel or security capability. No
> persistence, schema, API or state architecture may be created for the sole purpose of closing it.

## Why it needed a decision rather than an implementation

`01_ARCH` §8 Standards names it — *"User-selectable comfortable/compact. Operators live here all day; that is not a
preference detail."* — and B5 unlocked it. It was then carried in `STATUS.md` as *"DEFERRED BY DECISION (D2, D3)"*.
**MEASURED 2026-08-23: neither decision mentions it.** D2 governs Layout Presets, D3 governs the date range; the string
`density` appears **zero times** across all three Owner decision records. It was an undecided item wearing a decided
item's label.

The same `STATUS.md` row gave its blocker as *"the preference store `platform_settings` provides"*. **That is also
false, and measurably so:** `20260822_k2_platform_settings.sql` constrains
`CHECK (scope IN ('global','hub','module'))`. There is **no `user` scope**, so the table cannot hold a per-user
preference at all. Density's real dependency was never satisfied by K-2 and was never named correctly.

So the honest position is that Controller V2 has **no actor/user preference contract**, and inventing one to render a
two-value toggle would be the largest piece of new architecture in the entire closure workstream — added last, for the
least consequential surface, purely to make a checklist read COMPLETE.

## Conditions for return

Density re-enters scope when **all three** hold, and not before:

1. an official **actor/user preference contract** exists — where a per-user preference lives and who owns it;
2. an official **persistence architecture** for user preferences exists (`platform_settings` is not it, by its own
   CHECK constraint);
3. the Owner decides that preference UX belongs in the Controller shell.

## ⚠️ What this decision does NOT claim

It does not claim Density is unnecessary, and it does not retire the `01_ARCH` §8 commitment — the architecture keeps
saying what it says. It narrows what **Controller V2** delivers, exactly as D2 did for Layout Presets. Nothing shipped
depends on Density: the Controller renders at a single density today and every surface is UAT-verified at it.

---

# D9 — Dark mode: **DEFERRED**

**Taken 2026-08-23.** Same workstream, same shape, and it needs its own record because dark mode is named by **three**
authorities rather than one.

## The decision, as given

> Dark mode in the Controller is **DEFERRED** for Controller V2. It is shell UX, not Controller kernel or security. No
> theme persistence or theme-state architecture may be opened for the sole purpose of closing the Definition of Done.

## The three authorities, stated so the deferral is not mistaken for an oversight

| Source | What it says |
|---|---|
| `01_ARCH` §8 Standards | *"Dark mode — First-class, not an afterthought — operators work at night."* |
| `FOUNDATION_01_CONTRACTS.md` §13 | names *"dark mode + responsive"* inside the UI architecture boundary — **the boundary B5 approved** |
| `17_UI_UX_Standards.md` §7 | *"The Back Office supports light and dark mode… Implementation: Same Tailwind dark mode classes as existing app."* — **promoted to implementation authority by B5** |

Deferring an item three sources name is a real narrowing of scope, and it is recorded as one. The precedent is exact:
B5 *"unlocks the six remaining Phase 7 surfaces"*, and **D2 then deferred one of those six anyway.** An unlock is
permission to build, not an obligation to build inside V2.

## 🔑 The measured gap — narrower than "no dark mode exists", and that is why it still cannot be closed cheaply

Measured on `d1ae429`, because the deferral must not imply a bigger hole than the one that is there:

| Fact | Measured |
|---|---|
| Back-office `.dark` token block | ✅ **exists in full** — `globals.css:69-82`, every shadcn token has a dark value |
| `darkMode: 'class'` | ✅ configured in `tailwind.config.ts` |
| Admin components on semantic tokens | ✅ **34 of 51**; only 1 uses raw `gray-`/`white` |
| Anything that puts `dark` on the document inside `/admin` | 🔴 **nothing.** `Header.tsx:57/77` is the only code in the repository that toggles it |
| Does the Controller render `Header`? | 🔴 **No.** `src/app/admin/layout.tsx` renders `AdminShell` |

So the tokens are ready and the surface is ready; what is missing is the **switch**, and the switch cannot simply be
imported. `Header` is consumer-app code, and Architecture Guard rule `no-consumer-app-import-in-controller` — enforced
in CI since 2026-08-19 — exists precisely to stop the Controller depending on it. Closing dark mode therefore means
authoring a **theme-preference contract on the Controller side of that boundary**: where the preference lives, whether
it is per-user or per-device, and how it is read server-side without a flash. That is the architecture this decision
declines to open at closure time.

> **A known consequence, recorded rather than discovered later.** Because `Header` sets `dark` on `<html>` and the
> Controller shares the root layout, a client-side navigation from the consumer app with dark mode on can carry the
> class into `/admin`. The back-office tokens would flip coherently; the 17 components not yet on semantic tokens would
> not. **This is derived from the source, NOT runtime-measured** — reproducing it requires an authenticated
> `@tappyai.com` session. It is a latent inconsistency, not a defect of any shipped surface, and it is a further reason
> the switch needs a contract rather than an import.

## Conditions for return

1. an official **theme-preference contract** for the Controller side of the Guard rule 4 boundary;
2. official **shell integration** for it;
3. the Owner decides dark mode belongs in Controller shell UX.

## ⚠️ What this decision does NOT claim

It does not retire `01_ARCH` §8, `FOUNDATION_01` §13 or `17_UI_UX_Standards` §7 — no text is removed from any of them,
and §8 carries a dated pointer to this decision instead. It does not claim the Controller is unusable at night; it
claims the Controller is **light-only in V2**, deliberately, with the reason on the record.
