# Deployment Readiness — Controller V2 Components 1 & 2

**Branch:** `feat/controller-v2-foundation` · **HEAD:** `14ecd2c` · **Base:** `main` `7fa2c31`
**Date:** 2026-08-03 · **Scope:** deployment readiness only. No production code was written or modified.

---

## Task 1 — Pull Request preparation

`gh` CLI re-checked at the start of this task: **still unauthenticated** (`You are not logged into any GitHub hosts`). The PR cannot be opened from this machine. Everything a human needs to open it is prepared below.

**Open at:** https://github.com/huyphamsm-tappy/tappyai-mvp/pull/new/feat/controller-v2-foundation

### Title

```
feat(controller-v2): Platform Owner + Identity foundation (Phase 1, Components 1–2)
```

### Body

Use `docs/controller-v2/PR_COMPONENT_1_2.md` verbatim — everything below its horizontal rule. Verified complete against the required structure:

| Required section | Present |
|---|---|
| Executive Summary | ✅ |
| Problem Statement | ✅ |
| Architecture (Platform Owner, Identity, Actor, Owner Guard, RBAC boundary, why Owner is NOT a Role) | ✅ all six |
| Security (threat model, privilege escalation prevention, owner bootstrap, boot assertion, deferred hardening) | ✅ all five |
| Database (immediate vs deferred, why deferred must not run) | ✅ |
| Deployment (order, why merge must not precede SQL, rollback) | ✅ |
| Verification (TypeScript, lint, tests, architecture, build, runtime, regression, coverage) | ✅ all eight |
| Risks incl. R7 (cause, impact, mitigation, rollback) | ✅ |
| Breaking Changes | ✅ |
| Deployment Gate | ✅ |

### Metadata

| Field | Value | Rationale |
|---|---|---|
| **Base** | `main` | Branch Policy — `origin/main` is the Controller baseline |
| **Merge strategy** | Merge commit or rebase — **not squash** | Six commits tell a reviewable story: implementation → review conditions → backlog → blocker fixes → review docs → PR package. Squashing destroys the audit trail of what the review caught |
| **Labels** | `security`, `controller-v2`, `phase-1`, `needs-db-migration`, `do-not-merge-until-gated` | The last two are the important ones — they encode R7 on the PR itself, where the merge button is |
| **Reviewers** | Platform Owner (repository owner) | This PR defines who the Platform Owner is; no one else can approve that |
| **Assignee** | Platform Owner | Runbook Steps 1–3 are owner-executed SQL |
| **Milestone** | Controller V2 Foundation — Block A | |

If the label set does not exist in the repository, create at minimum **`do-not-merge-until-gated`**. It is the only mechanical defence against R7 living on the PR itself.

### Linked documentation (all on the branch)

| Document | Purpose |
|---|---|
| `docs/controller-v2/PR_COMPONENT_1_2.md` | PR body |
| `docs/controller-v2/runbooks/COMPONENT_1_DEPLOYMENT.md` | Deployment runbook + break-glass |
| `docs/controller-v2/RELEASE_READINESS_COMPONENT_1_2.md` | Code review + release verdict |
| `docs/controller-v2/DEPLOYMENT_READINESS_COMPONENT_1_2.md` | This document |
| `docs/architecture/ADR-017-service-role-hardening-strategy.md` | Why the `REVOKE` is deferred |
| `docs/controller-v2/03_PHASE1_FOUNDATION_DESIGN.md` | Approved design |
| `docs/controller-v2/BACKLOG.md` | BL-001 (ADR cleanup, gated on Foundation completion) |

**No source code was modified in this task.** The only change is documentation: two verification queries added to runbook Step 2 (§4 A1/A2 below).

---

## Task 2 — Remaining blockers M1–M6

### M1 — Pull Request not open

| | |
|---|---|
| **Status** | BLOCKED. `gh` unauthenticated; no PR exists for the branch |
| **Owner** | Repository owner |
| **Action** | Open the PR at the URL above with the title, body, labels and reviewers in Task 1. Optionally `gh auth login` once to remove this blocker permanently |
| **Expected output** | A PR against `main` from `feat/controller-v2-foundation`, 6 commits, 17 files, +1795/−57 |
| **Verification** | PR page shows base `main`, head `feat/controller-v2-foundation`, "Able to merge" with no conflicts |
| **Rollback** | Close the PR. The branch is untouched |

### M2 — PR not reviewed or approved

| | |
|---|---|
| **Status** | BLOCKED, depends on M1 |
| **Owner** | Platform Owner |
| **Action** | Review the diff — 5 production source files (+327/−57) carry all behaviour; the rest is migrations, tests, docs |
| **Expected output** | Approving review |
| **Verification** | GitHub shows "Approved" |
| **Rollback** | Request changes; nothing has been deployed |

### M3 — Runbook Step 1 not executed *(the critical one)*

| | |
|---|---|
| **Status** | BLOCKED. **The exactly-one-active-`super_admin` precondition is UNVERIFIED.** I have no database credentials |
| **Owner** | Platform Owner (Supabase SQL editor) |
| **Action** | Run runbook Step 1, queries Q1–Q5. Read-only |
| **Expected output** | Q1 = **1** · Q2 all NULL · Q3 zero rows · Q4 all non-NULL · Q5 recorded as the rollback baseline |
| **Verification** | Paste the five outputs into the PR thread as the evidence record |
| **Rollback** | None required — read-only |
| **STOP** | **Q1 ≠ 1 → HARD STOP.** Do not run the bootstrap. The Owner must then be assigned deliberately, and this PR's bootstrap seed must not be used |

### M4 — Runbook Step 2 not applied

| | |
|---|---|
| **Status** | BLOCKED, depends on M3 |
| **Owner** | Platform Owner |
| **Action** | Apply `supabase/migrations/20260803_platform_owner.sql` as one batch, then run **both** verification blocks (the six-assertion query **and** the new A1/A2 callability checks) |
| **Expected output** | Six assertions `true`; A1 shows `service_role_can_execute = true` for all three functions; `NOTIFY pgrst, 'reload schema'` issued |
| **Verification** | Query outputs pasted into the PR thread |
| **Rollback** | `DROP FUNCTION` ×3 + `DROP TABLE platform_owner` — safe, nothing deployed references them |
| **STOP** | Any assertion false, or A1 false without remediation → stop and roll back |

### M5 — Runbook Step 3 not applied

| | |
|---|---|
| **Status** | BLOCKED, depends on M4 |
| **Owner** | Platform Owner |
| **Action** | Run `supabase/seed/platform_owner_bootstrap.sql`; read the resulting UUID; set `PLATFORM_OWNER_USER_ID` in Vercel for **Production + Preview + Development** |
| **Expected output** | `NOTICE: Platform Owner assigned: <uuid>`; exactly one active row; `fn_is_platform_owner(<uuid>)` = true; env var set to that exact UUID |
| **Verification** | Both SQL assertions, plus a screenshot or confirmation of the Vercel value |
| **Rollback** | `UPDATE platform_owner SET active=false, revoked_at=NOW() WHERE active=true;` and unset the env var |
| **STOP** | Script raises `BOOTSTRAP ABORTED` → production has ≠ 1 active `super_admin` → do not force it |

### M6 — Deployment Gate not signed off

| | |
|---|---|
| **Status** | BLOCKED, depends on M1–M5 |
| **Owner** | Platform Owner |
| **Action** | Complete every box of the Final Merge Checklist (Task 5) |
| **Expected output** | All pre-merge boxes ticked, evidence in the PR thread |
| **Verification** | The checklist itself |
| **Rollback** | n/a — this is the gate, not an action |

---

## Task 3 — Validated deployment sequence

```
M1  Open PR
     ↓
M2  PR Approved                          ← human gate
     ↓
M3  Runbook Step 1   read-only verify    ← HARD STOP if Q1 ≠ 1
     ↓
M4  Runbook Step 2   schema migration    ← incl. A1 EXECUTE + A2 schema-cache reload
     ↓
M5  Runbook Step 3   bootstrap + env     ← PLATFORM_OWNER_USER_ID set in all 3 envs
     ↓
M6  Deployment Gate  all boxes ticked
     ↓
    MERGE                                ← this IS the deploy trigger
     ↓
    Automatic Production Deploy (Vercel builds main)
     ↓
    Runbook Step 4   post-deploy verification (8 checks, incl. G1 regression)
     ↓
    Release Complete
```

### Hidden ordering dependencies — checked

| Dependency | Verdict |
|---|---|
| Step 2 before Step 3 | **Real.** The bootstrap inserts into `platform_owner`, which Step 2 creates. Enforced by the seed failing loudly on a missing table |
| Step 3 before merge | **Real.** Deploying with no Owner row makes `isOwner` false for everyone, so nobody — including the founder — can grant `super_admin`. Lower roles still work |
| Step 2 before merge | **Real and the most severe.** `fn_grant_admin_role` undefined → PostgREST `42883`/`PGRST202` → unmapped → **HTTP 500 on every role grant** |
| Env var before deploy | **Real but self-correcting.** Vercel env changes take effect on the *next* deploy. Setting it in Step 3 means the Step-4 deploy picks it up. Setting it *after* the deploy requires a redeploy to take effect |
| A2 PostgREST cache reload before first RPC call | **Real, newly documented.** Mitigated by the explicit `NOTIFY` in Step 2 and by the natural gap between Step 2 and merge |
| Step 4 before the deferred hardening | **Real.** ADR-017 gates the `REVOKE` on the whole Foundation, far beyond this deployment |
| Owner's `profiles` row must exist | **Satisfied transitively.** `admin_roles.user_id` already FKs to `profiles`, so an existing `super_admin` row proves the profile exists |

**No circular dependencies.** Every arrow is strictly forward, and every backward step has a rollback that does not require undoing a later one.

---

## Task 4 — Production prerequisites

### Must already exist before merge

| # | Prerequisite | Source | How to verify |
|---|---|---|---|
| P1 | `profiles` table | pre-existing | Step 1 Q4 |
| P2 | `admin_roles` table | Phase 0 (`20260713_backoffice_phase0.sql`, applied) | Step 1 Q4 |
| P3 | `admin_role` enum type | Phase 0 | Step 1 Q4 |
| P4 | **Exactly one active `super_admin`** | production data | **Step 1 Q1 — HARD STOP if ≠ 1** |
| P5 | `platform_owner` table | Step 2 | Step 2 assertion 1 |
| P6 | `uq_platform_owner_single_active` index | Step 2 | Step 2 assertion 3 |
| P7 | RPC `fn_is_platform_owner` | Step 2 | Step 2 assertion 6 |
| P8 | RPC `fn_grant_admin_role` (`prosecdef = true`) | Step 2 | Step 2 assertion 4 |
| P9 | RPC `fn_revoke_admin_role` (`prosecdef = true`) | Step 2 | Step 2 assertion 5 |
| P10 | Exactly one active Platform Owner row | Step 3 | Step 3 assertion 1 |
| P11 | `PLATFORM_OWNER_USER_ID` set in Production + Preview + Development, matching P10 | Step 3 | Vercel dashboard |
| P12 | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | pre-existing | already in use by every admin route |
| P13 | `NEXT_PUBLIC_SITE_URL` = `https://www.tappyai.com` | pre-existing | same-origin guard depends on it; unchanged by this PR |
| P14 | Deferred hardening **NOT** applied — `service_role` still holds INSERT/UPDATE/DELETE on `admin_roles` | must remain true | Step 1 Q5 |

### Assumptions that were undocumented — now documented

Both were found during this task. Both produce the **same 500 symptom as R7** and would have been diagnosed as a code defect.

#### A1 — `service_role` EXECUTE privilege is implicit, not granted

`20260803_platform_owner.sql` contains **no `GRANT EXECUTE`**. It relies on PostgreSQL's default of granting `EXECUTE` to `PUBLIC` on newly created functions.

That default holds in stock PostgreSQL and Supabase, so this will work — but it is an implicit dependency, and **six existing migrations in this repository grant `EXECUTE` explicitly** (`20260706_add_music_saved_and_type.sql`, `20260706b_add_music_count_fns.sql`, `20260711_anon_chat_usage.sql`, `20260711_music_ugc_combined.sql`, `20260724_partner_deals_hardening.sql`, `add_counter_security_definer.sql`). So this migration silently departs from the repository's own convention.

If `PUBLIC` execute is ever revoked as a hardening step, every role grant returns 500 with no obvious cause.

**Handled by:** an explicit verification query added to runbook Step 2, with the remediating `GRANT` inline as a STOP-condition fix.
**Recommendation (owner decision, one line, not applied):** add the explicit `GRANT EXECUTE ... TO service_role` to the migration to match repository convention and remove the implicit dependency. I did not make this change because this task forbids modifying code.

#### A2 — PostgREST schema cache must contain the new functions

`supabase.rpc()` calls go through PostgREST, which serves from a cached schema. Newly created functions can return `PGRST202` ("Could not find the function … in the schema cache") until it reloads. Supabase reloads automatically on DDL, but not instantaneously.

`PGRST202` is **not** in the route's error mapping (which handles `23505`, `42501`, `P0002`, `23514`), so it falls through to the generic handler → **HTTP 500**.

There is precedent for this class of failure in this repository: `src/app/api/sound/[trackId]/route.ts` wraps two `.rpc()` calls in `try/catch` with a `/* pre-migration */` comment.

**Handled by:** `NOTIFY pgrst, 'reload schema';` added to runbook Step 2, plus the natural gap between Step 2 and the merge.

#### A3 — `SECURITY DEFINER` functions execute as their owner

Applied through the Supabase SQL editor, the functions are owned by `postgres`, which holds the rights on `admin_roles` that the guards require. If they were ever applied by a lower-privileged role, the guards would fail at call time rather than at creation.

**Handled by:** Step 2 asserts `prosecdef = true`; Step 4's live grant tests would surface an ownership problem immediately.

---

## Task 5 — Final Merge Checklist

Operator-executable. Do not tick from memory — paste evidence into the PR thread.

### Pre-merge

| # | Item | Purpose | Action | Verification | STOP | Rollback |
|---|---|---|---|---|---|---|
| 1 | PR opened | Make the change reviewable | Open with the Task 1 title/body/labels | PR page shows "Able to merge", 6 commits | Conflicts shown → rebase | Close PR |
| 2 | Label `do-not-merge-until-gated` applied | Encode R7 at the merge button | Add the label | Label visible | — | Remove label |
| 3 | PR approved | Human review | Owner reviews | "Approved" on GitHub | Changes requested → fix first | — |
| 4 | CI/local gates green | Prove the build is sound | tsc, lint, tests, architecture, build | 535/60 tests, 0 lint errors, 7/7, build exit 0 | Any failure → STOP | — |
| 5 | Runbook read end to end | Operator knows every step | Read `COMPONENT_1_DEPLOYMENT.md` | Operator confirms | — | — |
| 6 | **Step 1 Q1: exactly one active `super_admin`** | The bootstrap derives the Owner from it | Run Q1 | Output = **1** | **≠ 1 → HARD STOP** | n/a (read-only) |
| 7 | Step 1 Q2: not already applied | Avoid partial state | Run Q2 | All NULL | Any non-NULL → STOP | n/a |
| 8 | Step 1 Q3: no function-name collision | `CREATE OR REPLACE` would overwrite silently | Run Q3 | Zero rows | Rows → STOP | n/a |
| 9 | Step 1 Q4: Phase 0 objects exist | Migration depends on them | Run Q4 | All non-NULL | Any NULL → STOP | n/a |
| 10 | Step 1 Q5: privilege baseline recorded | Needed for rollback and P14 | Run Q5 | INSERT/UPDATE/DELETE present | Absent → deferred hardening already applied → STOP | n/a |
| 11 | Step 2 applied | Create Owner principal + guards | Paste migration as one batch | "Success" | Error → STOP | `DROP FUNCTION` ×3 + `DROP TABLE` |
| 12 | Step 2: six assertions true | Prove objects exist and are `SECURITY DEFINER` | Run the verification query | All six `true` | Any false → STOP + rollback | as #11 |
| 13 | **Step 2 A1: `service_role` can EXECUTE** | Implicit privilege made explicit | Run the A1 query | `true` ×3 | false → apply the inline `GRANT`, re-verify | as #11 |
| 14 | Step 2 A2: schema cache reloaded | Avoid `PGRST202` → 500 | `NOTIFY pgrst, 'reload schema';` | Command succeeds | — | harmless to repeat |
| 15 | Step 3 bootstrap run | Assign the one Owner | Run the seed | `NOTICE: Platform Owner assigned: <uuid>` | `BOOTSTRAP ABORTED` → STOP | `UPDATE … active=false` |
| 16 | Step 3: exactly one active owner row | The invariant holds | `SELECT COUNT(*) … active=true` | = 1 | ≠ 1 → STOP + rollback | as #15 |
| 17 | `PLATFORM_OWNER_USER_ID` set in all 3 envs | Boot assertion needs both halves | Set in Vercel | Value == #16's uuid | Mismatch → fix before merge | Unset |
| 18 | P14: deferred hardening NOT applied | It is gated on the whole Foundation | Confirm from #10 | INSERT/UPDATE/DELETE still present | Absent → STOP | `GRANT … TO service_role` |
| 19 | Rollback understood for steps 2, 3, post-deploy | Operator can undo safely | Read the rollback blocks | Operator confirms | — | — |
| 20 | Merge approved | Final human gate | Owner confirms | Label #2 removed | — | — |

### Merge and deploy

| # | Item | Purpose | Action | Verification | STOP | Rollback |
|---|---|---|---|---|---|---|
| 21 | Remove `do-not-merge-until-gated` | Gate is satisfied | Remove label | Gone | Items 1–20 not all ticked → do not remove | Re-add |
| 22 | Merge | Ship it — this triggers the deploy | Merge on GitHub | `main` advances | — | Revert the merge commit |
| 23 | Deploy completes | Code live | Watch Vercel | Build success | Build fails → revert | Revert + redeploy |

### Post-deploy — runbook Step 4

| # | Item | Purpose | Verification | STOP | Rollback |
|---|---|---|---|---|---|
| 24 | `/admin` loads for the Owner | Owner Gate passes when configured correctly | 200, shell renders | 403 `ownership assertion failed` → env var wrong; fix + redeploy, no DB action | Revert merge |
| 25 | `/admin` unchanged for a non-owner admin | No regression | Loads as before | Regression → revert | Revert merge |
| 26 | Owner grants `analyst` to a test user | RPC path works end to end | 200 | 500 → A1/A2 or Step 2 incomplete | Revert merge |
| 27 | **Non-owner `super_admin` grants `super_admin` → 403** | **The G1 regression check — the point of this PR** | 403 | Succeeds → **G1 not closed, revert immediately** | Revert merge |
| 28 | Self-grant → 403 | Constitutional rule | 403 | Succeeds → revert | Revert merge |
| 29 | Revoke the last `super_admin` → 409 | Lockout guard preserved | 409 | Succeeds → revert | Revert merge |
| 30 | `audit_log` has `owner.super_admin_granted` | Privilege changes are attributable | Row present | Absent → investigate; not necessarily a revert | — |
| 31 | Product routes 200 | Component 1 must not touch them | `/`, `/reviews`, `/scam-shield` all 200 | Any failure → revert | Revert merge |

**Post-deploy rollback is uniform:** revert the merge commit and redeploy. **No database action is required** — the previous code has no Owner Guard and never reads `platform_owner`, so the schema and env var are inert to it.

---

## Task 6 — Final readiness decision

Code, tests, migrations, rollback coverage, runbook completeness and architecture conformance are all complete and verified. Two previously undocumented assumptions (A1, A2) were found during this task and are now documented with verification steps and remediation.

# NOT READY

## Remaining operational blockers

| # | Blocker | Why it blocks |
|---|---|---|
| **M1** | PR is not open — `gh` unauthenticated | Nothing to approve or merge |
| **M2** | PR not approved | Human gate |
| **M3** | Runbook Step 1 not executed — **the exactly-one-active-`super_admin` precondition remains UNVERIFIED** | Bootstrap derives the Owner from it; I have no database credentials |
| **M4** | Runbook Step 2 not applied — `platform_owner` and the three RPC functions do not exist in production | Merging first → HTTP 500 on every role grant (R7) |
| **M5** | Runbook Step 3 not applied — no Owner row, `PLATFORM_OWNER_USER_ID` not set | Merging first → nobody can grant `super_admin`, including the founder |
| **M6** | Deployment Gate not signed off | Checklist items 1–20 unticked |

**No code defects remain.** Every blocker is an owner-executed operational step. Once M1–M6 are complete, this becomes **READY FOR MERGE** with zero code change.
