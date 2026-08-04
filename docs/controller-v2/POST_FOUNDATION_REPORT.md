# Post-Foundation Report — Controller V2 Components 1 & 2

**Date:** 2026-08-04 · **Status:** [ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK](STATUS.md)

---

## 1. Achievements

**Audit finding G1 is closed.** Before this work, `POST /api/admin/rbac/roles` required the caller to hold `super_admin` and then inserted whatever role the request body named — including `super_admin`. Any Super Admin could mint unlimited peers through the documented, intended API. No Platform Owner existed in the schema, the code or the environment.

Now:

- **The Owner is a constitutional principal, not a role.** `owner` was deliberately never added to the `admin_role` enum, so the dangerous operation is structurally unreachable rather than merely guarded — there is no code path from the RBAC API to `platform_owner` at all.
- **"Exactly one Owner" is a database invariant.** A partial unique index cannot race; an application count check can.
- **The constitutional rules live in the database.** `fn_grant_admin_role` / `fn_revoke_admin_role` are `SECURITY DEFINER` with pinned `search_path`, enforcing: only the Owner grants or revokes `super_admin`; nobody self-promotes; the last Super Admin cannot be removed; the Owner's own roles cannot be stripped.
- **Ownership is pinned in two independent places** — the `platform_owner` row and `PLATFORM_OWNER_USER_ID`. Neither a database compromise nor an environment compromise alone can transfer it.
- **Identity became a real security principal.** `Actor` carries all active roles rather than a single collapsed rank, plus a reserved `capabilities[]` so the interface will not change shape when the Capability Registry lands.
- **Owner Guard evaluates before RBAC**, pinned by two tests — a security property, not an implementation detail.

Delivered as **5 production source files (+327 / −57)**. Everything else was tests, migrations and documentation.

---

## 2. Production deployment summary

| | |
|---|---|
| Merge | `fb21ebe` — merge commit, history preserved (GitHub defaulted to *Squash*; changed deliberately) |
| Commits | 12 |
| Deployment | Ready |
| Migration applied | `20260803_platform_owner.sql` — 9/9 objects verified via PostgreSQL catalog |
| Owner | bootstrapped; UUID matches the sole active `super_admin`; idempotency proven on production |
| Env | `PLATFORM_OWNER_USER_ID` set for Production + Preview + Development |
| Deferred hardening | **not applied** — staged per ADR-017 |

Post-deploy verification: public surface **8/8 → 200**; admin APIs **6/6 → 401** unauthenticated; admin shell renders for the Owner; **Boot Assertion active and passing**; **Owner Guard resolves `isOwner = true`**; self-promotion blocked with `403`.

Deployment order held throughout: Step 1 → Step 2 → Step 3 → merge → deploy. Merging is the deploy on this repository, so the ordering was enforced at the merge button rather than by the runbook alone.

---

## 3. Assumptions eliminated

Every one of these was an *implicit* dependency that would have failed silently in production.

| # | Assumption | Resolution |
|---|---|---|
| A1 | `service_role` inherits `EXECUTE` from PostgreSQL's default `PUBLIC` grant | **Moved into the migration** as an explicit `GRANT`. Six other migrations in this repo already granted explicitly; this one silently departed from that convention |
| A4 | Supabase default privileges give `service_role` table access | **Moved into the migration.** Worse failure mode than A1: `owner.ts` reads `platform_owner` as a *table*, and a failed read degrades to "no owner" — which, with the env var set, returns **403 for the entire Controller** |
| A2 | PostgREST sees new functions immediately | **Documented in the runbook** with an explicit `NOTIFY pgrst, 'reload schema'`. `PGRST202` is not in the route's error map and would have surfaced as an unexplained 500 |
| A3 | `SECURITY DEFINER` functions are owned by `postgres` | Asserted via `prosecdef` in Step 2 verification |
| A5 | `gen_random_uuid()` is available | **Eliminated by evidence** — 24 migrations already use it and Phase 0 is live |
| A8 | The Owner has a `profiles` row | **Eliminated by evidence** — satisfied transitively through `admin_roles`' existing FK |
| F1 | `BACKOFFICE_ENABLED` is a kill switch | **False.** It feeds a displayed value in two files and gates no route. There is no `/admin` kill switch |
| F2 | CI verifies this work | **False.** Only `architecture-guard.yml` runs. `tsc`, lint, `vitest` and `build` are local-only measurements |

---

## 4. Major bugs discovered during review

Three defects, all in work that had already passed review.

**`min(uuid)` in the bootstrap seed — reached production.** `SELECT COUNT(*), MIN(user_id)` is invalid PostgreSQL; there is no `MIN()` aggregate for `uuid`. Runbook Step 3 failed on production with `42883`. Nothing was written — the `DO` block is atomic. Root cause: the seed had passed code review, `tsc`, lint, 535 unit tests, the architecture guard and the build, **none of which execute SQL**. It had never been run against any PostgreSQL before production.

**`resolveActor` was dead code, and Actor construction was duplicated.** The function was exported and documented as the Component 2 deliverable but had zero callers, while `requireAdminRole` built its own Actor inline — duplicating all seven field mappings. Two independent copies of a security principal's construction drift silently, and one of them was unreachable.

**`invalidatePrincipalCaches` was dead code.** Written for break-glass, but break-glass ends in a redeploy that clears in-memory caches anyway. No caller existed and none was coming.

The second and third were found by a pre-PR review of my own code and fixed before the PR opened.

---

## 5. Engineering lessons

**A `.sql` file is not verified until it has run against a real PostgreSQL.** Reading carefully is not a substitute for executing. `supabase/tests/platform_owner_bootstrap.test.ts` now runs a genuine PostgreSQL 17.5 and executes the actual `.sql` files from disk. Proven RED/GREEN: reverting the seed reproduced the exact production error.

**Confirm DDL by querying system catalogs, never by reading UI text.** A status-text scraper reported "Success" for a statement that never ran — it had read stale text left by the previous statement. `fn_revoke_admin_role` was missing for an hour while believed present. Every subsequent statement was confirmed against `pg_proc` / `pg_indexes` / `information_schema`.

**Verify what the tool is actually running.** `npx next start <worktree>` resolves the `next` binary from the *primary* worktree — 14.2.5 was serving a 14.2.35 build, producing spurious 500s that were nearly reported as defects.

**`git fetch` and diff against current `origin/main` immediately before merging.** The security branch was cut from `ab13f7f`; while it sat in review, Scam Shield landed. Merging as-is would have deleted 43 files from production — a security patch silently reverting a whole feature.

**Never report a security finding from a grep alone.** Two automated sweeps produced false positives: `grep -x` treats `[id]` path segments as a character class, and a narrow symbol list wrongly flagged endpoints that were in fact correctly protected.

**Re-read a form's own summary before saving it.** Vercel's environment dropdown *replaced* the selection when the option row was clicked rather than the checkbox, silently reducing three environments to one. Caught before saving.

---

## 6. Remaining validation task

**[BL-002 — G1 Production Validation](BACKLOG.md#bl-002--g1-production-validation)** — a Production Acceptance Task, not development work, and not a blocker for Component 3.

It requires an HTTP request made as a **non-Owner `super_admin`**. Production has exactly one `super_admin` — the Owner — so a second authenticated session must be created manually.

The rule is already enforced and verified at two layers: the database function raises `42501`, and `requireOwner()` has a named regression test. What is unproven is only the end-to-end HTTP path on live production.

---

## 7. Readiness for Component 3

**Ready.** Component 3 (RBAC) depends on Identity, which is complete and running in production. BL-002 validates already-deployed behaviour and does not gate it.

Component 3 inherits:

- `Actor` with `roles[]` populated — the input the Permission Engine needs to union permission bundles
- `resolveActor` as the single Actor construction site, with `resolveAdminRole` retained as a shim whose removal point is defined (end of Block A)
- A real-PostgreSQL test harness, so its migrations can be proven before they touch production
- A deployment runbook pattern with Purpose / Preconditions / Commands / Verification / Rollback / STOP per step

Known work it must absorb: dropping the dead `admin_permissions` table, and replacing the four-rung `ROLE_RANK` ladder that cannot express hub-scoped permissions.
