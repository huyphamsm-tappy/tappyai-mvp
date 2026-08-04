# Release Readiness Report — Controller V2 Components 1 & 2

**Branch:** `feat/controller-v2-foundation` · **Head:** `17cd62c` · **Base:** `main` `7fa2c31` (clean fast-forward)
**Date:** 2026-08-03 · **Scope:** Platform Owner + Identity
**Reviewer note:** this review found and fixed two blockers in my own code before reaching a verdict. Both are recorded in §2.

---

## 1. Diff hygiene review

| Criterion | Result | Evidence |
|---|---|---|
| No dead code | ✅ **after fix** | Two dead exports found and removed — see §2 |
| No temporary code | ✅ | No scaffolding, stubs or placeholders |
| No TODO / FIXME / XXX / HACK | ✅ | grep over the added lines: 0 hits |
| No duplicated logic | ✅ **after fix** | Duplicated Actor construction found and collapsed — see §2 |
| No accidental refactors | ✅ | `getRequestUser`, `roles.ts`, `page-guard.ts`, `layout.tsx`, `audit.ts` untouched |
| No unrelated file changes | ✅ | All 17 files under `docs/`, `supabase/`, `src/lib/admin/`, `src/app/api/admin/rbac/` |
| No debug code | ✅ | No `debugger`, no `.only`/`.skip`. Two `console.*` calls remain — both are operational logging on failure paths (`[controller][owner]`), matching the existing `[admin][rbac]` convention |
| No formatting-only churn | ✅ | The two modified routes changed 50 lines; every hunk is behavioural (RPC swap, guards, audit action) |

---

## 2. Blockers found during this review — both FIXED (`17cd62c`)

### B1 — `resolveActor` was dead code, and Actor construction was duplicated

`resolveActor()` was exported and documented as the Component 2 deliverable but had **zero callers**. `requireAdminRole` built its own Actor inline, duplicating all seven field mappings including the cookie/bearer `source` derivation.

Two independent copies of a *security principal's* construction is a genuine hazard: they drift, and the drift is silent. One of them was also unreachable.

**Fix:** `requireAdminRole` now delegates to `resolveActor`, which is the single construction site. `resolveActor` returns `{ user, actor }` so `AdminContext` can still expose the Supabase `User`.

### B2 — `invalidatePrincipalCaches` was dead code

Added for "break-glass/bootstrap", but break-glass is a manual DB + env procedure that ends in a redeploy, which clears in-memory caches anyway. No caller existed and none was coming. Deleted, with its now-unused `invalidateOwnerCache` import.

### Coverage added as part of the fix

`src/lib/admin/rbac.test.ts` (13 tests). This path had **no direct tests at all** — the route tests mock `requireAdminRole` wholesale — so the refactor would otherwise have been unverified.

---

## 3. Runbook verification

`docs/controller-v2/runbooks/COMPONENT_1_DEPLOYMENT.md`

| Step | Preconditions | Execution | Verification | Rollback | STOP |
|---|---|---|---|---|---|
| 1 — Read-only verification | ✅ | ✅ Q1–Q5 | ✅ decision table | n/a (read-only) | ✅ 4 conditions |
| 2 — Schema migration | ✅ | ✅ | ✅ 6 assertions | ✅ | ✅ 3 conditions |
| 3 — Bootstrap | ✅ | ✅ | ✅ 2 assertions | ✅ | ✅ 3 conditions |
| 4 — Deploy | ✅ | ✅ | ✅ 8 checks | ✅ | ✅ 3 conditions |
| 5 — Hardening | explicitly DEFERRED, gate in ADR-017 §5 | — | — | — | — |
| Break-glass | ✅ | ✅ 6 steps | ✅ 3 assertions | ✅ | ✅ |

**Two gaps were found and closed during this review:**

- **Step 4 had no rollback.** Now specified: revert the merge commit and redeploy, with **no database action required** — the previous code has no owner gate and never reads `platform_owner`, so the table and env var are inert to it. Leaving them in place is the *lower-risk* rollback.
- **Steps 2–4 lacked explicit Preconditions and STOP sections**, and Step 2 referenced a "step 5" that no longer exists. Restructured; every step now carries all five parts.

Added Q4 to Step 1 (verifies the `admin_role` enum, `admin_roles` and `profiles` exist) — the migration depends on all three and would fail confusingly without them.

---

## 4. Migration review

| Check | Result |
|---|---|
| Idempotent | ✅ All 7 statements are `IF NOT EXISTS` or `CREATE OR REPLACE` |
| No destructive SQL | ✅ No `DROP` / `REVOKE` / `TRUNCATE` / `ALTER ... DROP`. The only `DELETE FROM admin_roles` is inside `fn_revoke_admin_role` — that is the function's purpose, not DDL |
| Deferred migration not applied | ✅ `FOUNDATION_END_service_role_hardening.sql` exists **only** under `supabase/migrations/deferred/`; confirmed absent from the migrations root |
| Deferred migration unreachable by bulk apply | ✅ Outside the normal path, with `deferred/README.md` stating the rule |
| Ordering correct | ✅ Schema → bootstrap → deploy. Steps 2–3 are inert to deployed code, so no inconsistent window |
| No production-breaking SQL | ✅ Purely additive: 1 table, 2 indexes, 3 functions, RLS enable. No existing object modified |
| Bootstrap guarded | ✅ Aborts unless exactly 1 active `super_admin`; derives the UUID, never hardcodes; idempotent |

**Note on `CREATE OR REPLACE FUNCTION`:** if a same-named function already existed with a different return type, this would fail rather than silently overwrite. Runbook Step 1 Q3 checks for exactly that collision before applying.

---

## 5. Architecture audit vs approved design

| Requirement | Status | Evidence |
|---|---|---|
| Platform Owner is a Principal, not a Role | ✅ | `admin_role` enum remains `('super_admin','admin','moderator','analyst')` — no `owner` value anywhere in schema or code |
| Owner is outside RBAC | ✅ | `isOwner` is resolved solely via `isPlatformOwner` → `platform_owner`. The `admin_roles` query in `resolvePrincipal` feeds only `roles[]` |
| Owner Guard executes before RBAC | ✅ | `requireAdminRole`: identity → `checkOwnerGate` → role check. Pinned by two tests, incl. one that fails the gate for a user who would *also* fail the role check and asserts the gate's error surfaces |
| `Actor` contains `roles[]` and `capabilities[]` | ✅ | Both present; `roles` returns **all** active grants, not just the highest |
| No production behaviour changed | ✅ **with one intended exception** | Product routes untouched and verified 200. The intended change: a non-Owner `super_admin` can no longer grant `super_admin` — that is the entire purpose of G1 |
| No regression introduced | ✅ | 535/535 tests; all 6 admin endpoints still 401 unauthenticated; `/admin` still redirects to `/login` with no shell rendered |

---

## 6. Verification summary

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **535 passed / 60 files** (+35 vs base) |
| `npm run lint` | 0 errors |
| `npm run architecture:check` | 7/7 |
| `npm run build` | exit 0, 121/121 static pages |
| Runtime — admin authz | 6/6 endpoints `401` unauthenticated |
| Runtime — product surface | 8/8 routes `200` |
| Runtime — `/admin` unauthenticated | → `/login?redirect=/admin`, `.admin-theme` absent (browser-confirmed) |

**Known verification limit:** the *enforced* path of the owner gate is unit-tested but not runtime-verified — it requires an authenticated admin session, unavailable locally. Covered by runbook Step 4.

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Bootstrap run when production has ≠ 1 active `super_admin` | High | Script aborts itself; Step 1 Q1 is a pre-flight STOP gate |
| R2 | `PLATFORM_OWNER_USER_ID` misconfigured | Medium | Fails closed and loudly; product routes unaffected; fix is env + redeploy |
| R3 | Service-role retains direct `admin_roles` write until deferred hardening | Medium | ADR-017 §4; both routes use RPCs; smaller than the pre-existing exposure |
| R4 | Owner account lost | High | Break-glass runbook — DB **and** env, maintenance mode first, fully audited |
| R5 | Enforced gate path not runtime-verified pre-merge | Low | Runbook Step 4; fails visibly |
| **R7** | **Merging before the DB steps breaks ALL role granting** | **High — see §8** | Merge precondition below |

### R7 in detail (found during this review)

Merging the PR **is** the deploy. If the code ships before Step 2:

- `fn_grant_admin_role` does not exist → the RPC returns `42883`, which is not mapped to 409/403 → falls through to the generic handler → **`500` on every role grant, not just `super_admin`**.
- Everything else degrades gracefully: `owner.ts` catches the missing table and treats it as "no owner", so `/admin`, analytics, audit, deals and the product surface are unaffected.

This is not a code defect — it is a deployment-order dependency the runbook already specifies. But because *merge = deploy* on this repository, the ordering has to be enforced at the merge button, not only in the runbook. Hence the precondition in §8.

---

## 8. Merge preconditions (must ALL hold before merging)

1. **Runbook Step 1 executed** and Q1 returned **exactly 1** active `super_admin`.
2. **Runbook Step 2 applied** — `platform_owner`, both indexes and all three functions present, with `prosecdef = true` on the grant/revoke functions.
3. **Runbook Step 3 applied** — exactly one active owner row, and `PLATFORM_OWNER_USER_ID` set in Vercel to that UUID.
4. PR reviewed and approved.

Merging with 1–3 incomplete will produce R7.

---

## 9. Conclusion

Code quality, test coverage, migration safety, rollback coverage and architectural conformance are all satisfied. The two blockers this review found were in my own code and are fixed and verified. The runbook's two gaps are closed.

The branch is not ready to *merge* yet — not because of the code, but because merging triggers the production deploy and the three owner-executed database steps have not run. The PR itself has not been opened (`gh` CLI is unauthenticated on this machine).

# READY FOR PR

**Next actions, in order:**

1. Owner opens the PR — body prepared at `docs/controller-v2/PR_COMPONENT_1_2.md` → https://github.com/huyphamsm-tappy/tappyai-mvp/pull/new/feat/controller-v2-foundation
2. Review and approve.
3. Execute runbook Steps 1 → 2 → 3 (owner-run SQL; **hard STOP if Step 1 Q1 ≠ 1**).
4. Only then merge, which performs Step 4.
5. Run the Step 4 post-deploy verification table — including the G1 regression check and the owner-gate enforced path.
