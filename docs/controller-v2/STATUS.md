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
