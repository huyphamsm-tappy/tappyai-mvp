# Controller V2 — Current Status

> ## 🔒 SINGLE SOURCE OF TRUTH
> **This document is the only authoritative statement of Controller V2 project status.**
> Every other document in `docs/controller-v2/` is either a historical record or a design artefact. Where any of them states a status — `READY`, `NOT READY`, `NOT EXECUTED`, `Draft`, `Awaiting approval` — **this document overrides it**. Historical documents are deliberately not rewritten; they carry a banner pointing here.

**Last updated:** 2026-08-22

> ⚠️ **This header said `2026-08-15` while carrying entries dated 2026-08-19, and it had no entry at all for three merged, production-live commits.** That is exactly the drift the banner above exists to prevent, and it is corrected here rather than filed as a backlog item — the same discipline applied to the 2026-08-07 and 2026-08-13 corrections below.

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
| **Module 08 — User Management** | ✅ **COMPLETE — backend + Controller surface** — schema `b474cff` ([#117](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/117)), consumer enforcement `30e78c1` ([#118](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/118)), Admin Users API `3a825c2` ([#119](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/119)), all live in production. [ADR-022](../architecture/ADR-022-account-status-isolation.md) · [ADR-023](../architecture/ADR-023-module-08-admin-read-surface-roles.md). **Controller surface shipped 2026-08-20:** `tappy.hub.user` registered, manifest `tappy.hub.user.management`, nav entry, `/admin/users` page. **The first business module complete end-to-end in Controller V2.** ~~Still out of scope: auto-unsuspend cron · session revocation on ban · soft delete · notes.~~ **Corrected 2026-08-22:** two of those four shipped and this row went stale behind them — session revocation on ban is `df53496` (Owner Decision A) and notes are `9f5a3d9` (`user_notes`), both recorded below. Still out of scope: **auto-unsuspend cron · soft delete**. Read surface **UAT-verified on production 2026-08-22**. See [Module 08](#phase-8--module-08-controller-surface-complete-2026-08-20) |
| **Owner decision set** | ✅ **CLOSED, 2026-08-22** — [`OWNER_DECISIONS_2026-08-22.md`](OWNER_DECISIONS_2026-08-22.md) answers D1–D7. **No Controller V2 item is waiting on an Owner decision any more.** See [Closure](#2026-08-22--the-owner-decision-set-is-closed-and-what-it-unblocked-shipped) |
| **K-2 — Configuration Provider runtime tier** | ✅ **COMPLETE · IN PRODUCTION.** Code merged `6d9aecc` ([#153](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/153)); **migration `20260822_k2_platform_settings.sql` APPLIED to production 2026-08-22** under its own Owner authorization, via the Management API against the pinned production ref, in one transaction. Verified read-only, **9/9**: five columns and no `updated_at` · `service_role` only · RLS on with **0 policies** · the three-scope CHECK · FK **no-cascade** · empty · index present · **`module_registry` NOT created** (Decision D1a). The loader's exact query went **`PGRST205` → `200 []`**, and anon went **`PGRST205` → `42501`**. See [Closure](#2026-08-22--the-owner-decision-set-is-closed-and-what-it-unblocked-shipped) |
| **Module — Department Memberships** | ✅ **COMPLETE end-to-end** — Owner Decision D6. `tappy.hub.security.membership` + `/admin/org/memberships` + `GET /api/admin/org/memberships`, merge `6d9aecc` ([#153](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/153)). **Production UAT PASS 2026-08-22, EN + VI.** Read-only by decision. `/org/memberships` was the last admin route with no page |
| **Controller V2 overall** | ⏳ **NOT COMPLETE — but every authorized item is now done.** Hub taxonomy fixed by [`12_HUB_TAXONOMY.md`](12_HUB_TAXONOMY.md); the architecture gap is recorded in the Phase 0 reconciliation, 2026-08-19. **After 2026-08-22 nothing is waiting on engineering and nothing is waiting on an Owner decision.** What remains is **one external prerequisite** (BL-002 — a second `super_admin` only the Owner can create), **destructive UAT the Owner has explicitly withheld**, and **work DEFERRED by decision** with a stated end condition. Remaining-work inventory: [Closure](#2026-08-22--the-owner-decision-set-is-closed-and-what-it-unblocked-shipped) supersedes the [Burn-down](#master-completion-burn-down-2026-08-20) |

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

## 2026-08-22 — the Owner decision set is closed, and what it unblocked shipped

`main` = **`6d9aecc`** ([PR #153](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/153)), production **verified serving `6d9aecc` at runtime**: `/api/version` returns the full SHA and the Controller Home prints it on the page, so this is the build described below and not a deployment badge.

Class 1 — work safe to implement without asking — had been empty since `8b9bf3b`. Every remaining item was an Owner decision, an external prerequisite, or an authenticated UAT. [`OWNER_DECISIONS_2026-08-22.md`](OWNER_DECISIONS_2026-08-22.md) closes the first category; this section records what followed.

### 🛑 Two things this document was saying that were no longer true

Both are corrected in place rather than quietly edited away, the same discipline as the 2026-08-07 and 2026-08-13 corrections.

**1. `/org/memberships` was NOT blocked.** This document said it needed *"the F-10 activation gate plus four further Owner decisions — first department, first Head account, membership-authority ratification, activation"*. **MEASURED 2026-08-22: all five were resolved on 2026-08-10.** [`FOUNDATION-10_OWNER_DECISION_PACKAGE.md`](FOUNDATION-10_OWNER_DECISION_PACKAGE.md) records *"✅ DECISION C — RESOLVED: OPTION 1, by the Owner"*, with A, B, D and E executed, committed as `514505a`. Production carries **one active `DEPARTMENT_HEAD` membership** (`ai_data`, created 2026-08-10), read read-only from the live database, and `audit_log` holds the matching `org.membership_assigned` row from that date.

**F-10 had been on for twelve days while this document said it was waiting for permission to start.** That is the failure mode the banner at the top of this file exists to prevent, and it is the second time in three days that a row here outlived the thing it described.

**2. The unregistered `marketing` / `ai` / `operations` hubs were not Owner decisions.** Taxonomy §1 already assigns modules to all three under Decision G, and a hub with no module renders a bare heading — the case the Phase 7 mutation suite kills. They are **derived**: they register when their first module does.

### What shipped

| | |
|---|---|
| **K-2 — Configuration Provider runtime tier** | `platform_settings` migration + rollback + the tier. `configProvider.ts` had said for months that the runtime tier *"returns undefined rather than a fake value so precedence falls through honestly"* because the table did not exist, and the Configuration Provider is **named in Decision F's Definition of Done** — a provider whose highest-precedence tier is a stub is not that provider |
| **Department Memberships** | `tappy.hub.security.membership` + `/admin/org/memberships` + `GET /api/admin/org/memberships`. **The last admin route with no page now has one** |
| **Errata** | `01_ARCH` §8 cited *"RULE 8 / RULE 9 / RULE 10"* for three UI statements; `00_Constitution` defines those numbers as *AI Assists, Humans Decide*, *Privacy by Default* and *Immutable Audit Log*, and the cited set exists **nowhere in the repository**. Renumbered as UI principles of that section, with the erratum recorded in place. `12_HUB_TAXONOMY.md` §2 closed: Module 20 ratified as kernel/capability, Module 17 keeps its placement, `tappy.hub.configuration` **not** retired |

### Production UAT — 2026-08-22, authenticated Owner session on `6d9aecc`

| Check | Result |
|---|---|
| Runtime commit | ✅ `/api/version` → `6d9aecc…`; Controller Home prints `6d9aecc` |
| `/admin/org/memberships`, **EN** | ✅ PASS — nav entry present and it opens; roster renders the real production row (`AI / Data` · `bafa6fc1…` · `Department Head` · `ai_data` · `Active`) |
| `/admin/org/memberships`, **VI** | ✅ PASS — every string translated (`Thành viên phòng ban` · `AI / Dữ liệu` · `Trưởng phòng ban` · `Đang hoạt động`), **0 English leak** |
| Raw i18n keys · `undefined` · `NaN` · console errors | ✅ **0 / 0 / 0 / 0** in both locales, on a fresh load |
| Chrome-Translate contamination | ✅ `<font>` tags **0** — the measurement is of the app, not of a translated DOM |
| Read-only, on the live surface | ✅ the only buttons on the page are the shell's (Quick find, VI, EN, Sign out) |
| API payload, **raw production body** | ✅ `200 {"data":[{userId, departmentId, orgRole, scope, status}]}` — **no email, avatar, name, phone, token or cookie** |
| Audit trail | ✅ `audit_log` holds `org.membership_listed`, `target_type: department_membership`, `metadata: {"returned": 1}` — **a count, never the rows** |
| Regression — M01 · M04 · M08 | ✅ Home renders; **all four M04 tabs render with no error boundary and no `undefined`** (the #151 fix holds on the new build); Users lists 22 rows |
| K-2 against a table that does not exist | ✅ `platform_settings` probes **`PGRST205`**, and `/admin`, `/admin/users`, `/admin/analytics/users`, `/admin/audit`, `/admin/rbac`, `/admin/org/memberships`, `/access-denied`, `/reviews` **all return non-5xx**. The loader runs in the Controller root layout on every request; if it threw, every one of those would be a 500 |

**Not exercised, and why:** assignment, suspension, removal, ban, session revocation, moderation actions and B8 recovery all mutate production or end a real session. Decision D6 keeps the roster read-only precisely because destructive UAT is **not authorized**. No account was created and no row was written to make a screen look populated.

### 🔴 What is left — nothing here is an open engineering question

| Item | Class | What it needs |
|---|---|---|
| ~~**Apply the `platform_settings` migration**~~ | ✅ **DONE 2026-08-22** | Authorized explicitly and applied the same day — see [K-2 applied](#k-2--the-migration-is-applied-2026-08-22) below |
| **BL-002** | **EXTERNAL PREREQUISITE** | A second `super_admin` only the Owner can create. **Not to be simulated** |
| **B8 recovery · M08 ban/suspend · C11 revocation · M09 moderation action** | **OWNER AUTHORIZATION** | Explicitly withheld 2026-08-22 |
| **Layout Presets · date range · Density** | **DEFERRED BY DECISION** (D2, D3) | Scope is now defined, so the deferral has an end condition. Density additionally needs the preference store `platform_settings` provides |
| **Command Palette `act` / `search`** | ✅ **COMPLETE BY DECISION** (D4, D5) | Navigate-only is final for V2. The two tests written when the gap was open are now the executable form of that decision |
| **K-8 `module_registry`** | ✅ **OUT OF SCOPE** (D1a) | Superseded by registry-in-code, applying Decision B15 to an identical shape |
| **Module 20** | ✅ **CLOSED** (D7) | Kernel/capability, not a Hub member, not built |
| **Module 17 · 11 unstarted Phase 8 modules** | **DEFERRED BY DECISION** (D7) | No new business module enters V2 |
| **M09 content-safety writer** | **OUT OF CONTROLLER V2 SCOPE** | Content Safety Gate under ADR-024, which `moderationModule.ts` declares |
| **K-1 · K-3 · K-4 · K-7** | **FUTURE KERNEL** | Unchanged: the architecture they guard does not exist yet |

**Controller V2 is not declared COMPLETE, and the reason is now narrow enough to state in one line.** Under Decision F the measure is the full architecture. **Class 1 (engineering) is empty, class 3 (Owner decision) is empty, and the migration is applied** — so nothing is waiting on this workstream. What remains is **one external prerequisite** (BL-002), **destructive UAT the Owner has withheld**, and **work deferred on the record**. Calling that COMPLETE would mean calling a deferral a delivery.

### K-2 — the migration is applied (2026-08-22)

Authorized explicitly by the Owner for **this migration only**, and applied the same day. Runbook: [`runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md`](runbooks/K2_PLATFORM_SETTINGS_APPLY_PACK.md).

**Channel.** [ADR-014](../architecture/ADR-014-migration-apply-checklist.md) has stated since Phase 0 that *"Owner applies this migration to production. Claude cannot run DDL in this environment"* — no `SUPABASE_ACCESS_TOKEN`, no CLI link, and the service-role key is a PostgREST **data** JWT with no DDL path. That was re-measured and still true, so the work stopped at handover until the Owner minted a Personal Access Token. It then ran through the Supabase **Management API**.

**What the apply script enforced rather than intended.** The token was read from `.env.local` (gitignored) and never printed. The project ref was **hard-pinned** — this account also holds `nhncoqyadofojjrnpiia` (staging), and a ref passed as an argument is a ref that can be passed wrong; the script additionally aborts if the target resolves to staging. The SQL was extracted with `git show origin/main:…` and its **SHA-256 asserted** against the hash recorded at handover, so no working-tree edit could reach production. The exact bytes being sent were re-scanned for `DROP/TRUNCATE/INSERT/UPDATE/DELETE` and for any object other than `public.platform_settings`. Everything ran inside `BEGIN … COMMIT`.

| | |
|---|---|
| Target | `fwznnobrdctuskgrvuik` — *huyphamsm-tappy's Project* · `ap-northeast-2` · **production** |
| SQL | `origin/main` `4fe6fd4`, blob `ec9b97f`, **5605 bytes**, SHA-256 `9c1333ab…8658` |
| Scope of the bytes sent | 5 mutating statements, **all** on `public.platform_settings`; 0 forbidden verbs |
| Pre-state | `platform_settings` **null** · `module_registry` **null** |
| Apply | HTTP 201, `[]` — committed |

**Verification, 9/9 PASS, read-only:** exactly `key · scope · updated_by · value · value_schema` with **no `updated_at`** · `scope` defaults `'global'::text` · grants **`service_role` + table owner `postgres` only**, with `anon`, `authenticated` and `PUBLIC` holding **nothing** · `relrowsecurity = true` with **`policy_count = 0`** · `CHECK (scope = ANY (ARRAY['global','hub','module']))` · `updated_by` FK `confdeltype = 'a'` (no cascade) · **0 rows** · `idx_platform_settings_scope` present · **`module_registry` still absent**, which Decision D1a requires.

**What measurably changed at the app tier**

| Probe | Before | After |
|---|---|---|
| anon `GET /rest/v1/platform_settings` | `PGRST205` (table unknown) | **`42501`** — present, and the anon role holds no privilege on it |
| service_role, the loader's exact query `select=key,value,scope&scope=eq.global` | `PGRST205` → the store threw and the loader swallowed it on every Controller request | **`200 []`** — the store now succeeds |

**Post-apply production UAT on `4fe6fd4`:** all eight Controller paths non-5xx · `/api/version` = `4fe6fd4` and the Controller Home prints `4fe6fd4` · signed in as `founder@tappyai.com` · `/admin/org/memberships` renders the real row in **VI** (`AI / Dữ liệu` · `Trưởng phòng ban` · `Đang hoạt động`) and **EN** (`AI / Data` · `Department Head` · `Active`) · **0 raw i18n keys, 0 `undefined`, 0 console errors, 0 Chrome-Translate `<font>` tags** in both locales.

> ⚠️ **NOT MEASURED, and it is not measurable from outside.** *"A row in `platform_settings` changes a resolved value"* is **not observable on production**, and the reason is structural rather than an omission: the Controller exposes **no configuration-dump endpoint**, and the only key any shipped code consumes through the provider is `BACKOFFICE_ENABLED` — a kill switch. Proving the tier end-to-end from outside would mean writing a row that disables the Controller. The table is empty, so the runtime tier resolves nothing and behaviour is unchanged; what production proves is that **the read path now succeeds where it previously failed**. The resolution path itself is covered by 44 unit tests, two of which drive the **real exported provider** rather than a hand-assembled one.

### Gate evidence for `6d9aecc`

Full suite **7056 passed · 0 failed · 51 skipped** (all 7 intentional, MEASURE-gated) · required-suite gate **OK, 33/33 executed** including the embedded-PostgreSQL `supabase/tests` · mutation **18/18** (K-2) and **23/23** (D6), 0 survivors · `tsc --noEmit` 0 · ESLint clean · `npm run build` exit 0 · CI green on **both** the `push` and `pull_request` workflows.

> **Two harness lessons recorded because both produce false confidence.** K-2's first mutation pass had three survivors: two were genuine coverage gaps (the supabase adapter had no test at all) and one was an *equivalent* mutant in a conditional this work had added — it provably changed no behaviour, so the conditional was removed rather than armoured with a test. Eight D6 mutants first reported as "not run": this repository's line endings are **not uniform**, and a multi-line anchor written with `\n` matches **zero** times in a CRLF file — which reads as a false SURVIVOR in any harness that does not assert the anchor count.

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

### Phase 8 — the "schema conflict" does not exist (2026-08-19)

Read-only. **No code, no migration, no ADR, no `profiles` change, no consumer-app change.**

#### ⚠️ Correcting the entry above: there is NO conflict between bo-23 and bo-10

That entry claimed *"Two frozen documents specify different schemas for the same feature."* **That was wrong, and it was my own misreading** — the assumption that `is_vip` and the status columns were alternatives.

They are **different fields for different modules, and they coexist**:

| Field | Belongs to | Source |
|---|---|---|
| `is_vip` | **Module 11 CRM** | [`14_CRM.md:142`](../backoffice/14_CRM.md) — *"VIP status is stored in `profiles.is_vip BOOLEAN` (new column)"* |
| `is_suspended` · `suspended_until` · `is_banned` · **`ban_reason`** | **Module 08 User Management** | [`04_Database_Architecture.md`](../backoffice/04_Database_Architecture.md) §7 |

bo-23 Phase 2 lists `is_vip` because Phase 2 also delivers `/admin/crm/[id]`. Its migration list is a roadmap summary, **not a schema source**.

#### Authority precedence for schema — it is explicit

**ERRATA-005** (Constitution §9.2) *"Declared `04` the single authoritative schema source"*, and [`04`](../backoffice/04_Database_Architecture.md) line 24 states it: *"where a table is described in more than one document, the definition referenced here **governs**, and any other copy is a non-authoritative reference."*

So the governing definition is bo-04 §7, and it defines **four** additive columns — one more (`ban_reason`) than bo-10 §4 mentions. `05_API_Architecture.md` §users agrees with bo-04. **Nothing is in conflict; one summary is merely not exhaustive.**

**Classification under Constitution §8.2: not a Design Change, and not even an erratum that blocks anything.** No ADR is required to resolve a conflict that does not exist. **Owner Decision A from the previous entry is withdrawn — it was never needed.**

#### `profiles` ownership — answered by the frozen architecture

bo-04 line 106: *"Existing product tables (`profiles`, …) are defined in the main app schema; **§7 documents the additive columns this architecture requires on them**."* §7 is headed *"Minimal modifications to existing tables. **Only additions, never breaking changes.**"*

So `profiles` is **consumer-app-owned**, and the approved v1.1 architecture **already authorises the Back Office to add these columns**. Ownership is not transferred; User Management is an administrative facade over consumer-owned data.

#### What remains genuinely blocking

**MEASURED: zero code references** to `is_suspended`, `suspended_until`, `is_banned`, `ban_reason` or `is_vip` anywhere in `src/` or `supabase/migrations/`. Production `profiles` has none of them.

**`MODULE 08 FULL IMPLEMENTATION = CROSS-WORKSTREAM.`** bo-10 §4 defines suspension as *"cannot post content, cannot comment, cannot use AI, can browse read-only"*. Those enforcement points live in the consumer API layer — `src/app/api/reviews/route.ts`, `src/app/api/chat/route.ts` and the comment path — none of which consults any status field today. Controller V2 alone cannot satisfy the frozen contract; the admin side would set a flag nothing honours.

Ban is better placed: *"revokes ALL active Supabase sessions"* is C11, which exists. Soft-delete anonymisation still meets the known *"Delete Account has no backend"* gap and bo-33 Privacy.

#### 🔴 Minimum Owner decisions — now **two**, not four

1. **Authorize the Phase 2 migration** (bo-04 §7 profiles columns + `user_notes` + `moderation_queue` + `moderation_actions`), under the ADR-017 pattern. **No ADR needed for the schema itself** — bo-04 §7 is already approved at v1.1.
2. **Authorize consumer-side enforcement of suspension**, or scope Phase 2 to admin-side only and accept, explicitly, that suspension restricts nothing until the consumer app honours it.

Still open, unchanged and unrelated: **Module 17** hub, **Module 20** classification.

**PHASE 8 BLOCKED — PENDING MIGRATION AND CROSS-TIER AUTHORIZATION.** The schema-authority conflict is closed.

### Phase 2 / Module 08 — Owner Decision 2 taken; enforcement is ordered behind the migration (2026-08-19)

**Owner decision recorded:** suspension must be **real enforcement, not an admin-only flag.** The contract is not weakened.

**No enforcement code was written**, and the reason is an ordering fact, not a preference.

#### Cross-tier enforcement map — measured from the code

`10_User_Management.md` §4 prohibits four things for a suspended user: *post content · comment · use AI · browse read-only*. Those enforcement points are:

| Prohibited action | Route | Guard today | Reads `profiles`? |
|---|---|---|---|
| Post content | [`api/reviews/route.ts`](../../src/app/api/reviews/route.ts) POST | `getRequestUser` | ❌ |
| Comment | [`api/reviews/[id]/comments/route.ts`](../../src/app/api/reviews/[id]/comments/route.ts) POST | `getRequestUser` | ❌ |
| Use AI | [`api/chat/route.ts`](../../src/app/api/chat/route.ts) POST | `getRequestUser` | ❌ |

`getRequestUser` is the shared authentication primitive across ~20 routes and **does not read `profiles` at all**. Putting the status check inside it would (a) add a database round trip to every authenticated request and (b) block read-only routes, which the contract explicitly permits. So the boundary is **one shared `assertAccountActive` primitive called by the three prohibited-action routes** — one coherent boundary, not three inline checks.

Reactions/likes are **not** in the prohibited list and were not added to it.

#### Why enforcement cannot ship first

The four columns do not exist. A query selecting `is_suspended` from `profiles` is **rejected by PostgREST** — it does not fail soft. Merging enforcement before the migration would break **posting, commenting and chat for every user in production**. The alternative — tolerating the missing column and treating everyone as active — is a fail-open path that would outlive its excuse.

**So the order is: migration → enforcement.** Not a preference.

#### Migration artifact prepared, NOT applied

[`supabase/migrations/deferred/PHASE2_M08_profiles_account_status.sql`](../../supabase/migrations/deferred/PHASE2_M08_profiles_account_status.sql) — the four `profiles` columns quoted verbatim from `04` §7, additive only, `IF NOT EXISTS` throughout, with rollback and read-only verification queries in the header. It sits in `deferred/` so a bulk apply cannot pick it up. SQL grant guard: **0 errors**.

Scoped deliberately to Module 08. `user_notes` (CRM), `moderation_queue` and `moderation_actions` (Module 09) are **not** in this artifact — Module 09 is still blocked by the Content Safety overlap, and folding them in would expand Module 08 silently.

#### Ban and delete

**Ban** — *"revokes ALL active Supabase sessions"* is satisfied by **C11 Session Security**, which exists in production. No new capability needed. Needs `is_banned` + `ban_reason` from the same migration.

**Delete / PII anonymisation — SEPARATE WORKSTREAM.** bo-33 Privacy and bo-34 Retention are APPROVED, but account deletion still has no backend (a known Play-store blocker), and it is not required to make suspension real. Not expanded into this slice.

#### 🔴 The one remaining decision

> **Authorize applying `PHASE2_M08_profiles_account_status.sql` to production**, under the ADR-017 sequence: preflight → review → explicit authorization → apply → verify → rollback window.

The moment it lands, enforcement is unblocked and proceeds RED → implement → GREEN → mutation → regression → PR → CI → merge.

**PHASE 8 BLOCKED — PENDING PRODUCTION MIGRATION AUTHORIZATION.**

### Phase 8 — Module 08 User Management: backend COMPLETE, Controller integration OPEN (2026-08-20)

The entry above ended at *"PHASE 8 BLOCKED — PENDING PRODUCTION MIGRATION AUTHORIZATION."* **That authorization was given, and three units shipped.** They are recorded here because this document had no entry for any of them.

| Unit | Merge | What it delivers |
|---|---|---|
| Schema | `b474cff` ([#117](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/117)) | `public.account_status` — the four status fields, **isolated from `profiles`** rather than added to it ([ADR-022](../architecture/ADR-022-account-status-isolation.md)). Applied to production 2026-08-19, verified read-only from the catalog |
| Consumer enforcement | `30e78c1` ([#118](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/118)) | `POST /api/reviews`, `POST /api/reviews/[id]/comments`, `POST /api/chat` → 403 for suspended/banned. **No GET is blocked** — bo-10 §4 permits read-only browsing |
| Admin Users API | `3a825c2` ([#119](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/119)) | 6 routes, 8 permissions under a new `users` module, `REGISTRY_VERSION 2026-08-20.2`. Owner Decision A → [ADR-023](../architecture/ADR-023-module-08-admin-read-surface-roles.md) |

**ADR-022 corrected a defect this document's Phase-2 entries did not catch.** Those entries planned the four columns onto `profiles`, quoting bo-04 §7. A production preflight then measured `profiles` to be **public-read AND self-write** — RLS filters rows, never columns — so `ban_reason` would have been world-readable and a suspended user could have cleared their own `is_suspended`. The prepared artifact in `supabase/migrations/deferred/` is ⛔ **DO NOT APPLY**.

**ADR-023 resolved a policy conflict that had never surfaced because no code needed it.** `05` §6 said the user list and detail views were `admin`+; `12_RBAC.md` §3, `10` §6 and `04` §8 all said `moderator`. Every document in the conflict is `v1.0`, `DRAFT`, dated 2026-07-13 — **none outranks another**, so it required an Owner decision, taken as **Decision A**: `moderator` reads the surface; `ban_reason` and email *search* stay `admin`+ behind their own permissions.

**Consequence recorded, not decided:** `moderator` is no longer identical to `analyst` (4 → 8 permissions). That falsifies the stated premise of [BL-C3-02](BACKLOG.md#bl-c3-02--should-moderator-keep-analytics-read-access) and fires the trigger that item names for itself. **BL-C3-02 is unblocked, not answered.**

#### 🔴 What Module 08 still needs — Controller integration

MEASURED on `3a825c2`: `ADMIN_HUBS` holds 5 hubs and `ADMIN_MODULES` holds 8 modules. **Neither `tappy.hub.user` nor any users module is among them.** So Module 08's backend is live and reachable by direct API call, and it is **invisible to the Controller** — no manifest, no nav group, no `permissionScope`, no page.

This is the same class of gap Phase 7 found in the shell: a layer that exists in the registry and is absent from the product. It cannot be closed by registering a manifest alone — `01_ARCH` §8 requires *"You never see a door you cannot open"*, and a nav entry pointing at a route that does not exist is a door that opens onto nothing.

> **OWNER DECISION REQUIRED — authorize the `/admin/users` surface.** Registering `tappy.hub.user` + a `users` module manifest + the page is one unit; the page is new UI, and `17_UI_UX_Standards.md` is implementation authority only for the six B5 surfaces the Owner named. This is a seventh.

**Also still open for Module 08, unchanged:** auto-unsuspend cron · session revocation on ban (a ban currently records state and does **not** end a session — the route returns `session_revocation_pending: true` and the audit row records `sessions_revoked: false`, so nothing claims otherwise) · soft delete · `POST /[id]/notes` (no `user_notes` table).

---

### K-5 / B14 — module data ownership contract: **RESOLVED** (2026-08-20)

The first of the two items that were both unblocked and already Owner-authorized. [ADR-024](../architecture/ADR-024-module-data-ownership.md). **No migration, no DB change, no production mutation** — B14's own constraint, met by construction.

**The contradiction, all three sides quoted:** `01_ARCH` §2.1 writes `data: { tables, migrations }` as a **required** manifest field and §4.2 makes it the mechanism for table ownership; C6 §1 and §5 state *"modules do not own tables in this codebase; there is nothing to collide"* and defer two items on that basis; and the implemented `ModuleManifest` had **no `data` field at all**.

**The finding: C6 is not a repeal.** *"Modules do not own tables **in this codebase**"* is descriptive and was accurate. What was missing is the third statement nobody had written: **what the absence of `data` means.**

| Decision | Effect |
|---|---|
| `data` is **OPTIONAL**; absence = owns no tables | The eight shipped manifests become **conformant** rather than silently non-conformant. §4.2 stays an architectural rule, per B14 |
| **Table-collision validation implemented** | §5 already required it; C6 deferred it solely because *"there is nothing to collide"*, and that reason expires the moment the field exists. Comparison is **trimmed and case-folded** — an unquoted PostgreSQL identifier folds, so `USER_NOTES` and `user_notes` are one table |
| `migrations` deliberately **not** added | Its reason for deferral — *"undefined anywhere"* — does **not** expire. C6 §1's migration-versioning deferral stands unchanged |
| §4.2 naming rule **not** enforced | Every table a module could claim today predates V2, so enforcing `<hub>_<module>_<entity>` would reject the first genuine declaration. A test pins the non-enforcement so adding it later is deliberate |
| **No module acquires a table** | B14 says it literally; a test asserts zero of the eight production manifests declare a `data` block |

**Mutation 11/11 killed.** Two survived the first run and both were real: deleting a shape check let the input fall through to a *later* branch whose different error message still matched a `toContain('data')` assertion — the manifest was still rejected, so the tests were green for the wrong reason. They now assert the exact message, making each branch independently observable.

**Residual, stated rather than hidden:** ownership is **declarative**. §4.2's *"no other module may query these"* is recorded, not enforced — nothing stops a module importing a repository and reading another's table. Enforcing it needs the `src/controller/modules/` shape that `01_ARCH` §1 rules 1–3 describe and the repository has not adopted, which is the same reason those three Architecture Guard rules are deliberately unwritten.

---


### Phase 8 — Module 08 Controller surface: **COMPLETE** (2026-08-20)

The gap this document opened earlier the same day — *"BACKEND COMPLETE · NOT REGISTERED AS A CONTROLLER MODULE"* — is closed. **The first business module to exist end-to-end in Controller V2.**

**Nothing in the backend was rebuilt.** `account_status`, consumer enforcement, the eight `users.*` permissions, the six API routes, ADR-022 and ADR-023 are all untouched. The manifest DESCRIBES the shipped surface, exactly as FOUNDATION-03 did for the other seven modules.

| Piece | Detail |
|---|---|
| **Hub** | `tappy.hub.user` — id fixed by taxonomy §1, **navigationOrder 5** so it takes its architected second position **without renumbering a single existing hub**. A renumber would have moved four live surfaces to place one new one |
| **`permissionScope`** | `users.list.read`. ⚠️ MEASURED **a no-op for the current registry** — the hub holds one module requiring the same permission — the same honest state Phase 4 recorded for `tappy.hub.security`. It becomes load-bearing when Moderation (09) and CRM (11) join |
| **Manifest** | `tappy.hub.user.management`, declaring **only** `users.list.read`. Declaring all eight would claim them exclusively (C6 §5) and refuse any future module that legitimately needs one. The other seven stay enforced where they always were: in the API routes |
| **`data`** | Deliberately **absent** (ADR-024). Whether Module 08 owns `account_status` — which the consumer app also reads through its own client — is a real question, and answering it inside a UI change would be smuggling |
| **Page** | `/admin/users`, gated by `requirePagePermission(users.list.read)` |

**The page contains no authorization logic.** `requirePagePermission` is enforcement; the `can` flags it passes to the client are UX, per `12_RBAC.md` §4.2 (*"UI permission checks are for UX only … Server-side checks are the security enforcement"*) and §8 (*"you never see a door you cannot open"*). Both come from the PDP. **There is no role comparison in the module** — the client receives booleans and never learns which role produced them. Field visibility is likewise the server's answer: the page renders `email_masked` and `ban_reason_withheld` as returned and re-derives neither, because two implementations of one rule is how they drift.

**A ban is still reported honestly.** The surface shows the `session_revocation_pending` warning before the action and again after it, so an operator is never left to assume a banned user is gone.

#### Two things the guards caught, both real

1. **Architecture Guard §1.4.** The new kernel test imported `@/lib/i18n/admin` — the identical violation the Command Palette hit in Phase 7. A kernel test that cannot compile without the consumer app is a kernel that cannot be extracted. Translation coverage moved to `hubGrouping.test.tsx`, which is UI-layer, and was **generalized to every module label** — hub headings had that guard since Phase 7, module labels never did.
2. **`/admin/users` was one of the four removed placeholders.** `adminNavigation.test.ts` pinned it as a route that must never appear, because FOUNDATION-03 deleted it as a *"COMING SOON"* door onto nothing. It is now a real surface, so the pin was moved rather than loosened: three placeholders remain, and `/admin/users` joined the expected route sets. **This is the first time `moderator`'s navigation differs from `analyst`'s** — the navigational consequence of ADR-023.

**Verification:** RED first (15 failing). 956 tests green across controller + components + app. **Mutation 14/14 killed**, including *the page deleted while the nav entry stays*, *the route pointed at a path with no page*, *the module gated on a permission analyst also holds*, *the module silently claiming table ownership*, and *the Vietnamese label copied from English*. `tsc` clean, lint clean on every new file, Architecture Guard 10/10.

⚠️ **Verification limitation, unchanged in kind.** `/admin/users` renders inside `/admin`, which needs an authenticated `@tappyai.com` session this session does not hold. **Production render not visually verified; unit/mutation/CI evidence only.** No account was impersonated, and no `account_status` row was created to manufacture a result.

## ENGINEERING COMPLETE — OWNER UAT / OWNER DECISIONS ONLY (2026-08-21)

`main` = `45f525d`, deployed. **Class A is empty and class B has no candidate.** Every remaining item needs an Owner UAT session or an Owner decision; none needs code.

### Release-blocker audit — `45f525d` ([PR #140](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/140))

A full sweep of the admin surface against the 15 checks. **Four defects, three of them in work shipped this same week** — recorded because how they escaped matters more than that they were fixed.

**1. `admin.common.cancel` did not exist, and was live in two components.** `ModerationQueue` and `UserSessionsPanel` both call it, so both Cancel buttons rendered the raw key in production. It escaped because the i18n guard proved **vi ≡ en and nothing more** — symmetry was perfect, the catalogue simply lacked the key. An earlier check, `grep -c "'admin\.common\.(loading|cancel)'"` returning 2, looked like confirmation and was two hits on `loading`. The guard now scans every `t('admin.…')` literal under `components/admin` and `app/admin`; verified by deleting the key again and watching it fail.

**2. `moderation.queue.assign` was invented.** `12_RBAC` §3 lists exactly seven moderation rows and none is "Assign". `04` §4.4 gives the queue an `assigned_to` column — but **a column is not an authority**: it says the queue can record an assignee, not who may set one. The permission carried a role set nobody granted and had no surface. Removed; `REGISTRY_VERSION` → `2026-08-21.3`. The moderation permission **set** is now asserted, not just each member's roles — nothing caught the extra id because nothing checked the set.

**3. Module 09 created the repo's first module → module import.** `moderationModule.ts` imported `userHub` from `userManagementModule.ts`, so Content Moderation quietly stopped being removable independently of User Management. The root cause predates Module 09: `userHub` and `securityHub` were defined *inside* module files, which inverts §2's "a Hub contains and governs modules". Harmless while each hub had one module. Both descriptors now live in `modules/hubs.ts`.

**4. K-7 rule 1 is implemented; rules 2–3 stay DEFERRED.** §1 rule 1 now has a real target *and* a real precedent — it would have caught #3 the day it was written. Verified by reintroducing the import: the guard fails. **11 architecture rules pass.** Rules 2 and 3 remain deferred on unchanged evidence: no connector directory, no `data/repositories` layer.

### Final classification

| Class | Items |
|---|---|
| **A — implement now** | **EMPTY** |
| **B — needs a migration** | **NO CANDIDATE.** The last two tables with authoritative DDL are live. `platform_settings` and `module_registry` have **no DDL in `04`** to implement |
| **C — Owner decision** | Module 17 hub · Module 20 classification · Phase 7 (5) · F-10 activation (+4) · who may assign a queue item |
| **D — authenticated UAT** | M01 · M04 · M08 · M09 · C11 · B8 |

---

### Owner UAT executed — class D is closed except where it is forbidden (2026-08-22)

Production `4f23a66`, deployment `dpl_BbLLDSZcP937PHk4eKksbisw4NxE`, READY, aliased to www.tappyai.com. The Controller Home prints the commit, and it read `4f23a66` throughout — the surfaces below were measured on the build this document describes, not on a cached one.

**The blocker this document names in five separate places is gone.** Every class D row was deferred with the same sentence — *"this workstream holds no production session"* — and that is no longer true: the Owner signed in and the session was used for all of the following. Nothing else ever stood in the way of these items.

| Item | Result | What was actually measured |
|---|---|---|
| **M01 Home** | ✅ PASS | The six metrics with a real source render from `daily_snapshots` (0 · 12 · 16 · 0 · 0 · 22). Registry counts read **2 admin roles · 11 modules · 6 hubs**, which match the registry measured from source at the same commit. The three columns with no source render **NOT CONNECTED YET**, not `0` — the distinction §7 exists for. "provisional — may still change" is present. EN and VI, 0 raw keys, 0 console errors |
| **M04 User Analytics** | ✅ PASS | All four tabs, EN and VI, 10/10 tab transitions, request↔view binding, both directions of the stale-response race, and the null/zero/em-dash semantics. See the entry below — this one did **not** pass first time |
| **M08 Users** | ✅ PASS (read surface) | 22 rows; search narrows to 2 and restores to 22; the detail API returns **`email_masked`** and **`ban_reason_withheld`** as server-decided booleans, which the page renders rather than re-derives; notes API returns `{data:[]}` — genuinely empty, nothing was written. Suspend/Ban render. EN and VI |
| **M09 Moderation** | ✅ PASS (surface) | Queue API 200 `{data:[]}`; the page states *"Reporter identity is never shown here"* and declares its three gaps rather than hiding them. EN and VI |
| **C11 Sessions** | ✅ PASS (listing) | `/api/admin/security/sessions` returns eight fields and **none of the four §7 forbids**: no token, no cookie, no IP literal, no user-agent string, no JWT anywhere in the payload. `client_class` is a classification, not a raw UA. Limit requested 20, under §7's 50 |

**What was deliberately not exercised, and why.** Ban, suspend, session revocation and any moderation action mutate production or end a real person's session; **B8 recovery is forbidden outright**. None was run, no account was created, and no row was written to make a screen look populated. `session_revocation_pending` is therefore **source-verified** (`UsersManager.tsx:183`) rather than runtime-verified — proving it at runtime requires banning somebody.

**BL-002 is unchanged.** It needs a second `super_admin` that only the Owner can create.

#### 🔴 M04 did not pass first time, and unit evidence had said it would

Three of the four User Analytics tabs — Engagement, Subscription funnel, Retention — **crashed into the error boundary on production** the moment they were opened. `undefined.toLocaleString()` twice and `undefined.map()` once, thrown at measure time.

One defect, four expressions of it: the component held a single `data` slot for four differently shaped payloads and **nothing in the runtime data said which view a payload came from**. `setView` re-rendered immediately while `data` still held the previous view's payload, and the `as` casts silenced TypeScript at exactly the point the runtime was wrong. `'series' in data` was never a discriminator — `GrowthResult` and `EngagementResult` both carry `series`, so the Engagement branch took a `GrowthPoint` and asked it for `.dau`. A second, independent defect sat behind it: per-view requests with no abort and no sequence guard, so a response for a view the operator had left could land last and win.

Fixed by binding the payload to the view that requested it — a real discriminated union — and dropping a response whose request was abandoned. **PR [#151](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/151)**, merged as `8e229e6`. 19 tests written red first; **mutation 17/17 killed, 0 survivors**.

**This is the entry that matters most in this section.** Module 04 shipped with unit, mutation and CI evidence and a burn-down that classified it as complete-pending-UAT. It was *broken for every operator who opened it*, and no amount of the evidence it already had could have said so. The verification limitation this document records for every module — *"production render not visually verified; unit/mutation/CI evidence only"* — is not a formality.

#### Correction — Module 09 ingestion is not blocked on anything Controller V2 owns

The burn-down below leaves the impression that Module 09 waits on ingestion. Measured on production at `4f23a66`:

| Fact | Measured |
|---|---|
| `fn_ingest_moderation_reports()` has a caller | ✅ `src/app/api/cron/analytics-snapshot/route.ts:145`, daily |
| `music_track_reports` | **0 rows** |
| `content_reports` | **0 rows** |
| `moderation_queue` · `moderation_actions` | **0 rows** |

**The queue is empty because no report exists anywhere, not because ingestion is broken.** Every Controller V2 part is present and wired: both tables, the ingestion function, its caller, the API, the surface, the permission.

What is missing is a screen that files a content-safety report, and **Module 09 does not own that**. `moderationModule.ts` records the boundary under ADR-024: *"this module owns the two moderation tables. It does NOT own `content_reports` or `music_track_reports` — those belong to the Content Safety Gate and the music module."* Building that writer from Module 09 would breach the ownership contract it declares. It is Content Safety Gate work, outside Controller V2, and it is neither an Owner decision for this project nor a Controller V2 engineering gap.

---

### Module 09 Content Moderation — APPLIED TO PRODUCTION (2026-08-21)

| | |
|---|---|
| Migration | `supabase/migrations/20260821_m09_moderation_queue.sql` |
| SHA-256 | `55ffebe186cbfaba626eb5d88b060a542a921ae50d94f6478811e6098f38048b` (worktree ≡ git blob, re-verified immediately before applying) |
| Production ref | `fwznnobrdctuskgrvuik` — staging `nhncoqyadofojjrnpiia` never targeted |
| Apply | **HTTP 201** |
| Merge | `16128c5` ([PR #138](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/138)) |
| Deployment | built from `16128c5`; `/admin/moderation`, `/api/admin/moderation`, `/api/admin/moderation/[id]/resolve` all present |

**Governed by [ADR-026](../architecture/ADR-026-moderation-queue-reporter-provenance.md) — Owner Decision B, 2026-08-21.** `04` §4.4 defines the queue with `reported_by UUID`; `content_reports` deliberately stores only an opaque, non-reversible `reporter_source_id`. Content-safety reports therefore carry `reported_by = NULL` and the opaque id in `metadata`; music reports keep the real reporter id. `content_reports` is not modified.

**Read-only verification, 15 checks:**

| | Verified |
|---|---|
| External boundary | **`PGRST205` → `42501`** on both tables · `POST /rest/v1/rpc/fn_ingest_moderation_reports` → **401** |
| Enums | 3, label for label — `moderation_type` (5) · `moderation_status` (4) · `moderation_action_type` (9) |
| Columns | queue 15, actions 10, exactly §4.4/§4.5. **`reported_by` nullable** — ADR-026 makes NULL a fact about the source |
| FK delete behaviour | `moderation_actions.queue_id` → `SET NULL` (`n`) so a decision outlives its report · `actor_id` → **no action** (`a`) |
| Indexes | 7 — the 4 from §4.4/§4.5, `uq_modq_source`, and 2 primary keys |
| Privileges | `has_table_privilege`: `anon`, `authenticated`, `PUBLIC` all **false** for SELECT *and* INSERT on both tables |
| Function | `fn_ingest_moderation_reports()` · `SECURITY DEFINER` · `search_path=public, pg_temp` · EXECUTE **service_role only** |
| 🔑 ADR-026 I-3 | measured on the **deployed function body**: in the branch after `content_reports`, `auth.users` occurrences = **0**, `profiles` = **0**; `reported_by NULL` present; provenance carried |
| ADR-026 I-4 | `content_reports` still has exactly its 8 original columns |
| Rows | queue **0**, actions **0** — nothing manufactured, ingestion never called |
| Boundary | `platform_settings`, `module_registry`, `user_active_days`, `anon_identity_map` all still absent; the five live Controller tables keep their grants |

**Production, unauthenticated:** `/api/admin/moderation` **401** · `POST …/resolve` **401** · **0/8** moderation labels or field names leak from `/admin/moderation` · M01, M04, M08 and C11 endpoints unchanged.

⚠️ **INGESTION IS MUSIC-TRACK REPORTS ONLY.** `content_reports` **has no writer anywhere in `src/`** — the table and its INSERT policy exist, but the reporting surface that would fill it was never built. `music_track_reports` does have a live writer (`POST /api/music/tracks/[id]/report`). The content-safety branch of the ingestion is implemented and verified, and produces no rows today. **Content-safety ingestion is NOT live**, and nothing here should be read as claiming it is.

*(Measured twice: a first pass that scanned only `.ts` reported no writers, a second including `.tsx` reported two — both turned out to be comment lines in Module 09's own files. The conclusion is unchanged; the method was corrected.)*

**Module 09 is not COMPLETE.** Schema and surface are live; behavioural verification needs an authenticated Owner session, and no moderation action has been exercised in production.

---

### Module 08 internal admin notes — `user_notes` APPLIED TO PRODUCTION (2026-08-21)

Merge `9f5a3d9` ([PR #135](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/135)). Applied under its own Owner authorization; no previous authorization was reused. Migration SHA-256 `5c799e0f4bbf46fe7191f8a5993d119b20e210327ec019504c9c290fed8053eb`, worktree ≡ git blob, re-verified immediately before applying.

**Contract, all four parts already written down:** DDL `04` §4.6 · behaviour `10` §3.8 (*"Chronological internal notes… Pinned notes shown at top. Add new note inline."*) · authority `10` §3.9 (*"Add internal note — moderator"*) · role matrix `12_RBAC` §3 (analyst ❌ · moderator ✅ · admin ✅ · super_admin ✅).

**Why this table is not like the others.** Every other user-scoped table here holds **facts** about an account. This one holds an operator's **opinion of a person**: free text, about a subject who cannot see it and never agreed to it. Three consequences, each verified in production rather than assumed:

| Invariant | Verified |
|---|---|
| 🔑 The subject cannot read their own row | `has_table_privilege`: `anon`, `authenticated` and `PUBLIC` all **false** for SELECT *and* INSERT. **No own-row RLS policy** — the reflex that a `user_id` column deserves one would have handed every user the internal file kept on them |
| 🔑 `author_id` does **not** cascade | `confdeltype = 'a'` — deleting an administrator cannot delete the notes they wrote. An audit trail that disappears with its author is not one |
| `user_id` **does** cascade | `confdeltype = 'c'` — a deleted user's file has no subject left |
| 🔑 The note text never reaches a second table | Audit records a length, a pin state and a count. `audit.log.read` is admin+, a **different population** from `users.notes.read` |
| Columns | 7 exactly, `note` NOT NULL |
| Indexes | `idx_user_notes_user (user_id, created_at DESC)` + pkey |
| Grants | `postgres` + `service_role` only |
| RLS | enabled, **0 policies** |
| Rows | **0** — nothing manufactured |
| Boundary | `PGRST205` → **`42501`**. No function, no policy, no other table created; the four existing tables kept their grants |

**Two permissions, same roles.** §3 states the authority once, for *adding*, so `users.notes.read` carries exactly the roles §3 gives to writing — whoever may write a note may read them, and analyst gets neither. Two ids because the actions differ and because widening READ later must not also widen WRITE. `REGISTRY_VERSION` → `2026-08-21.1`.

⚠️ **One assumption, stated rather than buried.** §3 does not name a separate READ authority. The encoding above is the most restrictive reading of the single line it gives. Widening READ to analyst is one array change and an Owner decision, not an implementation detail.

**No edit, no delete, no unpin** — §3.8 describes a chronological record with an inline add and nothing else. Verified: the route exports `GET` and `POST` only.

**Mutation 29/30 killed.** Findings kept: **N22/N30** survived everything until a *wiring* suite existed — the panel obeyed its capabilities perfectly, on the wrong input. **N09** survived twice because `adminErrorResponse` maps an unknown error to the *same* envelope as the deliberate guard, so status and body were byte-identical; what separates them is that a handled failure is silent while a crash logs `unhandled error`. **N18** was a mutation written wrong — `from` equalled `to`, so it mutated nothing and reported SKIPPED. And a test that stubbed the wrong response shape crashed the panel, exposing that it called `.map` on whatever arrived; a 200 whose payload is not a list is now the error state. **N10** is an equivalent mutant: reading `author_id` from the body is unreachable while `.strict()` rejects it, and N11 pins `.strict()`.

**Production, read-only:** deployment built from `9f5a3d9`; both verbs **401** unauthenticated; **0/8** note labels or field names leak to an anonymous visitor; sessions, analytics, users and audit endpoints unchanged. **No production note was created.**

---

### A ban now ends the banned user's sessions — Owner Decision A (2026-08-21)

Merge `df53496` ([PR #133](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/133)). No migration, no new permission.

`10_User_Management.md` §4 has always defined a ban as three things: set the flag, revoke every active Supabase session, stop the user logging in. Only the first was built — the doc marked it **NOT TRUE YET** and prescribed a manual `force-logout` after every ban. C11 shipped the mechanism on 2026-08-15; two of the three now hold. **§4's third clause, preventing a fresh login, remains separate work.**

**Owner Decision A.** `users.account.ban` authorizes the **complete** ban operation, revocation included — one decision for one operation, not a second authorization path. Deliberately **not** a compound gate: §4 gives the ban to the ban permission, so also demanding `security.sessions.revoke` would make the documented ban unperformable by the role the contract grants it to. It grants nothing generic either — arbitrary revocation stays behind `security.sessions.revoke`, pinned by assertions that **no C11 route mentions the ban permission** and that the shared helper **carries no authorization of its own**.

**Atomicity is not available, so honesty stands in for it.** `account_status` is a table here; `auth.sessions` belongs to GoTrue, and no transaction spans them. What can be built is a ban that never lies about itself:

- the flag is written **first**, because the reachable failure state is then *"banned but still signed in"* — visible, recoverable, and exactly what this route did before — rather than *"sessions killed for an account that was never banned"*;
- when revocation fails the ban **stands**, and the response keeps saying `session_revocation_pending: true`;
- the audit keeps `sessions_revoked` as a **boolean**, the shape it has always had, so entries written before and after this change stay comparable. The count and failure reason are new keys beside it.

**One revocation mechanism.** `revokeAllSessions` is extracted so both callers share not just the RPC but the *interpretation* of its result — otherwise the two could drift on whether `owner_protected` counts as success. The mechanism stays in SQL, where C11's single-statement atomicity and its `is_anonymous = false` filter (§6.1) already live.

**Mutation 21/21 killed**, after two rounds that were themselves the finding:

- 🚨 **Five anchors matched ZERO times** because these files are checked out with **CRLF** and the anchors were written with `\n`. The harness reported SURVIVED for mutations never applied. **A false SURVIVED is worse than a real one** — it sends you hunting a gap that does not exist. The harness now tries both forms.
- **B03** survived because the mutation only *inserted* a line; it never reordered anything it was named after. Rewritten as a real reorder, and the ordering is now asserted directly.
- **B10 · B11 · B20 · B21** were genuine gaps: an RPC that *throws* rather than returning `{error}`; a function returning no row at all; a force-logout RPC error answering `200 {revoked: 0}` instead of 500; and the SQL function's Owner refusal — reachable only when it disagrees with the handler's pre-check, which is the one case it exists for.

**Production, read-only:** deployment built from `df53496`; ban, force-logout, single-revoke and inventory all **401** unauthenticated; no new unauthenticated route; unrelated surfaces unchanged. **No production user was banned and no production session was touched** — behavioural proof of the combined path belongs to Owner UAT.

---

### C11 Session Security — the Controller surface (2026-08-21)

Merge `8b9bf3b` ([PR #131](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/131)). **No migration, no new permission, no Owner decision** — everything this needed had already shipped.

**C11 had been accepted and in production since 2026-08-15** — migration `20260814_c11_session_security.sql`, ADR-021, three working APIs, two registry permissions — **and no surface at all.** An operator could ban somebody and had no way to see, let alone end, the session that ban does not touch. That gap was the highest-value dependency-safe work left in the repository.

**A panel on the user detail, not a page.** `11_…` §7 refuses a platform-wide session list outright — *"a compromise-amplifying surface and nothing requires it"* — and scopes the inventory to **one subject at a time, addressed by `user_id`**. The user detail *is* that subject, and it is where an operator already stands when deciding whether a ban needs a sign-out with it. A `/admin/security/sessions` route would have contradicted the contract it implements.

| Contract clause | How it is held |
|---|---|
| §7 listing → `security.sessions.read` | page derives it from that permission alone |
| §5.1 revocation → `security.sessions.revoke` | **kept separate** — an operator may be trusted to *see* where somebody is signed in without being trusted to sign them out |
| §7 never exposed: tokens, cookies, **IP**, **raw user-agent** | a test feeds the panel a response carrying all four and asserts none reaches the DOM |
| §7 limit ≤ 50 | requests 20 |
| §5.1 Owner may not be signed out | `owner_protected` renders as a **refusal**, never as "0 revoked" |
| §6 a forced logout needs a recorded reason | one predicate gates both the button and the handler |

**Mutation 22/23 killed.** Three findings kept:

- **C06** survived because every failing case stubbed a non-2xx *response* and none stubbed a *rejected promise* — a network failure took the other branch and reported "no sessions".
- **C11** survived because the other failure cases also produced unusable bodies, so the outer `catch` reached the right message **by accident**. A 403 carrying a well-formed success body separates the check from the accident.
- **C17/C18/C19** exposed a real design flaw: the reason rule was written **twice**, once in the button's `disabled` and once in the handler, so either could be deleted with nothing failing. Now one predicate.
- **C22/C23** survived the component suite entirely, by collapsing `sessions.revoke` into `sessions.read`. The panel behaved perfectly **on the wrong input** — component tests hand it capabilities directly, so they can prove it obeys them and cannot prove it is *given* the right ones. A second suite now covers that seam at both ends.

C17 still survives and is an **equivalent mutant**, argued: with the button disabled by that same predicate, the handler's guard has no reachable caller. It stays because it is one rule applied at two layers, not two rules.

**Production, read-only:** deployment built from `8b9bf3b`; `/api/admin/security/sessions` **401**, `POST …/force-logout` **401**, `DELETE …/[id]` **401**; **0/9** session labels or field names leak to an unauthenticated visitor; M01 and M04 endpoints unchanged.

---

### K-6 / B8 — break-glass Owner recovery: **ENGINEERING COMPLETE + PRODUCTION MIGRATION APPLIED** (2026-08-20)

Applied under its own Owner authorization. Implementation was already merged as `25274b5` (PR #122); only the production schema was outstanding.

**Applied the GIT BLOB, not the working copy.** The checked-out file carries CRLF from a Windows checkout and hashes `a962596…`; the reviewed, tested, CI-verified, merged artifact is the LF blob `f3c875aacd1c18f06928d751a8835070119f350a0247eaf0adac08d58da87df0`. A `diff` after stripping `\r` proved the two identical, so this changed no semantics — but a CR inside a `$$ … $$` body becomes part of each function's stored `prosrc`, and "apply the exact reviewed migration" means the bytes that were reviewed.

**Security properties verified, read-only:**

| | |
|---|---|
| External boundary | **`PGRST205` → `42501`** · `POST /rest/v1/rpc/fn_owner_recovery_*` → **404** |
| 🔑 EXECUTE | **`PUBLIC`, `anon`, `authenticated` AND `service_role` all `false`**, on all four functions — via `has_function_privilege`, never by reading ACL text |
| Table grants | **`postgres` only.** Not even `service_role` — stricter than any other table, and deliberately so |
| RLS | enabled, 0 policies |
| Functions | 4, all `SECURITY DEFINER` with `search_path=public, pg_temp`, owned by `postgres` |
| One open window | `uq_platform_owner_recovery_open` — a partial UNIQUE index on `(closed_at IS NULL) WHERE closed_at IS NULL`, so a second open window cannot exist |
| One-time semantics | `CHECK ((closed_at IS NULL) = (outcome IS NULL))` · `CHECK (outcome IN ('consumed','cancelled'))` |
| Window validity | `CHECK (expires_at > requested_at)` |
| 🔑 Audit is TRANSACTIONAL | **0 real `EXCEPTION WHEN` handlers** in any of the four functions — every `EXCEPTION` token is a `RAISE EXCEPTION` (5 · 0 · 2 · 3). An audit failure therefore propagates and aborts the recovery. Not fire-and-forget. |
| Rows | **0** — no recovery window was armed |
| Owner state | **unchanged** — 2 rows, 1 active, read only |

**No application recovery surface, and that is the design (ADR-025).** `/api/admin/recovery`, `/api/admin/break-glass`, `/admin/recovery` → 404. **Zero non-test files** under `src/` name the functions, the table or the `break-glass@system.invalid` sentinel; the only file that names them is `breakGlassBoundary.test.ts`, which exists to assert nothing else does (7/7 green).

**The recovery path was intentionally NOT exercised.** Proving it works would mean changing production ownership, so B8 is verified by structure and privilege, not by behaviour. This is **not** a break-glass UAT pass and is not recorded as one.

**Only this migration ran** — `user_notes`, `moderation_queue`, `moderation_actions`, `platform_settings`, `module_registry`, `user_active_days` all still probe `PGRST205`; `cohort_metrics`, `daily_snapshots` and `account_status` are untouched.

---

### K-6 / B8 — break-glass Owner recovery: implementation (2026-08-20)

Design [`13_BREAK_GLASS_OWNER_RECOVERY_DESIGN.md`](13_BREAK_GLASS_OWNER_RECOVERY_DESIGN.md) · decision [**ADR-025**](../architecture/ADR-025-break-glass-owner-recovery.md) · migration `supabase/migrations/20260820_b8_owner_recovery.sql`.

**Closes `01_ARCH` §10 R6 at the code level** — the only **Critical** risk in §10 with no mitigation built. D1–D4 were answered by Owner delegation on 2026-08-20.

⚠️ **The migration is written and tested, NOT applied to production.** That remains an explicit ADR-017 gate.

**R6 was less unbuilt than it read.** Four pieces shipped with Component 1 and were never described as recovery: `platform_owner.assigned_by` **already documents `'break_glass'`**, `active` + `revoked_at` already make transfer a revoke-and-insert, `uq_platform_owner_single_active` already makes two Owners impossible at the database, and `ON DELETE RESTRICT` already refuses to leave the platform ownerless. The dual control R6 names is **already enforced** by `checkOwnerGate`: a DB-only change yields `ENV_MISMATCH`, an env-only change `ENV_SET_BUT_NO_OWNER`, and either 403s the whole Controller — so a half-completed recovery **fails closed**.

#### The shape: two steps, and the application cannot call any of it

`arm → execute`, with `cancel` as the reversible exit. All four functions hold **EXECUTE for nobody — not even `service_role`**, the shape C8 gave `fn_outbox_publish` (P4). That is what makes *"break-glass must never become a hidden super-admin backdoor"* **structural rather than promised**: there is no application path at all, so no second authorization path can exist. A source-boundary suite asserts no `src/` file references the functions, the table, or the system actor sentinel.

| Decision | Resolution |
|---|---|
| **D1** target | **Named, never derived.** The obvious implementation was wrong: the bootstrap seed derives from *the sole active `super_admin`*, and production's sole `super_admin` **is** the Owner — so on credential loss it would recover to the very account that was lost. The target is **not** required to hold an admin role; requiring one reproduces the lockout |
| **D2** when | **Recovery-only.** The database cannot verify "normal control is unavailable" — the credential can be lost while the row is valid — so it is enforced by what can be: no application surface, a mandatory stored justification (≥ 20 chars, the `19` §5 floor), and an audit row for every arm/cancel/execute |
| **D3** time bound | **One-time, 5–120 minute window**, consumed on execute, replay and expiry both refused, at most one open window (partial **unique** index). No permanent recovery credential exists |
| **D4** audit | **System actor** — all-zero UUID, `break-glass@system.invalid` (RFC 2606 reserved), `actor_role = 'system'`. Carries operation, target, mechanism, correlation id, reason and outcome. **The write is inside the transaction, so a failed audit ABORTS the recovery** — the inverse of `writeAuditLog`'s deliberate fire-and-forget everywhere else |

#### 🔴 Mutation testing found the central security property untested

**22/22 killed** — but three survived the first run, and two of them were the property this whole change exists to provide:

> Dropping `service_role` from the `REVOKE EXECUTE` list **survived** on both `arm` and `execute`. The harness modelled `ALTER DEFAULT PRIVILEGES … ON TABLES` but **not `ON FUNCTIONS`**, so PostgreSQL's own PUBLIC default was the only grant in play and revoking PUBLIC alone happened to be enough. **The assertion was passing vacuously.** This is exactly the trap ADR-019 names and the C8/C11 harnesses already avoid.

The third: downgrading the single-open-window index from `UNIQUE` survived, because `arm`'s explicit guard still refused a second window on one connection — the index is the **concurrency** guarantee, which a single-connection test cannot exercise. It is now asserted from the catalog, as `uq_platform_owner_single_active` is.

**Verification:** 43 assertions against real PostgreSQL 17.5 + 7 source-boundary assertions. `tsc` clean, lint clean, Architecture Guard 10/10.

---

### Phase 8 — Module 01 Home Dashboard: **COMPLETE — migration applied, deployed** (2026-08-20)

Migration `supabase/migrations/20260820_m01_daily_snapshots.sql` · rollback alongside · Owner authorized **`daily_snapshots` and nothing else** on 2026-08-20.

✅ **APPLIED TO PRODUCTION 2026-08-20T06:21:56Z**, then merged as `a48761f`. Order was schema-then-code, per the M08 precedent: merging first would have left every admin's Home showing *"metrics unreachable"* until the table existed.

| Apply record | |
|---|---|
| Project | `fwznnobrdctuskgrvuik` (`ACTIVE_HEALTHY`) — hard-pinned in the script; the account also holds `nhncoqyadofojjrnpiia` staging, which was not touched |
| Migration SHA-256 | `483e4fd688e3c8061926e61e23e0e8d1153fb9b0a5abe123da7d015c238a89b1` — verified against the reviewed file before execution, so what ran is what PR #124 contained |
| Pre-state | `to_regclass('public.daily_snapshots')` → `null`. The script **aborts** if the table already exists |
| Transaction | `BEGIN … COMMIT`, HTTP 201 |
| Rows created | **0.** The migration populates nothing; the cron does |
| Unrelated objects | `platform_owner_recovery`, `user_notes`, `moderation_queue`, `platform_settings`, `module_registry` all still `null` — nothing else was applied |

**Verified read-only after apply:** 13 columns with `snapshot_date` as `date` (not a timestamp) · table grants **`postgres` + `service_role` only**, no `anon`, no `authenticated` · `has_function_privilege` → anon `false`, authenticated `false`, service_role `true` for both RPCs · RLS on with **0 policies** · `UNIQUE (snapshot_date, platform)` + both §7 indexes · both functions `SECURITY DEFINER` with `search_path=public, pg_temp`.

**Confirmed independently from outside**, using only the public anon key: `daily_snapshots` moved from `PGRST205 Could not find the table` to **`42501 permission denied`**, and the rollup RPC answers `42501` too. The `PGRST205 → 42501` transition proves both halves at once — the table now exists **and** it is closed to the public API. `account_status` served as the control, proving the probe can tell "absent" from "present but denied".

⏳ **`daily_snapshots` holds 0 rows, and that is correct.** The cron runs 00:05 VN; today's run happened *before* this migration, so the first legitimate snapshot arrives **00:05 VN on 2026-08-21** (17:05 UTC, 2026-08-20). Until then the Home renders its explicit *"no measurements yet"* state. **No snapshot was manufactured to make the dashboard look populated.**

**The Home was never an empty stub.** It showed registry counts; what it lacked was BUSINESS metrics. It now shows DAU/WAU/MAU and new/returning/total users from `daily_snapshots`, per M01 (*"pre-computed — no live queries to raw tables"*).

#### Six metric columns, not thirty-four

`04` §7 defines 34. **Six have a real source in this database today**; the rest name tables that do not exist — `ai_usage_log`, `conversations`, `moderation_queue`, notification delivery, Stripe revenue. A column that can only ever hold its `DEFAULT` is worse than an absent one, because a dashboard renders `0` as a measurement: *"Revenue today: $0"* would be a false statement of fact. The omitted columns stay **additive**; §7 is not amended.

#### The pipeline is the existing cron

`/api/cron/analytics-snapshot` already runs `05 17 * * *` = **00:05 VN** (ADR-008) over a trailing 4-day window with recompute-and-overwrite. `daily_snapshots` is **step 5**, shaped exactly like `fn_rollup_auth_daily` (SR-4). **Two RPCs, not one:** the rollup writes provisional rows, finalisation closes days that fall out of the window (§7A) — separate so a failed recompute cannot silently finalise days it never reconciled. A finalised day is never rewritten.

#### 🔴 Mutation found two tests passing for the wrong reason

**28/28 killed.** Four survived first, and the first pair is the important one:

> Dropping `AT TIME ZONE 'Asia/Ho_Chi_Minh'` **survived**. This machine is in Vietnam, so PostgreSQL inherited that zone and a bare `::date` cast was identical to the explicit conversion. **Every timezone assertion was passing for an environment-dependent reason** and would have behaved differently on a UTC CI runner. Fixed by pinning `SET TimeZone = 'UTC'` in the harness — plus a signup case at 22:00 UTC, because the profile helper seeded 09:00 VN, the one time of day where both calendars agree.

The other two: widening the MAU window survived because the activity **pre-filter** removes rows before the window looks (the two look-backs are now pinned to each other); and collapsing a read error into `empty` survived because the read path was untested — two states that send an operator to different places, the cron or the database.

**Verification:** 40 assertions against real PostgreSQL 17.5, 18 service, 17 UI. `tsc`, lint, Architecture Guard 10/10, SQL grant guard 0 errors, 4531 app tests.

---

### Phase 8 — Module 04 retention: `cohort_metrics` APPLIED TO PRODUCTION (2026-08-20)

Merge `aa00abc` ([PR #128](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/128)). Owner authorized this migration specifically; M01's authorization was **not** reused.

Migration SHA-256 `95f0d43f497bb2b99747d028443f711dca76f2c4ff9d1dcbd49d036cbfa600c9`, verified against the reviewed PR immediately before applying.

**Authoritative DDL is `04` §3.3 — not §7.** §7 is "Existing Table Modifications" and does not define this table. Reproduced verbatim, including the rate columns' `DEFAULT 0`.

**Production verification, read-only:**

| | |
|---|---|
| External boundary | **`PGRST205` → `42501`** — the table now exists *and* stays closed to the public API |
| Schema | 11 columns exactly. **Counts `NOT NULL`, rates nullable** — the asymmetry that lets a rate say "not measurable" |
| Constraints | `PRIMARY KEY (id)` · `UNIQUE (cohort_date, platform)` |
| Index | `idx_cohort_metrics_date` on `(cohort_date DESC)` |
| Grants | `postgres` + `service_role` only — **`anon` and `authenticated` absent** |
| RLS | enabled, **0 policies** — a missing policy is a denial |
| Function | `fn_rollup_cohort_metrics(p_from date, p_to date, p_today date)` · `SECURITY DEFINER` · `search_path=public, pg_temp` |
| EXECUTE | `anon` false · `authenticated` false · `PUBLIC` false · `service_role` true — checked with `has_function_privilege`, not by reading ACL text |
| Rows | **0** — nothing was manufactured |

**Only this migration ran.** `platform_owner_recovery` (B8), `user_notes` and `module_registry` all still probe `PGRST205`.

**No new cron.** Still 8 entries; `analytics-snapshot` keeps `5 17 * * *` = 00:05 VN and gains step 6. `06` §6's separate `cohort-rollup` at 00:10 UTC was **not** built: 00:10 UTC is 07:10 VN, seven hours *into* the day it would measure.

⏳ **PRODUCTION COHORT DATA NOT YET AVAILABLE.** `cohort_metrics` and `daily_snapshots` both hold 0 rows until the first post-migration cron at **00:05 VN on 2026-08-21**. Real source data exists (21 profiles, 7,909 events), so the first run produces genuine cohorts. Retention is **not** behaviourally verified, and no rows were created to make it look otherwise.

**Module 04 remains PARTIAL.**

---

### Phase 8 — Module 04 User Analytics: **3 of 5 sections shipped** (2026-08-20)

Merge `81bfa06` ([PR #126](https://github.com/huyphamsm-tappy/tappyai-mvp/pull/126)). **No migration** — everything reads already-rolled-up tables.

**The "M04 needs no new table" assumption was wrong, and measuring it was the point.** Retention D1/D7/D30 requires `cohort_metrics`, whose authoritative DDL is `04` §7 and which **does not exist**. That is a production migration with its own Owner authorization, so retention is not in this release — not faked, and not computed live off raw events behind §8's back.

| M04 section | Source | Shipped |
|---|---|---|
| Growth — total / new / MoM | `daily_snapshots` (M01) | ✅ |
| Engagement — DAU/WAU/MAU, stickiness | `daily_snapshots` | ✅ |
| Subscription funnel — free / Pro / conversion | `subscriptions` | ✅ |
| Demographics · acquisition | `user_acquisition` | ✅ **already served by `analytics/auth`** — not re-implemented |
| Retention cohorts — D1/D7/D30 | `cohort_metrics` | ✅ **shipped `aa00abc`; table applied to production 2026-08-20.** Awaiting first cron run for real data |
| Churn rate | — | ⚠️ **UNDEFINED** — no authoritative definition of churn |
| Sessions · average duration | `user_events.session_id` | ⚠️ **UNDEFINED** — events carry no session END |

The three absent sections are **named on the page itself**, so an operator learns why a section is missing rather than concluding the module is broken.

**Three rules, each pinned by tests:** no data is not zero · **a ratio with no denominator is UNDEFINED, not zero** — stickiness with `MAU = 0` and conversion with no users both return `null`, never `0%`, `NaN` or `Infinity` · a period-over-period rate needs two **adjacent** periods, compared at each month's **last** day.

New permission `analytics.users.read`, all four roles per `12_RBAC` §3. `REGISTRY_VERSION` → `2026-08-20.3`. Module order 40, so no existing analytics surface moved.

**Mutation 21/21 killed.** One survived first and generalised a real gap: an unknown icon name falls back to `HelpCircle` **silently**, and the guard added for Module 08 covered only Module 08. It now runs across the whole registry — the same generalisation the i18n label guard received.

⏳ **Insufficient production data for behavioural verification.** `daily_snapshots` holds 0 rows until the first post-migration cron run at **00:05 VN on 2026-08-21**, so growth and engagement correctly render the empty state. No data was fabricated.

---

## Master completion burn-down (2026-08-20)

Measured from the repository at `81bfa06`, not from the entries above. Registry as built: **6 hubs, 10 modules**.

| Bucket | Remaining | Blocked | Owner decision | Unblocked + authorized |
|---|---:|---:|---:|---:|
| **Phase 7** — Layout Presets · Density · date range · CP `act` · CP `search` | 5 | 5 | 5 | **0** |
| **Phase 8 — hubs** — ~~`user`~~ ✅ registered · `marketing` · `ai` · `operations` unregistered; `configuration` ambiguous | 4 | 4 | 2 | **0** |
| **Phase 8 — modules** — 11 not started · ~~01 stub~~ ✅ · 04 **retention applied; PARTIAL until real cohort data + UAT** · ~~08~~ ✅ · 17 + 20 ambiguous | 16 | 16 | 4 | **0** |
| **Kernel / security** — K-1 capability gate · K-2 runtime config · K-3 event producers · K-4 C6 debt · ~~K-5 B14~~ ✅ · ~~K-6 B8~~ ✅ **migration APPLIED to production** · K-7 guard §1.1–1.3 (near-vacuous today) · K-8 `module_registry` | 5 | 4 | 2 | **0** |
| **Legacy migration** | 0 | — | — | ✅ **COMPLETE** |
| **Verification / UAT** — BL-002 · authenticated E2E · Owner final UAT | 3 | 3 | 3 | **0** |

**Re-measured at `8b9bf3b` (2026-08-21). Nothing dependency-safe remains.** Every classification below is from the repository, not from the previous table:

| Class | Items | Why it cannot start |
|---|---|---|
| 1 — safe to implement now | **0** | — |
| 2 — needs a NEW migration authorization | Module 09 moderation · Module 17/20 settings · K-2 · K-8 | `moderation_queue`, `moderation_actions`, `platform_settings`, `module_registry` all probe `PGRST205` |
| 3 — Owner decision | Phase 7's five · Module 17 hub · Module 20 classification · 2 unregistered hubs · **ban → session revocation** | no authoritative source answers them |
| 4 — authenticated UAT | M01 · M04 Part A · M04 retention · M08 · C11 | this workstream holds no production session |
| 5 — future kernel | K-1 · K-3 · K-4 · **K-7** | the architecture they guard does not exist yet |

**K-7 is formally DEFERRED, and the check was run rather than assumed.** `src/lib/controller/modules/` holds **two** files and **neither imports the other**, so §1 rule 1 has nothing to catch; §1 rule 2's connector layer has no directory at all; §1 rule 3 is already covered in part by `no-adhoc-service-role-client`. A guard over an empty directory structure is a decorative test, and building it would have reduced the burn-down without protecting anything.

**~~One Owner decision surfaced by this workstream~~ — ANSWERED.** `10_…` defines a ban as *"Revokes ALL active Supabase sessions"* and marked it **NOT TRUE YET**. The authorization question was whether ban's own permission covers the whole documented effect or whether revocation additionally requires `security.sessions.revoke`. **Owner Decision A, 2026-08-21: the ban permission owns the full effect of a ban.** Shipped as `df53496` — see the entry above.

### Re-measured at `9f5a3d9` (2026-08-21)

Registry: **6 hubs · 10 modules · 29 permissions**. Production now holds **five** Controller tables: `account_status` · `daily_snapshots` · `cohort_metrics` · `platform_owner_recovery` · `user_notes`.

**Still absent, and why each is blocked — measured, not restated:**

| Table | DDL in `04`? | Class |
|---|---|---|
| `moderation_queue` · `moderation_actions` | ✅ both present | **3 — Owner decision required.** ~~Contract-complete~~ — see the correction below. |
| `platform_settings` | ❌ **no DDL** | 3 — contract incomplete, *and* Module 17's hub "needs an Owner decision" per taxonomy §2 |
| `module_registry` | ❌ **no DDL** | 3 — K-8 has no authoritative schema |
| `user_active_days` · `anon_identity_map` | ✅ (§7A) | 5 — rolling retention and anon stitching; §8C frames the first as a *performance* structure, so nothing is blocked on it |

### Re-measured at `16128c5` (2026-08-21, after Module 09)

Registry: **6 hubs · 11 modules · 34 permissions**. Production holds **seven** Controller tables: `account_status` · `daily_snapshots` · `cohort_metrics` · `platform_owner_recovery` · `user_notes` · `moderation_queue` · `moderation_actions`.

**Every remaining item, and what actually blocks it:**

| Item | Class | Blocker, measured |
|---|---|---|
| **All shipped modules** — 01, 04, 08, 09, C11, B8 | **4 — authenticated UAT** | This workstream holds no production session. Nothing else stands in the way of any of them. |
| Module 17 Settings · Module 20 | 3 — Owner decision | `platform_settings` has **no DDL in `04`** (measured: 0 occurrences), *and* taxonomy §2 says Module 17's hub "needs an Owner decision" |
| K-8 `module_registry` | 3 — Owner decision | **No DDL in `04`.** There is no authoritative schema to implement |
| 11 unstarted Phase 8 modules | 2/3 | Each needs its own contract read; none has been measured as contract-complete |
| Phase 7 (5 items) | 3 — Owner decision | Unchanged |
| `/org/memberships` | 3 — Owner decision | F-10 gate plus four further decisions; the repository still contains no authorization |
| K-1 · K-3 · K-4 · **K-7** | 5 — future infrastructure | K-7's evidence is unchanged: `src/lib/controller/modules/` holds three files and none imports another; rule 2's connector layer has no directory |
| Rolling retention · anon stitching | 5 | `user_active_days` and `anon_identity_map` absent; `06` §8C frames the first as a *performance* structure, so nothing is blocked on it |

**Class 1 is empty, and class 2 has no measured candidate.** The two tables with authoritative DDL that were still absent — `moderation_queue` and `moderation_actions` — are now live. What remains absent has **no DDL to implement**.

**The next genuinely unblocked work is Owner UAT**, on five surfaces that are all shipped and production-verified.

---

#### 🛑 Correction: Module 09 is NOT contract-complete (2026-08-21)

The row above first said class 2. **That was wrong**, and the error is worth recording rather than quietly editing away: the hub *is* settled — taxonomy §1 places Content Moderation in `tappy.hub.user`, already registered, and `12_RBAC` §3 gives its seven actions a full per-role matrix — so the classification was made before asking **what would feed the queue**.

Measured afterwards: **two report tables already exist and already receive real reports in production.**

| Table | Source | Reporter identity |
|---|---|---|
| `music_track_reports` | live route `POST /api/music/tracks/[id]/report` | `reporter_id UUID REFERENCES auth.users(id)` — raw id stored |
| `content_reports` | Content Safety Gate, `20260817` | 🔑 **`reporter_source_id TEXT` — opaque and non-reversible. The raw user id is deliberately absent** |

`content_reports` states its design in its own comments: *"a report set is a map of who reported whom"*, which is why a reporter cannot read back even their own report, and why the raw id is not stored at all.

`04` §4.4 defines the queue with **`reported_by UUID REFERENCES profiles(id)`** — the raw reporter id.

**So the two authoritative sources disagree about a privacy property, not about a schema detail.** Ingesting `content_reports` into `moderation_queue` either leaves `reported_by` permanently NULL — making the column a lie about what the queue holds — or re-attaches identity the gate was built to discard, which is not merely disallowed but **impossible**: the derivation is non-reversible.

Nothing here is derivable by measurement, and `00_Constitution` §8.2 makes a resolution of this kind a Design Change requiring an ADR — the same shape as the conflict Owner Decision A settled for ADR-023.

**The migration itself is not what is blocked.** §4.4 and §4.5 are verbatim and could be applied. What is blocked is what feeds the queue, and a moderation queue with nothing feeding it is not Module 09 — it is an empty table with a page in front of it.

**Minimum decision required — what does `reported_by` hold for a content-safety report?**

| | Choice | Consequence |
|---|---|---|
| **A** | Leave `reported_by` NULL for content-safety reports | Gate anonymity preserved absolutely. Moderators cannot tell two reporters apart, so repeated reports from one source look like corroboration — the exact failure `content_reports`' UNIQUE constraint exists to prevent |
| **B** | Carry `reporter_source_id` into `metadata`; `reported_by` stays NULL | Preserves the gate's design **and** restores the distinguish-without-identifying property it was built for. Strictly more useful than A at no privacy cost |
| **C** | Store raw reporter ids in the gate | Reverses a shipped, deliberate privacy design. Needs its own ADR; recorded for completeness, not recommended |

---

**Class 1 remains empty.** The route/page audit is unchanged from `df53496`: five page-less routes are sub-actions or utilities, `/security/sessions` is surfaced, and `/org/memberships` stays class 3 behind the F-10 gate — the repository contains no authorization that changes that.

**K-7 stays DEFERRED** on unchanged evidence: `src/lib/controller/modules/` holds two files that do not import each other, and rule 2's connector layer has no directory.

---

**Re-measured at `df53496`. Class 1 was empty then too**, and the check was run rather than assumed. Every admin API route was compared against the pages that exist:

| Route with no page | Verdict |
|---|---|
| `/security/sessions` · `…/force-logout` | ✅ now surfaced — the C11 panel on the user detail |
| `/deals/upload` · `/rbac/roles` | sub-actions of `/admin/deals` and `/admin/rbac`, which both have pages |
| `/home/snapshot` | feeds `/admin` Home |
| `/media/wif-check` | a diagnostic utility, not a module surface |
| `/org/memberships` | 🔴 **class 3.** FOUNDATION-10B sits behind the F-10 feature gate, whose activation *"remains a separate, explicit Owner authorization"*, plus four further Owner decisions — first department, first Head account, membership-authority ratification, activation. Building a surface for a feature that is off, and whose switch is an Owner decision, is not dependency-safe work. |

**K-5 (B14) and K-6 (B8) are both RESOLVED** — see the entries above. **Module 08 is complete end-to-end.** What remains is gated on one of three things, and nothing else: an unapplied **production migration** (B8's, and one per remaining Phase 8 module), an **Owner decision** that no authoritative source answers (Phase 7's five, Module 17's hub, Module 20's classification), or an **authenticated production session** this workstream does not hold (BL-002, E2E, final UAT).

**Schema reality, re-measured in-repo at `81bfa06`** — one line per table, and the only thing that moved is `daily_snapshots`:

| Table | Migration | Gates |
|---|---|---|
| `daily_snapshots` | ✅ `20260820_m01_daily_snapshots.sql`, **applied to production** | Module 01 ✅ · Module 04 growth + engagement ✅ |
| `cohort_metrics` | ✅ `20260820_m04_cohort_metrics.sql`, **applied to production** (DDL is `04` **§3.3**, not §7) | Module 04 **retention** ✅ |
| `user_active_days` | 🔴 absent | Rolling retention only. `04` §7A and `06` §8C name it as retention's source, but §8C itself frames it as a *performance* structure over facts `user_events` already holds — so bracket retention did **not** need it |
| `platform_settings` | 🔴 absent | Module 20 / configuration |
| `module_registry` | 🔴 absent | K-8 |
| `user_notes` | 🔴 absent | Module 08 notes (explicitly out of scope) |
| `moderation_queue` · `moderation_actions` | 🔴 absent | Module 09 moderation |
| `role_definitions` · `permission_grants` | 🔴 absent | **out of scope by Decision B15** |

`user_events`, `user_acquisition` and `subscriptions` all exist and are already migrated — which is why Module 04's funnel and the existing acquisition surface needed no schema work at all.

**Legacy is genuinely closed**, and that is a completion criterion rather than a convenience: `src/lib/admin.ts` does not exist, `BACKOFFICE_ENABLED` resolves through the Config Provider, `ADMIN_IDS` survives only as a notification-recipient list (Decision B4, closed as non-blocking), and all 8 `/admin` pages route through `requirePagePermission`. **No duplicate authorization path remains.**

---

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
