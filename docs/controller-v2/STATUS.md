# Controller V2 — Current Status

> ## 🔒 SINGLE SOURCE OF TRUTH
> **This document is the only authoritative statement of Controller V2 project status.**
> Every other document in `docs/controller-v2/` is either a historical record or a design artefact. Where any of them states a status — `READY`, `NOT READY`, `NOT EXECUTED`, `Draft`, `Awaiting approval` — **this document overrides it**. Historical documents are deliberately not rewritten; they carry a banner pointing here.

**Last updated:** 2026-08-15

---

## Official project status

| Item | Status |
|---|---|
| **Foundation Phase** | **CLOSED** |
| **Components 1 & 2** — Platform Owner + Identity | **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** |
| **BL-002** — G1 Production Validation | **OPEN** · type: **Production Acceptance Task** |
| **Component 3** — RBAC | **ACCEPTED · IN PRODUCTION** — merge commit `933c4f8` |
| **Component 4** — Audited PDP | **ACCEPTED · IN PRODUCTION** — merge commit `28f68c1` |
| **Component 5** — Capability Registry | **FROZEN** — [ADR-018](../architecture/ADR-018-capability-registry-frozen.md), merges into Component 6 |
| **Component 9a** — single admin-client construction point | **ACCEPTED · IN PRODUCTION** — merge commit `e8d4eb9` |
| **Component 7** — Audit Hardening | **ACCEPTED · IN PRODUCTION** — merge commit `f3caf59`, live in production `526157a`; F-04 grant-model source-sync (PR #18) and PH-0 audit-function hardening applied. Accepted on production evidence per Owner Decision E, 2026-08-13. See [RELEASE_READINESS_COMPONENT_7.md](RELEASE_READINESS_COMPONENT_7.md) (historical, pre-merge) |
| **Component 10** — Rate Limiting | **ACCEPTED · IN PRODUCTION** — merge commit `c226417`, verified on production 2026-08-13. Distributed limiter on a shared Upstash store, fail-closed, `Retry-After` on all 11 admin routes. **Audit finding S4 (HIGH) is CLOSED.** Contract: [`10_COMPONENT10_RATE_LIMITING_CONTRACT.md`](10_COMPONENT10_RATE_LIMITING_CONTRACT.md) |
| **Component 6** — Plugin Registry | **LIFECYCLE-COMPLETE** — contract [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md). `register → validate → enable → ready → disable → deregister` + permission-collision validation. rollback / health checks / migration versioning **deferred** (undefined in any authoritative source), capability gate remains inert |
| **Component 9b** — Secret Manager | ✅ **ACCEPTED · IN PRODUCTION** — typed config boundary + deploy-time gate over 5 required variables, closes **D5**. Verified from the production build log rather than a badge: every production deploy, including `ed7ad3b`, prints `[C9b] configuration OK — 5/5 required variables present and well-formed` before `next build` runs. Contract: [`09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md`](09B_COMPONENT9B_TYPED_CONFIG_CONTRACT.md) |
| **Component 8** — Event Bus | ✅ **ACCEPTED · IN PRODUCTION** — merge commit `0ce30a9` (PR #58); migration `20260813_c8_event_outbox.sql` applied to production 2026-08-15 and verified read-only from the PostgreSQL catalog: `event_outbox` + 3 functions exist · **`fn_outbox_publish` has EXECUTE for none of anon/authenticated/service_role** (P4 intact) · claim+settle granted to `service_role` only · table grants are `service_role SELECT` only · `UNIQUE (event_id, consumer_id)`, both CHECKs, 4 indexes, RLS on with 0 policies · deployed bodies carry `FOR UPDATE SKIP LOCKED`, claim-time `attempts + 1`, the `>= 3` DLQ boundary and `ON CONFLICT` · 8 cron jobs registered. Contract: [`08_COMPONENT8_EVENT_BUS_CONTRACT.md`](08_COMPONENT8_EVENT_BUS_CONTRACT.md) |
| **Component 11** — Session Security | ✅ **ACCEPTED · IN PRODUCTION** — merge commit `ed7ad3b` (PR #62); migration `20260814_c11_session_security.sql` applied to production 2026-08-15 and verified read-only: all four functions exist, every one `SECURITY DEFINER` with `search_path = public, pg_temp`, EXECUTE granted to **`service_role` only** (anon and authenticated have none), and **no function references `refresh_token_hmac_key` or `refresh_token_counter`**. Deployed bodies carry the `is_anonymous` exclusion, `fn_is_platform_owner` Owner protection, and the `AT TIME ZONE` conversion. P-1…P-7 ratified 2026-08-13; O-1 (revocation **immediate** — 403 `session_not_found` with 3597 s of token life left), O-2 (3600 s TTL, therefore **not** the guarantee) and O-3 measured 2026-08-14. Contract: [`11_COMPONENT11_SESSION_SECURITY_CONTRACT.md`](11_COMPONENT11_SESSION_SECURITY_CONTRACT.md) · [ADR-021](../architecture/ADR-021-c11-auth-sessions-dependency.md) |
| **Definition of Done** | **FULL ARCHITECTURE** — Owner Decision **F**, 2026-08-19, which **supersedes** Decision A (*COMPONENT-COMPLETE, C1–C11*) by date. C1–C11 is now a **precondition**, not the definition: Controller V2 is complete when [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) is implemented and verified. See [`OWNER_DECISIONS_2026-08-19.md`](OWNER_DECISIONS_2026-08-19.md) |
| **Foundation (C1–C11)** | ✅ **COMPLETE** — the precondition above is met. Every row in this table below is Foundation scope |
| **Controller V2 overall** | ⏳ **NOT COMPLETE** — Hub taxonomy fixed by [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md); the architecture gap is recorded in the Phase 0 reconciliation, 2026-08-19 |

> **Rows 3, 4 and 9a were corrected on 2026-08-07.** This table had said
> "Component 3 — READY TO START · NOT STARTED" since 2026-08-04 while all three
> components were live in production. It was last edited on Component 4's
> branch and then went stale through two merges. A document that declares itself
> the single source of truth is the worst place for drift, so the correction is
> recorded here rather than filed as a backlog item.
>
> **Two rows were corrected on 2026-08-13 (post-C8).** The combined row
> *"Components 8, 11 — NOT STARTED — no design document exists for either"* was
> stale for C8: it is merged (`0ce30a9`), deployed, and has a contract. It is
> split above so C11's genuinely undefined scope is not hidden behind C8's
> completion. MEASURED: `0ce30a9` is an ancestor of `origin/main`; production
> `/api/version` returns it; `vercel crons ls` reports 8 jobs including
> `/api/cron/outbox-drain`. Separately, [`ROADMAP.md`](ROADMAP.md) row 10 read
> *"Rate Limiting | not started"* while this document recorded C10 as **ACCEPTED ·
> IN PRODUCTION** since 2026-08-13 — MEASURED: `c226417` is an ancestor of
> `origin/main`, and 11/11 admin routes call the distributed limiter. The
> roadmap row is corrected there, in the same style as rows 6 and 8.
>
> **Row 7 was corrected on 2026-08-08 (FOUNDATION-01 reconciliation).** It had
> said "READY TO OPEN PR — not merged, not deployed" while C7 was in fact merged
> (`f3caf59`), live in production (`526157a`), and hardened by F-04 (PR #18) and
> PH-0. MEASURED: `f3caf59` is an ancestor of `origin/main`; `/admin/audit` and
> `/api/admin/audit` serve on production; the `audit_log` hash chain is active.
> The three states are kept distinct: **IMPLEMENTED** (code merged) and
> **DEPLOYED** (running in prod) are both true; **UAT-VERIFIED** is not yet claimed
> — the owner's final production UAT is deferred. `RELEASE_READINESS_COMPONENT_7.md`
> is a pre-merge point-in-time report and is left intact with a correction banner.

**Scope of "Foundation Phase: CLOSED".** This closes the Foundation *establishment* phase — the legacy audit, the Phase 0 audit, the approved architecture, and the two components that constitute the security foundation everything else builds on, now live in production. It does **not** mean all eleven Phase 1 components are built: Components 3–11 remain, and their state is tracked in [`ROADMAP.md`](ROADMAP.md). Read the two together.

---

## Components 1 & 2 — Platform Owner + Identity

# ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK

Merged, deployed and running in production. One production acceptance task remains open — see [BL-002](BACKLOG.md#bl-002--g1-production-validation). It is **not** a blocker, **not** a failed deployment, and **not** development work.

| | |
|---|---|
| Merge commit | `fb21ebe` (merge commit — history preserved, 12 commits) |
| Production deployment | Ready |
| Database migrations applied | `20260803_platform_owner.sql` |
| Platform Owner | bootstrapped, exactly one active |
| `PLATFORM_OWNER_USER_ID` | configured in Production + Preview + Development |
| Deferred hardening | ✅ **APPLIED 2026-08-19** — [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md) layer 3. This row read "**NOT applied**" until the gate (every Phase 1 component shipped and soaked) was met. See [Post-Foundation](#post-foundation-work) |

---

## Post-Foundation work

Items whose gate was *"after the Foundation"* rather than *"inside a component"*. None of them blocks C1–C11 completion, for one of two reasons: [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md) § Consequences 4 names BL-002, required checks, ADR-017 and all `BL-*` as non-blocking; the rest sit outside C1–C11 because their own contracts place them there. They are recorded here because two of them have now been executed, and this document is where their state is authoritative.

| Item | Source | Status |
|---|---|---|
| **Service-role hardening** | [ADR-017](../architecture/ADR-017-service-role-hardening-strategy.md) | ✅ **APPLIED to production 2026-08-19.** Preconditions verified first: every Phase 1 component shipped and soaked · no direct `INSERT/UPDATE/DELETE` on `admin_roles` (4 call sites) or `platform_owner` (1 call site) anywhere in `src/` · all three functions `prosecdef = true`, owner `postgres`, `search_path = public, pg_temp` · rollback window agreed. **MEASURED after:** `service_role` on both tables went `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` → **`REFERENCES,SELECT,TRIGGER,TRUNCATE`**; `has_function_privilege('service_role', …, 'EXECUTE')` still true for all three RPCs, and still **false** for `anon` and `authenticated`; `service_role` reads returned 2 role rows and 1 active owner, no `42501`. Rollback was not needed and was not used |
| **Required checks on `main`** | Owner Decision C | ✅ **ENABLED 2026-08-19.** Was *"Not yet executed"*. Required contexts are the four jobs the two named workflows actually publish — `Test suite` and `Types, lint, SQL grants` (`Regression Gate`), `AI architecture rules` and `Brand registry validation` (`Architecture Guard`) — with `enforce_admins = true`, matching "no bypass outside an approved policy". `strict` and PR-review requirements were left off because Decision C does not ask for them |
| **Capability gate activation** | [ADR-018](../architecture/ADR-018-capability-registry-frozen.md), [`06_…CONTRACT`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §7 | ⏸️ **DEFERRED — and not yet due.** ADR-018 assigned activation to C6; C6's contract then placed it explicitly out of scope. **MEASURED:** `CAPABILITY_GATE_ENABLED = false`, `Actor.capabilities` is always `NO_CAPABILITIES`, and 18 permission definitions declare a `capability`. Enabling the gate today would deny all eighteen and lock the admin surface out. What is missing is a capability *producer* binding manifests to actors — not an authorisation |
| **C6 rollback · health checks · migration versioning** | [`06_…CONTRACT`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §1 | ⏸️ **DEFERRED by Owner, 2026-08-13** — named debt, undefined in any authoritative source |
| **Hub migration** | [`03_PHASE1_FOUNDATION_DESIGN.md`](03_PHASE1_FOUNDATION_DESIGN.md) §1 | ✅ registration complete — five hubs run through the kernel (`dashboard`, `analytics`, `commerce`, `configuration`, `security`), Commerce included. Route control is explicitly out of C6's scope (§7) |
| **BL-\*** | [`BACKLOG.md`](BACKLOG.md) | ⏸️ non-blocking under Decision A ([§ Consequences 4](OWNER_DECISIONS_2026-08-13.md#consequences)). **BL-C7-01 is closed on production by measurement:** all three Component 1 `SECURITY DEFINER` functions report `EXECUTE` false for `anon` and `authenticated` |

### Phase 4 — capability binding + Configuration Provider (2026-08-19)

The first phase after Decision F. **PARTIAL** — what shipped, and what it is still blocked on.

| Contract clause | Delivered |
|---|---|
| §1 *"disabled ⇒ route + nav + **capability** unreachable"* | ✅ `bindCapability` refuses a capability whose provider is disabled or has been isolated by a failure. It previously served the binding regardless |
| §1 *"`resolveDependencies()` — **topological**"* | ✅ `registerAll()` orders a batch by dependency, detects cycles by name, and rolls the batch back on any refusal. `register()` alone was insertion-ordered, which made declaration order a hidden contract |
| §4 capability record | ✅ `{id, version, owner, provider, permissions, dependencies, consumers}`, every field derived from the providing manifest. One provider per capability is now enforced; a second is refused rather than silently taking over |
| §8 *"fail-closed, **audited**"* | ✅ a refused registration writes `controller.module.registration_failed` and emits. It previously returned errors in silence |
| §2 *"a Hub … owns a permission scope"* | ✅ `permissionScope` gates every module in the hub. **MEASURED: a no-op for the current registry** — only `tappy.hub.security` declares one (`audit.log.read`), and every actor who can reach its modules already satisfies it. It is enforcement of a field that was previously decoration, not a behaviour change |
| §7 module configuration + §11 `BACKOFFICE_ENABLED` REFACTOR | ✅ manifest-declared config and security keys; the flag now resolves through the provider, which had **zero** production consumers before |
| **First real provides/requires** | ✅ `dashboard.home` requires `audit.read` from `security.audit`, and `/admin` resolves it through the kernel — disabling the Audit module closes Home's audit panel. Capability resolution had never been exercised by a shipped module |

**Still blocked — not deferred by choice:**

| Item | Blocker |
|---|---|
| **Capability gate activation** (`CAPABILITY_GATE_ENABLED`) | 🛑 **No contract defines an actor↔capability binding.** §4 defines capabilities as *module*-provided with *module* consumers; the PDP gate tests `actor.capabilities`. Nothing authoritative says how an actor acquires one. Enabling the gate today denies all 18 capability-declaring permissions to every non-Owner. Needs an Owner decision, not an implementation |
| **Runtime (DB/API) configuration tier** | 🛑 Requires the `platform_settings` table of [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §4.1, which has no migration. That is a production mutation and was not authorised in this phase. `deferredRuntimeSource()` continues to return `undefined` rather than fabricate a value |

**Verification:** 8/8 mutations killed against the security guards — including one that survived first and exposed a rollback path no test held open.

### Phase 6 — legacy retirement (2026-08-19): **PARTIAL**

**Removed: `src/lib/admin.ts`** — the pre-RBAC `ADMIN_IDS` / `isAdmin()` gate. [`00_LEGACY_AUDIT.md`](00_LEGACY_AUDIT.md) states why it mattered: *"a second authorization source is a privilege-escalation surface by definition."*

Removal condition proven, not assumed. Two sources state it, and both are met:

| Source | Condition | Evidence |
|---|---|---|
| [`00_LEGACY_AUDIT.md`](00_LEGACY_AUDIT.md) | *"Must grep and confirm zero live references before deleting"* | 0 importers, 0 call sites of `isAdmin()`, across `src/`, `scripts/`, `supabase/`, tests and config |
| `docs/backoffice/23_Implementation_Roadmap.md:382` | *"safe after Phase 0 is deployed, admins are seeded, and **no code path references `isAdmin()`**"* | same |

Guards were added so the surface stays closed rather than merely being closed today, and they are mutation-tested: **6/6 killed**, covering re-creating the module, re-importing it, turning the notification list back into a gate, dropping the anonymous-reporter `401`, narrowing reporting to permission holders, and routing the id list somewhere other than the notifier. One mutation survived first — a loose regex still matched an id list exfiltrated to an external host on its way to the notifier — and the guard was tightened.

**Corrected: the contract's stated migration does not fit the code.** [`FOUNDATION_01_CONTRACTS.md`](FOUNDATION_01_CONTRACTS.md) §11 gives the removal as *"REMOVE (after 1 caller migrates) — migrate `music/tracks/[id]/report` to `requirePermission`"*. MEASURED: that route never imported `src/lib/admin.ts` (it inlines the env parse), and its `ADMIN_IDS` read is a **notification recipient list**, not an authorization check — authorization there is `getRequestUser` + `401`, and reporting is deliberately open to any signed-in user under a 24–48 h takedown SLA. Applying `requirePermission` literally would make copyright reporting admin-only, which secures nothing and breaks the channel. The §11 row is **not edited** — it is a decision record — and the discrepancy is recorded here instead.

**Still open — `ADMIN_IDS` is not retired as an environment concept.** `src/app/api/music/tracks/[id]/report/route.ts` still reads `process.env.ADMIN_IDS` to choose who is notified. Replacing it with an RBAC-derived recipient set needs a policy no authoritative source states — *which role receives copyright reports?* — so it is **F: OWNER DECISION REQUIRED**, not implemented on a guess.

**Also closed by Phase 4:** the §11 row `BACKOFFICE_ENABLED` = *REFACTOR → Config Provider flag* — done, see above.
### Phase 5 — Event Bus / Outbox (2026-08-19): **BLOCKED, mechanism verified**

No code was written. That is the finding, not an omission.

**The mechanism is complete and now proven twice.** [`c8_event_outbox.test.ts`](../../supabase/tests/c8_event_outbox.test.ts) — **39/39 against a real PostgreSQL 17**. And re-verified read-only on production *after* ADR-017 landed, because ADR-017 changed `service_role` privileges and the P4 guarantee is expressed as a grant:

| Checked | Result |
|---|---|
| `fn_outbox_publish` EXECUTE | **false for `anon`, `authenticated` AND `service_role`** — P4 intact; unreachable from the app tier, exactly as §5 requires |
| `fn_outbox_claim` / `fn_outbox_settle` EXECUTE | `service_role` only |
| `event_outbox` table grants | `service_role SELECT` only |
| `UNIQUE (event_id, consumer_id)` | present |
| Rows | 0 total, 0 pending, 0 dead — consistent with zero producers |

**Why no first event flow was built.** The blocker is structural, and three independent sources agree:

1. **C8 §10 puts it out of scope** — *"No producers · no consumers · … no migration of existing business mutations to create a demo event."*
2. **§5 makes a producer a database object, not application code.** `fn_outbox_publish` has EXECUTE revoked from every PostgREST role, so the only possible caller is another `SECURITY DEFINER` function. A first producer therefore means modifying an existing security-critical RPC — `fn_grant_admin_role` is the only realistic candidate, and it is the constitutional G1 fix.
3. **There is no consumer to deliver to.** Zero manifests declare `events.consumes`, and §8 is arithmetic: *"0 consumers ⇒ 0 outbox rows."*

Together those mean a first producer would **re-issue the function that closes G1 in order to insert zero rows**. That is real risk for no delivered behaviour.

**The actual dependency.** [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §7 names the first producer and consumers itself: Commerce.Orders publishes `commerce.order.refunded`, Analytics and Marketing consume it. Under [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md) all three are **not started**. Event wiring depends on the business modules, not the reverse — so this work belongs after the Hubs exist, not before them.

Nothing was declared to paper over it: no manifest was given an `events` block it cannot honour, and no handler was registered in the empty `ConsumerDispatch`. The forcing function in [`outbox.test.ts:181`](../../src/lib/controller/__tests__/outbox.test.ts) still pins the zero-consumer state, so the suite fails the day a real consumer is declared without a handler.

### Phase 7 — V2 Shell (2026-08-19): **IN PROGRESS**

First item only. The shell now renders **hubs**, not a flat list.

Five hubs have been registered and governing modules since FOUNDATION-03, and the Navigation Provider has always returned `NavGroup[]` carrying each hub's label and order — [`AdminShell.tsx`](../../src/components/admin/layout/AdminShell.tsx) discarded it with `flatMap`. So the Hub layer existed in the registry and was **invisible in the product**, which is what [`FOUNDATION_01_CONTRACTS.md`](FOUNDATION_01_CONTRACTS.md) §2 (*a Hub "owns a permission scope + nav group"*) and §13 (*"Controller shell → **Hub shell** → module surface"*) require it not to be.

This is not a redesign and claims no approval it does not have: it renders data the frozen contract already mandates the provider produce. The one visible consequence is stated plainly — **the sidebar now carries a heading per hub**.

A latent defect surfaced and was fixed with it: every hub declared a `navigationGroup` i18n key (`admin.nav.group.*`) and **not one of them had a translation**, in either locale. Harmless only because the groups were being thrown away. §8 requires *"no raw strings"*, so all five now exist in `vi` and `en`, and a test asserts the two differ rather than one being a copy of the other.

**Mutation: 6/6 killed** — re-flattening, an empty hub rendering a bare heading, reversed hub order, a raw key shown instead of translated text, every hub rendering every module, and a nav-group key losing its Vietnamese translation.

The authorization boundary is untouched: `AdminShell` is presentational, and the PDP + hub `permissionScope` filter runs server-side in `deriveNavigation` (mutation-tested in Phase 4).

**Blocked, and not attempted:** command palette (⌘K), context bar, alert well, the six layout presets, density comfortable/compact, and the Denial-UX 403 page. Each is named only by `01_CONTROLLER_V2_ARCHITECTURE.md` §8 and each is a **new UI surface**, while §13 holds the UI boundary **OWNER-APPROVAL-PENDING** and every `docs/backoffice/**` UI spec is **DRAFT — Awaiting Owner Approval** (verified in `17_UI_UX_Standards.md`). Density additionally needs a preference store, which depends on B2.

### Architecture Guard — Controller V2 rules (2026-08-19)

[`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §1 lists five *"Hard rules **enforced by the Architecture Guard**"* and names the mechanism outright — *"enforced in CI by extending `scripts/architecture/check.mjs`"*. The guard shipped **8 rules, all of them for the AI provider layer and none for Controller V2**, so those five held by convention only.

Two of the five are enforceable against the code as it exists today, and are now enforced:

| §1 rule | Enforced as | Why it matters |
|---|---|---|
| 4 — *"No consumer-app import inside the Controller"* | `no-consumer-app-import-in-controller` | This is the property that keeps extracting the Controller to its own deployment *"a build-config change, not a rewrite"* — and that extraction is **still an open Owner decision** ([`00_LEGACY_AUDIT.md`](00_LEGACY_AUDIT.md) §5.3). An unenforced invariant protecting an open decision is the kind that rots |
| 5 — *"No permission string literal outside a manifest"* | `no-permission-string-literal` | *"a permission that is not declared in a manifest does not compile"* |

**The guard found a real violation on its first run**, not a fixture: [`src/lib/controller/org/departments.ts`](../../src/lib/controller/org/departments.ts) declared `permissions: ['commerce.deals.read']` as a raw literal. Fixed to `PERMISSIONS.COMMERCE_DEALS_READ`. Guard now reports **10/10**.

The other three §1 rules (module→module imports, module→connector imports, module-owned repositories) describe `src/controller/modules/` and `src/controller/connectors/`, **directories that do not exist**. They are deliberately NOT written against a shape the repository has not adopted.

The rule engine gained exactly two fields: `scope` (a rule that applies only *within* prefixes — `allow` cannot express a boundary rule) and `exemptTests`. **Mutation: 6/6 killed**, including dropping the scope filter, widening the allowlist to the whole `supabase/` directory, removing the test exemption, and matching the permission *id shape* instead of the *argument position* — the last one matters because `'admin.nav.dashboard'` is shaped exactly like a permission id, so a shape-matching rule would condemn every nav label and then be loosened until it caught nothing.

### Owner Decisions, 2026-08-19 (second set) — locked

| ID | Decision | Effect |
|---|---|---|
| **B5** | ✅ **YES** — FOUNDATION-01 §13 approved as the implementation boundary; [`17_UI_UX_Standards.md`](../backoffice/17_UI_UX_Standards.md) promoted from DRAFT to implementation authority, **without widening the design** | Unlocks the six remaining Phase 7 surfaces |
| **B15** | ✅ **YES — keep the shipped C3/C4 model.** `01_ARCH` §6.3 (*"roles are data in `role_definitions`"*) is **SUPERSEDED** by the accepted C3/C4 registry-in-code implementation | `role_definitions`, `permission_grants`, runtime role-as-data are **not** V2 blockers. **B13 drops out of scope; B12 (`DROP admin_permissions`) is no longer required to satisfy §6.3.** No migrations |
| **B14** | ✅ **YES in principle** — module data ownership (`manifest.data.tables`, §2.1/§4.2) stays an architectural rule | **Contract first**: name the conflict with C6 §1, decide whether an ADR is needed, write the smallest clarification. **No DB change until the contract is resolved**, and existing modules do **not** thereby acquire tables |
| **B6** | ✅ **YES** — Module 17 Settings goes to an existing business Hub, **not** a sixth invented "Configuration" hub | Re-read [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md) first; change only if the evidence supports it |
| **B8** | ✅ **YES in principle** — an Owner break-glass recovery procedure will exist (R6) | **Design first**: threat model, recovery authority, DB + env authority, audit, failure modes, rollback → then ADR. No production mutation without separate authorization |
| **B7** | ⏸️ **KEEP CURRENT DEPLOYMENT** — no split now | Guard rules §1.1–1.3 stay unwritten **on purpose**; they may be added only when the surfaces they guard exist |
| B1 · B2 · B3 | ⏸️ **DEFER** | No invented actor↔capability mapping · no `platform_settings` migration · no demo Event Bus producer |
| **B4** | ⛔ **CLOSED AS NON-BLOCKING** | `ADMIN_IDS` is notification-recipient configuration, not authorization. RBAC is **not** to be forced into that route merely to delete an env var |
| B9 · B10 · B11 | ⏸️ **DEFER** | C7 was accepted without them, and C7 deferred B11 deliberately (*"no consumer for it yet"*) |

### AUDIT-1 — the audit-coverage gap `01_ARCH` §3.3 names by path (2026-08-19)

§3.3 records it in the architecture itself: *"`src/app/api/admin/deals/upload/route.ts` is authorized and rate-limited but writes **no audit row**."* MEASURED at the time of the fix: every other admin mutation route wrote 2–3 rows; this one wrote **zero**, while minting a signed client-direct write into object storage — an authorization the trail had no record of granting.

Closed by calling the same `writeAuditLog` with the same field shape as `deals/route.ts`. **No audit infrastructure was redesigned.** Two distinct mutations get two distinct actions — `deals.media_upload_authorized` and `deals.media_upload_completed` — because authorising an upload and completing one are different grants. Only a **granted** one is recorded: a refused request authorized nothing, and PDP denials are already audited upstream by `requirePermission`.

**Mutation: 7/7 killed**, including collapsing the two actions into one, dropping the object key so the row cannot say *what* was authorised, dropping the `is_platform_owner` marker, and auditing failed attempts.

A sweep of all 8 admin mutation routes confirms this was **the only gap**: `org/memberships` writes no row directly but audits through `membershipService`, which is the canonical writer.

### B5 · Denial UX — **COMPLETE, production-verified** (2026-08-19)

The first of six Owner-approved Phase 7 surfaces. Merge `15ad02f`, [PR #101](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/101). No migration, no env, no IAM/GCS.

**What it closes.** Four structurally different refusals all landed on `/reviews` or `/admin` with no signal — Owner Gate failure, non-corporate identity, corporate identity with no role, and a PDP denial. Each one had a precise reason in hand and discarded it, which is why *a production incident and a correctly-working permission check were indistinguishable from outside*. `01_ARCH` §8: *"A 403 explains which permission is missing and who can grant it. A dead end is a support ticket."*

**Scope completed:** a pure decision module ([`denial.ts`](../../src/lib/admin/denial.ts)) that decides **wording, never access**; `/access-denied`, deliberately outside `/admin` because every `/admin` page carries its own guard; and a permission denial that names the permission and lists the roles holding it, resolved from the registry.

**What is deliberately not disclosed.** `ENV_SET_BUT_NO_OWNER` / `ENV_MISMATCH` and the six corporate sub-reasons describe the deployment's configuration, not the visitor, so they collapse into `controller_unavailable` and `not_corporate`. The query string is user-controlled, so both fields are validated against closed sets: an unknown reason falls back to the generic message, and an unknown permission id is **dropped rather than echoed**.

**Production evidence** (merge `15ad02f` live):

| Check | Result |
|---|---|
| `?reason=<script>alert(1)</script>` | **0** injected `<script>` tags. The string appears only inside Next's own RSC `urlParts` payload — URL-encoded and JSON-escaped framework serialization of the request URL, not page output |
| `?permission=made.up.pwn` | dropped — **0** occurrences of the roles block |
| `?reason=missing_permission&permission=security.roles.read` | names *"View admin role assignments"* and `super_admin` |
| `?reason=junk` | falls back — renders *"Trang này không mở cho bạn"* |
| `?reason=controller_unavailable` | **0** matches for `ENV_MISMATCH`, `ENV_SET_BUT_NO_OWNER`, `service_role`, `supabase` |
| Controller link | present for `missing_permission`, **absent** for `not_corporate` |
| HTTP | 200 on every reason; no 500 |

**VI/EN evidence.** Production server-renders **Vietnamese** (`Cần danh tính nội bộ TappyAI`, `Trang này không mở cho bạn`); the test suite renders **English**. Both maps are asserted to contain every key **and to differ**, so a key copied from English cannot pass as translated.

**Security regression evidence.** Mutation **11/11 killed**. Two survived the first run and both were real gaps: admitting a non-corporate identity as a principal broke **no test at all** — the FOUNDATION-10C boundary had none — and forcing the Controller link on for every reason broke nothing either. Tests were added for both. Four existing assertions were retargeted, none weakened: each keeps its original force (denied, never into `/admin`).

⚠️ **Verification limitation, stated rather than papered over.** The authenticated denial paths — non-corporate signed-in user, corporate user with no role, and a real PDP denial — were **not** exercised against production, because that needs sessions this session does not hold. No account was impersonated or substituted. Those paths are covered by unit + mutation evidence only.

**Remaining B5 surfaces, approved and NOT started:** Command Palette (⌘K) · Context Bar · Alert Well · Layout Presets · Density (also needs B2). **Phase 7 is not complete.**

### B5 · Alert Well — **COMPLETE** (2026-08-19)

Second of six approved Phase 7 surfaces. Merge `f7329ce`, [PR #103](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/103). No migration, no env, no IAM/GCS.

`01_ARCH` §8 defines it in five words — *"what needs attention now"*. The Home already carried the slot: `AttentionPanel` rendered a `NotConnected` placeholder labelled `admin.home.nc.alerts`, because until Phase 4 there was nothing real to put in it.

**No second monitoring system.** No table, no event stream, no polling. Every alert is a kernel fact derived at render:

| Kind | Severity | Source fact |
|---|---|---|
| `module_unavailable` | **ERROR** | `runIsolated` marked it broken after it threw |
| `capability_unresolved` | **WARNING** | a declared capability dependency cannot bind (the Phase 4 rule) |
| `module_disabled` | **INFO** | an operator switched it off — painting a deliberate decision red is how operators learn to ignore red |

One alert per module, most severe. Ordering is severity then module id; **the view does not re-sort**, so the server's rule stays the only one.

**Why `core.ts` changed.** `isModuleAccessible` was readiness **and** permission. Gating alerts on readiness would hide exactly the alerts this exists to raise — a broken module is never `ready` by definition. It is now composed from `isReady` + the new `isModulePermitted`, so behaviour is unchanged and the halves cannot drift. Alerts use the permission half: same hub scope, same module visibility, **nothing newly authorized**, and a null actor gets nothing.

**Deliberately absent:** the failure message from `runIsolated`. It is already audited, and a driver error can quote a connection string.

**Tests:** 17 derivation + 20 surface. **Mutation 13/13 killed** — including hiding a real failure, fabricating one, reversing severity, bypassing the permission filter, dropping hub scope, admitting a null actor, leaking the dependency object, erasing the empty state, colour-only severity, and losing the Vietnamese string.

**Production:** merge live at `f7329ce`; `/admin`, `/reviews`, `/access-denied` all 200, no 500.

⚠️ **Verification limitation, stated rather than papered over.** The Alert Well renders **inside `/admin`**, which requires an authenticated `@tappyai.com` session this session does not hold. Its rendered output was **not** observed in production. No account was impersonated or substituted. Rendering is covered by unit + mutation evidence only.

**Remaining B5 surfaces, approved and NOT started:** Context Bar · Command Palette (⌘K) · Layout Presets · Density (also needs B2). **Phase 7 is not complete.**

### B5 · Context Bar — **COMPLETE (partial by contract)** (2026-08-19)

Third of six approved Phase 7 surfaces. Merge `da98c6f`, [PR #105](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/105). No migration, no env, no IAM/GCS, no preference store.

`01_ARCH` §8 names it **"env · date range · locale"**; UI standards §2 gives the requirement — *"Context is always visible … always in view"*. **Two of the three shipped. The third is an open contract gap, not an omission.**

**Shipped:** `env` is now in view on **every** Controller page — MEASURED before, it appeared only on the Home (`CommandHeader`), so on `/admin/rbac` or `/admin/audit` an operator could not tell production from preview. `locale` **moved** into the bar rather than being copied, because two controls for one setting can disagree. `controllerEnv()` is now the single `VERCEL_ENV` mapping; anything unrecognised is `local`, since an environment the deployment cannot name is not production.

**Mutation 12/12 killed**, including *reporting preview as production* and *defaulting an unknown environment to production* — the two ways this surface could actively mislead rather than merely fail.

**Production:** live at `da98c6f`; `/admin`, `/reviews`, `/access-denied`, `/api/version` all 200, no 500.

⚠️ **Verification limitation.** The bar renders **inside `/admin`**, which needs an authenticated `@tappyai.com` session this session does not hold. **Production render not visually verified; unit/mutation evidence only.** No account was impersonated or substituted.

#### 🔴 OPEN CONTRACT GAP — date range (needs an Owner decision)

| Defined | Source |
|---|---|
| 8 presets, default **"Last 30 days"** | `17_UI_UX_Standards` §5.4 |
| Reporting timezone `Asia/Ho_Chi_Minh` | ADR-008, owner-approved |
| `from`/`to` at the data layer | the analytics API already accepts them — **and no UI passes them** |

| **Undefined anywhere** |
|---|
| **What the range filters** — audit log? Home signals? the Alert Well? |
| What it means on a page with no time series (RBAC, Settings, Deals) |
| Whether the selection persists |

§5.4 also calls it *"Global … top toolbar"* while the layout sketch places it beside `[Page Title]` — **two different components**.

It was therefore **not built**: a control that looks like a filter and filters nothing is worse than an absent one, because it makes an operator believe they scoped a view they did not. A test asserts **no preset string renders**, so adding one later fails until this gap is closed deliberately.

**Remaining B5 surfaces, approved and NOT started:** Command Palette (⌘K) · Layout Presets · Density (also needs B2). **Phase 7 is not complete.**

### B5 · Command Palette — **COMPLETE (navigate only, by contract)** (2026-08-19)

Fourth of six approved Phase 7 surfaces. Merge `8fe1d43`, [PR #107](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/107). No migration, no env, no IAM/GCS, **no new dependency** — built on the existing Dialog primitive.

`01_ARCH` §8 names three capabilities — *"⌘K Command Palette — navigate · act · search"*. The entire authoritative corpus for this surface is **four statements**, and only one specifies behaviour:

> §8 Navigation: *"Derived from the Module Registry, filtered by the actor's permissions. **You never see a door you cannot open.**"*

| Capability | Status |
|---|---|
| **NAVIGATE** | ✅ **DEFINED** — implemented from `NavGroup[]`, already PDP- and hub-scope-filtered |
| **ACT** | 🔴 **UNDEFINED** — no source names a command, its permission, its confirmation, its audit, or whether it mutates. The only prose, *"every action reachable in two keystrokes"*, is an aspiration, not a command list |
| **SEARCH** | 🔴 **UNDEFINED** — no source names a searchable entity, field, ranking, scope, limit or permission rule |

**Neither gap was filled by guessing**, and **two tests guard that**: one fails if a mutating command appears, another if a query matching a user, deal or audit row returns anything.

**Security boundary:** `Registry → Navigation Provider → PDP → hub permissionScope → NavGroup[] → Palette`. The palette re-derives nothing; filtering is a subset operation, so **no query can surface a command the server did not authorize** — exercised by typing `rbac` at a palette never given that module. The filter matches the **translated label and hub name only**, never the route or module id: matching those would let an operator find a screen by typing a path they were never shown.

`Ctrl+K` is accepted alongside `⌘K` because there is no ⌘ key on Windows or Linux, where the named shortcut would be unreachable. Entries are real links (Tab-reachable, §8), plus a visible trigger.

**Mutation 13/13 killed**, including *growing an ACT command* and *matching the route*.

**The Architecture Guard from PR #99 caught this work**: the module's test imported `@/lib/i18n/admin` from inside `src/lib/controller/`, a §1.4 violation. The rule is right — a kernel test that cannot compile without the consumer app is a kernel that cannot be extracted — so the test now uses a stub resolver.

**Production:** live at `8fe1d43`; `/api/version`, `/admin`, `/reviews`, `/access-denied` all 200, no 500.

⚠️ **production render not visually verified; unit/mutation/CI evidence only.** The palette is inside `/admin`, which needs an authenticated `@tappyai.com` session this session does not hold. No account was impersonated or substituted.

#### 🔴 OPEN CONTRACT GAPS — `act` and `search` (need Owner decisions)

Alongside the **date range** gap recorded above, §8's Command Palette leaves two more. Each needs the same shape of answer before it can be built: *what exactly, with what permission, with what confirmation, and audited how?*

**Remaining B5 surfaces, approved and NOT started:** Layout Presets · Density (also needs B2). **Phase 7 is not complete.**

### B5 · Layout Presets — **BLOCKED, not started** (2026-08-19)

Fifth of six approved Phase 7 surfaces. **No code was written**, and that is the finding.

**The entire contract is one sentence and a six-line diagram block** in [`01_CONTROLLER_V2_ARCHITECTURE.md`](01_CONTROLLER_V2_ARCHITECTURE.md) §8: *"RULE 10: layout follows the business question"*, plus six preset names each with a target and a question. Nothing else exists anywhere.

#### Dependency audit — five of six presets target things that do not exist

| Preset | Target | Target exists? | Data exists? | Contract sufficient? | Implementable? |
|---|---|---|---|---|---|
| KPI-First | Founder Hub | ❌ `tappy.hub.founder` is **not registered** — the taxonomy schedules a rename from `tappy.hub.dashboard` that has not happened | ❌ `ControllerHome` shows registry counts, not KPIs; `daily_snapshots` has no migration | ❌ | ❌ |
| Overview → Detail | Analytics | ✅ hub + 3 modules + 3 routes | ⚠️ partial | ❌ | ❌ |
| Sidebar-Filter Grid | Users, Orders | ❌ `tappy.hub.user` not registered; Orders not started | ❌ | ❌ | ❌ |
| Storytelling Scroll | Investor Report | ❌ module 06 not started | ❌ | ❌ | ❌ |
| Two-Column Work Surface | Moderation, Support | ❌ not started | ❌ | ❌ | ❌ |
| Monitoring Wall | Operations | ❌ `tappy.hub.operations` not registered | ❌ | ❌ | ❌ |

**Only Analytics has a real target** — and even there the contract supplies a name and a business question, nothing structural.

#### A standalone preset engine is NOT contractually supported either

The only structural statement is the diagram edge `Sh --> Lay --> DS`, which is a layering claim, not an engine specification. Undefined: what a preset **is** (slots? regions? a grid?), how one is **selected** (by hub, by page, or by user), the default, override rules, persistence, breakpoints and responsive behaviour, whether presets are fixed or configurable, and how they interact with Density.

A registry mapping six names to six targets would be a data structure nothing consumes — an architectural shell whose only purpose is to claim the preset is done. It was not built.

#### A provenance gap in the one sentence that states the principle

`01_ARCH` §8 cites *"RULE 8: a premium operating system, not ERP. RULE 10: layout follows the business question. RULE 9: Tappy appears naturally."* MEASURED: [`docs/backoffice/00_Constitution.md`](../backoffice/00_Constitution.md) defines **Rule 8 as "AI Assists, Humans Decide", Rule 9 as "Privacy by Default", and Rule 10 as "Immutable Audit Log"** — none of which match. The rule set `01_ARCH` cites exists **nowhere in the repository**; only line 530 and two audit documents quoting it back.

So the single authority for "layout follows the business question" is an uncited rule.

#### 🔴 OWNER DECISIONS REQUIRED

1. **Sequencing** — do Layout Presets follow Phase 8/9/10 (which create Founder, User, Operations and the Investor module), or does an earlier subset apply to Analytics alone?
2. **Preset semantics** — what a preset *is* structurally, how it is selected, its default, and whether it is fixed or configurable.
3. **RULE 8/9/10 provenance** — where the cited rule set lives, or whether `01_ARCH` §8 should be corrected.

**Natural sequencing, for the record:** five of six presets describe layouts for Hubs that Phase 8–10 create. Building the layouts before the rooms is the inversion the Event Bus audit already found in Phase 5.

**Remaining B5 surface:** Density (needs B2). **Phase 7 is not complete, and cannot be until these decisions land.**

### Phase 8 — Business Hubs (2026-08-19): **STARTED, first unit only**

#### Infrastructure vs business modules — they are not the same thing

The **Hub framework is COMPLETE** and is not rebuilt: registry, manifest association, lifecycle, `permissionScope`, navigation, dependency resolution, failure isolation, audit sink, i18n. What is missing is **business modules inside the hubs** — 17 of the 20 mapped in [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md) are not started.

#### Unit shipped: the Founder Hub's architected id

Merge `baf3420`, [PR #110](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/110). `tappy.hub.dashboard` → **`tappy.hub.founder`**, per taxonomy §3 under Decision G.

**The §3 caution was half wrong, and it was measured before acting rather than assumed.** §3 called the rename *"a migration with a real cutover"* because a hub id lives in a manifest **and** in the audit trail. On production, read-only:

| Checked | Result |
|---|---|
| `audit_log` rows `action LIKE 'controller.%'` | **0** |
| `audit_log` rows `target_id LIKE 'tappy.hub%'` | **0** |
| `module_registry` · `platform_settings` | **do not exist** |

Every `buildAdminController()` call site uses the default **NOOP audit sink**, so `controller.hub.registered` has never been written. The manifest half is real but code-only, in one non-test file. **No data migration.**

**The module id did NOT change.** `01_ARCH` §2.1 makes it *"globally unique, immutable"*, and the taxonomy authorized renaming the hub alone — so `tappy.hub.dashboard.home` keeps its id inside `tappy.hub.founder`. A test pins that, so it cannot be "tidied" later without authority.

**This completes nothing.** Business Analytics and the Investor Dashboard do not exist; `daily_snapshots` has no migration. It corrects an identity. No module invented, no route added, no KPI faked.

**14 new tests**; four existing updated to the new identity, none weakened. **Production:** live at `baf3420`, all routes 200, no 500. ⚠️ *production render not visually verified; unit/CI evidence only* — no Owner session, and no account substituted.

#### Data sources that DO exist, measured (for the modules still to come)

`auth_daily_rollup` · `activation_daily_rollup` · `user_acquisition` · `user_events` · `system_health_log` · `music_track_reports`. **Absent:** `daily_snapshots`, `module_registry`, `platform_settings`, `role_definitions`, `permission_grants`.

#### 🔴 Owner decisions before the next Phase 8 unit

1. **Which business module is next, and against which spec?** Every remaining module needs new permissions, an API route, a page and a service. `docs/backoffice` has approved specs for several (bo-10 User Management, bo-11 Moderation, bo-14 System Monitoring), but none has been authorised as the next build.
2. **`tappy.hub.configuration`** stays on HOLD pending the Module 17 Settings decision (taxonomy §2).
3. **Module-id convention after a hub rename** — is the `tappy.hub.dashboard.home` mismatch accepted permanently, or does a future ADR permit module-id migration?

**Phase 8 is NOT complete.** One identity corrected; no business module built.

### Phase 8 — 20-module authority audit (2026-08-19): **NO AUTHORIZED IMPLEMENTATION UNIT**

Read-only. **No code, no RED tests, no placeholder module.** Three corrections to earlier entries in this document come first, because each changes what happens next.

#### Correction 1 — every business-module specification is DRAFT

[`docs/backoffice/README.md`](../backoffice/README.md) line 109 claims *"All documents (00–35) — Architecture v1.1 — ✅ APPROVED"*. MEASURED against the files themselves: **29 of 36 self-declare `Status: DRAFT — Awaiting Owner Approval`**, and that set includes **every module specification (01–30)**.

Only six declare approval: `00_Constitution`, `31_Feature_Flags`, `32_Experimentation`, `33_Privacy`, `34_Data_Retention`, `35_Business_KPI_Dictionary`. **None of them is a module spec.**

The per-document header is the operative status, and the B5 precedent proves it: the Owner had to **explicitly promote** `17_UI_UX_Standards.md` out of DRAFT for the Phase 7 surfaces — an act that would have been unnecessary if the README's blanket claim governed. That promotion was **per document**. `17_UI_UX_Standards.md` still reads `DRAFT` in its own header today; the promotion lives in the decision record, not the file.

**Owner Decision G settled containment — which hub owns which module — and that stands. It did not promote any module spec to implementation authority.**

#### Correction 2 — the mapping is 18/20, not 17/20

Counted directly from [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md) §1: modules **01–16, 18, 19** are placed = **18**. The two of the twenty left ambiguous are **17 Settings** and **20 Shared Services**. The third row in §2 — Feature Flags / Experimentation — is **not among the twenty numbered modules**, as §2 says itself. Earlier entries in this document said "17/20 placed, 3 ambiguous"; that counted a non-module as a module.

#### Correction 3 — document numbers are not module numbers

`docs/backoffice/14_CRM.md` is **document** 14; **Module** 14 is System Monitoring. An earlier entry proposed *"bo-14 System Monitoring"* as a build candidate on the strength of a dedicated spec. There is no such document: **Module 14 has only a 30-line section** inside DRAFT `03_Module_Architecture.md`.

Modules with a dedicated document: 01 (bo-26), 06 (bo-15), 07 + 19 (bo-08), 08 (bo-10), 09 (bo-11), 10 (bo-09), 11 (bo-14), 12 (bo-13) ✅ shipped, 13 (bo-12) ✅ shipped, 16 (bo-16), 02/04 (bo-06). **Modules 03, 05, 14, 15, 17, 18, 20 have a section only** — 15 to 37 lines each.

#### Verdict

**PHASE 8 HAS NO AUTHORIZED IMPLEMENTATION UNIT.** Building any of the 17 remaining modules would mean treating a DRAFT as a frozen contract. Data existing is not authority: `system_health_log`, `user_events` and `user_acquisition` are real, and none of them authorises a module.

#### 🔴 Owner decisions that would unlock Phase 8

1. **Promote one module specification out of DRAFT**, the same way `17_UI_UX_Standards.md` was promoted — naming the document, and naming what it authorises (product behaviour, API, data model, permissions, acceptance criteria).
2. **Reconcile the README's blanket approval with the 29 DRAFT headers** — one of the two is wrong, and today the frozen doc set contradicts itself.
3. **Module 17 Settings** hub placement, still open, still blocking `tappy.hub.configuration`.

**Phase 8 remains STARTED, NOT COMPLETE** — one hub identity corrected, zero business modules built.

### Phase 8 — document authority RESOLVED, and a correction to the entry above (2026-08-19)

Read-only. **No business-module code was written. No module spec was promoted or edited.**

#### ⚠️ Correction 1 of the previous entry was WRONG

That entry concluded *"every business-module specification is DRAFT, therefore no authority exists"*. **A precedence rule does exist, it was found in the Constitution, and it says the opposite.**

[`00_Constitution.md`](../backoffice/00_Constitution.md) — itself `✅ APPROVED — Architecture v1.1` — binds approval at the **architecture-set version**, not per file:

| Clause | Text |
|---|---|
| **§8.1** | the set version is *"the **exact contract** each implementation phase is built against"* |
| **§9.1** | `v1.0` = *"Approved & frozen baseline (ADR-012). **Docs 00–35**"* · `v1.1` = *"✅ **CURRENT — Approved & Frozen**"* |
| **§8.5** | *"No phase may begin against an unversioned or in-flight change — **only against a released, approved version**"* |

**DOCUMENT AUTHORITY RESULT**
- **Authoritative source:** `00_Constitution.md` §8–§9, established by ADR-012 (freeze) and ADR-013 (v1.1).
- **Precedence rule:** set-level version approval, covering docs 00–35.
- **Is the README stale?** **No** — it restates §9.1.
- **Are the individual `DRAFT` headers authoritative?** **No** — they are pre-freeze remnants. Aligning them is **Editorial Errata** under §8.2 (*"Requires ADR? No"*), which must be logged in §9.2 — and is the Owner's to apply, not this workstream's.
- **Evidence that promotion is per-document was misleading:** `17_UI_UX_Standards.md` was promoted by the Owner in answer to the question *this workstream framed*. It still reads `DRAFT` today. That act resolved a blocker as posed; it did not establish that headers govern.

§8.5's gate is therefore **met**: v1.1 is released and approved.

#### Corrections 2 and 3 of the previous entry STAND

18/20 modules placed (not 17/20), and document numbers are not module numbers — Module 14 System Monitoring still has no dedicated document.

#### The real blocker, measured

Specs are substantially richer than "DRAFT" implied: [`12_RBAC.md`](../backoffice/12_RBAC.md) carries a per-role **permission matrix** (User Management 10 rows, Moderation 7, Engagement 4, System Monitoring 1); [`05_API_Architecture.md`](../backoffice/05_API_Architecture.md) defines concrete endpoints; [`04_Database_Architecture.md`](../backoffice/04_Database_Architecture.md) defines the DDL.

What is missing is **the database**. Checked read-only on production:

| Required by | Table / column | Exists |
|---|---|---|
| Module 08 User Management | `user_notes` | ❌ |
| Module 08 | `profiles.status` / `suspended_at` / `banned_at` / `deleted_at` | ❌ — `profiles` has 10 columns, none of them status |
| Module 09 Moderation | `moderation_queue` · `moderation_cases` · `user_warnings` | ❌ |
| Module 10 Engagement | `notification_campaigns` · `in_app_messages` | ❌ |
| Module 14 System Monitoring | `cron_execution_log` | ❌ (`system_health_log` does exist) |

**Every remaining business module requires production schema mutation**, which is gated and unauthorized.

#### 🔴 The minimum Owner decision set

**Phase 8 is unblocked by ONE decision, not by promoting a spec:**

> **Authorize the migration for one named module**, reviewed and applied under the ADR-017 pattern (preflight → explicit authorization → apply frozen migration → verify → rollback window).

Ranked by fewest remaining unknowns:

1. **Module 08 — User Management.** Deepest spec (228 lines), permissions defined (10 matrix rows), 8 endpoints defined, DDL defined. ⚠️ Blast radius is the highest of the three: it adds columns to `profiles`, a **consumer-app table**, and soft-delete touches the known "Delete Account has no backend" gap.
2. **Module 14 — System Monitoring.** Smallest surface, one permission row, and `system_health_log` already exists — but the spec is a 30-line section with no dedicated document, and it needs `cron_execution_log` plus an external Vercel Analytics dependency.
3. **Module 09 Moderation** and **Module 10 Engagement** are **not recommended next**: Moderation overlaps the Content Safety publication-gate workstream, and Engagement depends on the FCM/APNs notification workstream. Both are explicitly out of scope here.

Also still open: **Module 17 Settings** hub placement (no authoritative answer exists in `01_ARCH`, the taxonomy, FOUNDATION-01, Owner Decisions, or the registry — current code places it in `tappy.hub.configuration`, a container the registry invented) and **Module 20 Shared Services**, which `03_Module_Architecture.md` describes as a cross-cutting service layer — kernel/capability territory under `01_ARCH` §5, not a Hub member.

**Phase 8 remains BLOCKED. Owner decision package ready.**

### Phase 8 — the architecture DOES define module ordering (2026-08-19)

Read-only. **No business-module code written. No migration proposed. No ADR created.**

#### ⚠️ My Module 14 recommendation was wrong, twice over

The previous entry ranked **Module 14 System Monitoring** as a candidate because *"smallest surface"* and *"`system_health_log` already exists"*. Both are convenience arguments, and the architecture answers the question directly.

[`docs/backoffice/23_Implementation_Roadmap.md`](../backoffice/23_Implementation_Roadmap.md) §2 defines an explicit dependency graph:

```
Phase 0 Foundation ──► Phase 1 Analytics Core ──┐
        │                                        ├──► Phase 3 Intelligence ──┐
        └───────────► Phase 2 User Mgmt ─────────┘                           ├──► Phase 5 Reporting
                              │                                              │
                              └──────────────► Phase 4 Engagement ───────────┘
```

*"Phases 1 and 2 can run in parallel after Phase 0."*

**Module 14 System Monitoring is in Phase 3** (roadmap lines 232–241, alongside AI Cost Monitoring), gated on Phases 1 **and** 2. It is not an early module. **Phase 2 — User Management & Moderation** is the next phase, and it depends on Phase 0 alone, which is complete.

So the ordering is authoritative, and it is not the one I proposed.

#### Phase 2 is a single phase containing BOTH modules

Its deliverables and **Success Criteria** are enumerated (5 criteria — these are the acceptance criteria the earlier audit reported as missing). Named migrations: `moderation_queue`, `moderation_actions`, `user_notes`, and `is_vip` on `profiles`.

#### Two blocking findings inside Phase 2

**1. bo-23 and bo-10 disagree on the schema.** The roadmap's Phase 2 migration list adds only `is_vip` to `profiles`. [`10_User_Management.md`](../backoffice/10_User_Management.md) §4 requires `profiles.is_suspended`, `profiles.suspended_until` and `profiles.is_banned` — none of which the roadmap lists, and none of which exists (`profiles` has 10 columns, no status field). **Two frozen documents specify different schemas for the same feature.**

**2. Suspension is not an admin-only behaviour.** bo-10 §4 defines it as: the user *"cannot post content, cannot comment, cannot use AI, can browse read-only"*. That is **consumer-app enforcement**. Building only the admin half produces a suspension flag that suspends nothing — a worse outcome than not building it. Ban additionally *"revokes ALL active Supabase sessions"* (C11 exists, so that half is met), and soft-delete anonymises PII in `profiles`, which meets the known *"Delete Account has no backend"* gap and bo-33 Privacy.

Even the **read-only slice** — user list + User 360 — cannot be built cleanly: both the list columns and §3.1 require a *"Status badge (Active / Suspended / Banned)"* that no column can supply.

**Module 09 Moderation** routes `/api/reviews/[id]/report` into `moderation_queue`, overlapping the Content Safety publication-gate workstream, which is out of scope here.

#### Decision: **C — NO AUTHORIZED FIRST MODULE**

Phase 2 is architecturally next and its contract is frozen, but it cannot begin: it requires unauthorized production schema mutation, it crosses into consumer-app behaviour, and its two governing documents disagree on the schema.

Separating the two authorities, as they must be:

| | |
|---|---|
| **CODE authority** | ✅ present — Phase 2's contract is inside approved, frozen v1.1 |
| **DB authority** | ❌ absent — every path needs tables/columns that do not exist |
| **Product-workstream authority** | ❌ absent — suspension requires consumer-app enforcement |

#### 🔴 Owner decisions required, smallest set

1. **Resolve the bo-23 ↔ bo-10 schema disagreement** for account status. A Design Change under Constitution §8.2 → requires an ADR. **Not created here** — creating one is not authorized.
2. **Authorize the Phase 2 migration** under the ADR-017 pattern, once (1) is settled.
3. **Authorize consumer-app enforcement of suspension**, or explicitly scope Phase 2 to admin-side only and accept that suspension does not yet restrict anything.
4. Still open from before: **Module 17 Settings** hub, **Module 20** classification.

**Phase 8 remains BLOCKED. Phase 7 remains PARTIAL.**

### Two observations recorded, not acted on

Found during the ADR-017 preflight and outside its contract. Neither is a defect of the migration, and neither was silently folded into it.

1. **`TRUNCATE` remains granted to `service_role`** on both tables. ADR-017 targets privilege *escalation*; `TRUNCATE` is destruction, and it bypasses RLS. Closing it is a separate decision.
2. **`anon` and `authenticated` hold table-level write grants** on both tables — the Supabase default, where RLS is the actual control. Verified still gated: anonymous reads of `admin_roles` and `platform_owner` return zero rows.

---

## Verification ledger

| Gate | Status | Evidence |
|---|---|---|
| Phase 0 audit | ✅ | [`02_PHASE0_AUDIT.md`](02_PHASE0_AUDIT.md) — 7 sub-audits |
| Security PR (Next.js 14.2.35, CVE-2025-29927) | ✅ | merged as `7fa2c31` |
| Runbook Step 1 — read-only verification | ✅ | exactly 1 active `super_admin` confirmed on production |
| Runbook Step 2 — schema migration | ✅ | 9/9 objects verified via PostgreSQL catalog |
| Runbook Step 3 — Owner bootstrap | ✅ | 1 active owner, UUID matches the sole `super_admin`, idempotency proven on production |
| Merge → production deploy | ✅ | `fb21ebe` reached Ready |
| Public surface regression | ✅ | 8/8 routes → 200 |
| Admin surface regression | ✅ | 6/6 admin APIs → 401 unauthenticated |
| **Boot Assertion** | ✅ | authenticated `GET /api/admin/settings` → **200**, no ownership-assertion failure |
| **Owner Guard resolves `isOwner`** | ✅ | non-mutating probe reached the self-promotion check |
| Self-promotion rule | ✅ | `403 "Self-promotion is not permitted"` on production |
| **G1 end-to-end HTTP** | ⏳ **OPEN** | requires a second authenticated `super_admin` session — [BL-002](BACKLOG.md#bl-002--g1-production-validation) |

---

## Why G1 is open rather than failed

Nothing failed. G1 requires an HTTP request made **as a non-Owner `super_admin`**, and production has exactly one `super_admin` — the Owner. Producing a second one requires signing in as another account, which is a manual step.

The rule G1 tests is already enforced at two layers that *are* verified:

- **Database** — `fn_grant_admin_role` raises `42501` unless the actor is the Platform Owner. This is the authoritative layer; the application check is explicitly documented as defence-in-depth only.
- **Application** — `requireOwner()` is covered by a named regression test (`"a non-Owner super_admin CANNOT grant super_admin"`).

What remains unproven is only the **end-to-end HTTP path** on live production.

---

## Next implementation target

> **Corrected 2026-08-13.** This section said *"**Component 3 — RBAC.** Not started"* while the table above recorded Component 3 as **ACCEPTED · IN PRODUCTION** since 2026-08-07 — the document contradicted itself. The stale line is replaced rather than preserved, because a *forward-looking* instruction that is wrong will be acted on, unlike a dated status snapshot.

**C8 is merged and deployed; its migration is still pending.** C6, C9b and C10 are delivered. Under Owner Decision A (Definition of Done = C1–C11), exactly **two** things stand between the project and COMPLETE:

1. **The C8 migration** — Owner action. Everything else about C8 is done and its SQL is executed against a real PostgreSQL in CI.
2. **The C11 migration** — Owner action, the same shape. C11 is implemented, contracted and tested; `20260814_c11_session_security.sql` opens with a guard that refuses to apply if GoTrue's `auth.sessions` has lost a column C11 reads, so a failed apply is information rather than a mystery.

Both are the same class of remaining work: **code is merged, schema is not**. Neither is a design question.

> ⚠️ **Code ships before the schema.** Merging C8 deploys `/api/cron/outbox-drain` immediately, but `supabase/migrations/20260813_c8_event_outbox.sql` is applied manually by the Owner. Between those two moments the daily 03:00 tick calls an `fn_outbox_claim` that does not exist and returns 500. Nothing is lost — there is no table to lose rows from — but the tick is noise until the migration lands.

C8's design document now exists — [`08_COMPONENT8_EVENT_BUS_CONTRACT.md`](08_COMPONENT8_EVENT_BUS_CONTRACT.md), built on `01_CONTROLLER_V2_ARCHITECTURE.md` §7 which the Owner ratified as binding on 2026-08-13. It ships the **mechanism only**: an outbox table, the `fn_outbox_publish` primitive whose grants close the lost-event window, and a daily drain cron. It creates **no producers and no consumers**, so production carries zero delivery obligations by construction.

C11 still has **no design document**, so its scope remains undetermined and authorizing it is an Owner decision. The old ordering dispute is resolved: `03_PHASE1_FOUNDATION_DESIGN.md` §2 called the build order a chain of *"hard dependencies"* while `02_PHASE0_AUDIT.md` said those items *"can proceed in parallel"*; Owner decision 2026-08-13 settled it in favour of independence, and C9b, C6, C10 and C8 have each been delivered outside the declared chain order.

Deferred within C6, carried as named debt: **rollback**, **health checks**, **migration versioning**, table-collision validation, and route-gating on disable — each undefined in any authoritative source and therefore not invented. See [`06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md`](06_COMPONENT6_PLUGIN_REGISTRY_CONTRACT.md) §1 and §7.

See [`ROADMAP.md`](ROADMAP.md) for the approved Phase 1 component list and [`OWNER_DECISIONS_2026-08-13.md`](OWNER_DECISIONS_2026-08-13.md) for the Definition of Done.
