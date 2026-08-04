# Release Readiness Report — Component 3 (RBAC)

**Review type:** formal Component 3 review, Engineering Constitution V1
**Branch:** `feat/controller-v2-component3-rbac` · **Branch point:** `35233a4`
**Registry version:** `2026-08-04.2` · **Date:** 2026-08-04

# ✅ VERDICT: READY FOR PR

⛔ Not READY FOR MERGE — see §7. The two remaining blockers are Owner actions,
not code. Nothing has been merged, deployed, or applied to production. No SQL was
executed.

---

## 1. What the review changed

The pre-review report said **"0 known code defects."** That was wrong. A first-
principles audit found **9 issues, one of them a blocker**, in code that had
already passed 613 tests, tsc, lint, architecture and build.

| # | Finding | Severity | Status |
|---|---|---|---|
| R-1 | **Infinite redirect loop** on Owner Gate failure | **blocker** | fixed, RED/GREEN |
| R-2 | Role→permission map **mutable at runtime**; comment claimed otherwise | security | fixed |
| R-3 | `Resolver.roleMap` — no consumer, published the authorization structure | dead code | removed |
| R-4 | `requireAllPermissions` — no caller | dead code | removed |
| R-5 | **`guards.ts` had zero tests** — the enforcement layer was untested | missing tests | 12 tests added |
| R-6 | `index.ts` / `guards.ts` described a migration that was already complete, and cited a deleted function | doc | fixed |
| R-7 | **Registry lied about what it protected** — content page gated on an auth permission | registry | new permission added |
| R-8 | **Two Actor construction sites** — the Component 2 defect reintroduced | duplication | fixed |
| R-9 | `invalidateRoleCache → permissionCache` had **no assertion** behind it | missing tests | 7 tests added, RED/GREEN |

### R-1 in full — the blocker

`requirePagePermission` redirected to `/admin` when the Owner Gate failed. That
was safe while `/admin` had no guard of its own. Component 3's own permission
audit then **gave `/admin` a guard** — converting the fallback into a
self-redirect:

```
/admin → gate fails → redirect('/admin') → gate fails → redirect('/admin') → …
```

`ERR_TOO_MANY_REDIRECTS`, in precisely the scenario — a misconfigured
`PLATFORM_OWNER_USER_ID` — where the Controller most needs to fail
diagnosably. Before Component 3 the same misconfiguration degraded to a blank
dashboard: recoverable. This was a **regression introduced by the fix to an
earlier finding**.

Fixed by separating the failure modes: a Controller outage exits the Controller
(`/reviews`, not caller-overridable); a permission denial returns to `/admin`,
except on `/admin` itself, which passes its own `deniedRedirect`.

**Proof:** restoring the old targets fails exactly the three regression tests in
`guards.test.ts`; the fix returns 12/12.

### Why it survived self-review

`engine.test.ts` proved the Policy Decision Point *decides* correctly. It could
never have caught R-1, because the loop lives entirely in what the guard *does*
with a decision. **613 green tests coexisted with an infinite redirect loop.**
That is the finding behind R-5, and the reason the enforcement layer now has its
own suite.

## 2. Quality gates

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ exit 0, no output |
| Tests | `npx vitest run` | ✅ **65 files / 634 tests passed**, 0 failed |
| Architecture | `npm run architecture:check` | ✅ 7/7 rules |
| Lint | `npx next lint --dir src` | ✅ **0 errors**; pre-existing warnings only, none in `permissions/` |
| Build | `npx next build` | ✅ compiled; **all 8 `/admin` routes `ƒ` dynamic** |

Test trajectory: 592 (branch point) → 613 (pre-review) → **634** (post-review).
`permissions/` holds 88 of them.

## 3. Permission decision point matrix — all 20 verified

Generated from the built registry and the old `ROLE_RANK` ladder, not written by
hand. **AN**=analyst **MO**=moderator **AD**=admin **SA**=super_admin.

| Route | Permission | Allowed Roles | Previous Roles | Compatible? |
|---|---|---|---|---|
| `GET /api/admin/analytics/activation` | `analytics.activation.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ YES |
| `GET /api/admin/analytics/auth` | `analytics.auth.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ YES |
| `GET /api/admin/audit` | `audit.log.read` | AD+SA | AD+SA | ✅ YES |
| `GET /api/admin/settings` | `settings.config.read` | AD+SA | AD+SA | ✅ YES |
| `GET /api/admin/deals` | `commerce.deals.read` | AD+SA | AD+SA | ✅ YES |
| `POST /api/admin/deals` | `commerce.deals.create` | AD+SA | AD+SA | ✅ YES |
| `PATCH /api/admin/deals/[id]` | `commerce.deals.update` | AD+SA | AD+SA | ✅ YES |
| `DELETE /api/admin/deals/[id]` | `commerce.deals.delete` | AD+SA | AD+SA | ✅ YES |
| `POST /api/admin/deals/upload` | `commerce.deals.upload_media` | AD+SA | AD+SA | ✅ YES |
| `GET /api/admin/rbac/roles` | `security.roles.read` | SA | SA | ✅ YES |
| `POST /api/admin/rbac/roles` | `security.roles.grant` **+Owner Guard** | SA | SA | ✅ YES |
| `DELETE /api/admin/rbac/roles/[id]` | `security.roles.revoke` **+Owner Guard** | SA | SA | ✅ YES |
| `PAGE /admin` | `dashboard.home.view` | AN+MO+AD+SA | any admin | ✅ YES |
| `PAGE /admin/analytics` | `analytics.content.read` | AN+MO+AD+SA | any admin | ✅ YES |
| `PAGE /admin/analytics/auth` | `analytics.auth.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ YES |
| `PAGE /admin/analytics/activation` | `analytics.activation.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ YES |
| `PAGE /admin/audit` | `audit.log.read` | AD+SA | AD+SA | ✅ YES |
| `PAGE /admin/deals` | `commerce.deals.read` | AD+SA | AD+SA | ✅ YES |
| `PAGE /admin/rbac` | `security.roles.read` | SA | SA | ✅ YES |
| `PAGE /admin/settings` | `settings.config.read` | AD+SA | AD+SA | ✅ YES |

**20/20 compatible.** This is asserted permanently by `migration.test.ts`, so a
future silent drift fails the build rather than reaching production.

Also verified byte-identical to `35233a4`: `rateLimit` and `isSameOrigin` call
counts per handler. No request-hardening was lost in the migration.

## 4. Cache path review

| Path | Mechanism | Verified by |
|---|---|---|
| **Population** | First `resolve()` computes the union and stores it keyed on `(userId, roleSet, registryVersion)` | `invalidation.test.ts` |
| **Invalidation** | `invalidateRoleCache(userId)` clears principal **and** permission cache | `invalidation.test.ts`, RED/GREEN |
| **Permission updates** | `REGISTRY_VERSION` bump invalidates every entry implicitly | `engine.test.ts` |
| **Multi-role updates** | Dropping one of two roles changes the role key ⇒ miss ⇒ recompute | `invalidation.test.ts` |
| **Revoke flow** | `DELETE /api/admin/rbac/roles/[id]` → `invalidateRoleCache(existing.user_id)` | route test asserts the **target** id |
| **Grant flow** | `POST /api/admin/rbac/roles` → `invalidateRoleCache(input.user_id)` | route test asserts the **target** id |

### Stale privilege escalation — attempted and not found

The adversarial case: **revoke a role and never call `invalidate()`.** The
cached entry remembers the role set it was computed from, so a narrower set
cannot match it — the lookup misses and recomputes. Asserted directly in
`invalidation.test.ts`.

Independent evidence that this is genuine defence-in-depth rather than a claim:
when the invalidation wire was deliberately cut, **only 2 of 7 tests failed**.
The other 5 still passed, because role-set keying alone already prevented the
escalation.

One more escalation vector was found and closed — **R-2**, the mutable role map.
A single `.add()` anywhere in the process would have permanently widened a role
for every subsequent request. `migration.test.ts` now asserts mutation throws.

### Bound, unchanged and documented

Caches are per-process (ADR-003). On Vercel, invalidation clears only the
instance that served the write; others fall back to TTL. Worst case **≤30 s** of
stale permissions — tighter than the ≤60 s already accepted for roles in
Component 2. Not introduced here, not fixed here → `BL-C3-01`.

## 5. Backward compatibility audit

### Implementation Changes — no access changed (20/20)

Every row of §3. Machine-checked, permanently locked.

### Policy Changes — **NONE**

No production role silently gains access. No production role silently loses
access. Two changes could be mistaken for policy and are not:

- **`analytics.content.read` is new** (R-7), but its `defaultRoles` is every
  admin role — exactly what the previously-unguarded page admitted. A new
  permission is not a new policy when its role set reproduces the old behaviour.
- **`/admin` and `/admin/analytics` gained guards.** Both permissions are held
  by all four roles, so the set of people who can load them is unchanged.

Two things were deliberately **not** changed, because changing them would have
been policy smuggled inside a mechanism change:

- `moderator` keeps analytics read access. The old ladder granted it; removing
  it is an Owner decision → `BL-C3-02`.
- Deals read and write keep identical role sets, mirroring the single
  `requireAdminRole(req,'admin')` they replaced.

Also unchanged: role data, the Owner mechanism, every Hub feature, all public
API behaviour for authorized users.

## 6. Audit results

| Audit | Result |
|---|---|
| **Architecture** | ✅ Single-direction dependencies, no cycles. `guards.ts`/`index.ts` are the only server-only modules. Zero `'use client'` files import a server-only permissions module. Registry, cache and engine all injectable. |
| **Permission escalation** | ✅ Owner bypass precedes the registry lookup, so Owner authority is not catalogue-derived. No permission grants ownership. No role but `super_admin` holds a `security`-category permission (machine-checked). R-2 closed the one in-process escalation surface found. |
| **Privilege regression** | ✅ 20/20 matrix compatible, locked by test. |
| **Cache bugs / stale authorization** | ✅ §4. Two independent defences, both tested; the weaker one alone was shown sufficient. |
| **Dead code** | ✅ Automated scan: **no exported symbol in `permissions/` lacks an external consumer.** Three removed during review (R-3, R-4, plus `canAll`/`canAny` earlier). `requireAdminRole` retained `@deprecated` — zero production callers, kept only because its tests cover the Component 1 Owner boot assertion. |
| **Duplicated logic** | ✅ R-8 fixed: one Actor construction site. Role→permission mapping derived from the registry, never hand-maintained. |
| **Missing consumers** | ✅ All 20 decision points plus the sidebar consume the engine. |
| **Security gaps** | ✅ Fail-closed on unknown permission and on no session. Owner Gate still precedes authorization. Owner Guard still layers on `security.roles.*`. Database remains final authority. `rateLimit`/`isSameOrigin` preserved exactly. |
| **Registry consistency** | ✅ 14 permissions, all 9 metadata fields, 9 invariants machine-checked. R-7 fixed the one entry whose meaning did not match what it guarded. |
| **Missing tests** | ✅ R-5 and R-9 closed. Both fixes proven RED/GREEN, not merely green. |
| **Documentation** | ✅ §8. |

## 7. Blockers

### Remaining — 2, both Owner-only, neither a code defect

1. **The PR is not open.** `gh` CLI is unauthenticated on this machine and I must
   not handle credentials, so I cannot open or merge pull requests. The body is
   ready to paste: `RBAC_PR_DESCRIPTION.md`. Merge with a **merge commit, not a
   squash**.
2. **Production verification requires a second admin session.** Confirming that
   an `admin` is redirected away from `/admin/rbac`, and that revocation takes
   effect within 60 s, needs an authenticated non-Owner account. I cannot create
   accounts or enter passwords. Procedure: runbook §3.2.

### Resolved during this review — 9

All of §1. Every one is fixed, and the two regression classes are locked by
RED/GREEN-proven tests.

### Not a blocker

**BL-002** (production validation of gate G1) remains open from the Foundation
phase. Per Owner instruction it does not block Component 3, which neither fixes
nor worsens it: the Owner Guard call sites are unchanged and the roles admitted
to them are provably identical. Runbook §3.2 is the natural moment to close it.

## 8. Documentation audit

Seven documents, all cross-references verified to resolve:

| Document | State |
|---|---|
| `03_COMPONENT3_RBAC_DESIGN.md` | ✅ updated — §12 added covering R-1, R-2, R-7 |
| `RBAC_MANIFEST.md` | ✅ rewritten — file table, 20 decision points, removed-during-review table |
| `PERMISSION_REGISTRY.md` | ✅ updated — 14 permissions, by-role counts 4/4/11/14 |
| `PERMISSION_RESOLUTION_FLOW.md` | ✅ updated — redirect-target table added |
| `RBAC_DEPLOYMENT_RUNBOOK.md` | ✅ updated — §3.2b added for the loop regression |
| `RBAC_PR_DESCRIPTION.md` | ✅ updated — findings table, lessons |
| `RELEASE_READINESS_COMPONENT_3.md` | this document |

Checks run: every referenced doc exists · every cited source path exists except
`src/lib/admin/page-guard.ts`, which is correctly cited **as deleted** · no
stale test counts, permission counts or registry versions remain (the two
apparent hits are deliberate: a historical "613 tests" reference and the entry
recording `requireAllPermissions` as removed).

Backlog entries `BL-C3-01` (cross-instance invalidation) and `BL-C3-02`
(moderator analytics policy) are filed in `BACKLOG.md`.

## 9. Deployment risk

**Low.**

```
SQL statements ............. 0
Schema changes ............. 0
New environment variables .. 0
Role data touched .......... none
```

Rollback is promoting the previous Vercel deployment — no database state to
unwind, which was the expensive failure mode during the Component 1–2
deployment.

The residual risk is **policy, not code**: `defaultRoles` is the artefact that
could be wrong in a way no build log would reveal. `migration.test.ts` locks it
against the previous behaviour; runbook §3.2 verifies it in production.

## 10. Honest limits of this report

- Every claim is backed by a command that was actually run. The matrix in §3 and
  the role counts in §8 were generated from the built registry, not typed.
- **Nothing has been verified against production.** The gates prove the code
  compiles, type-checks, passes 634 tests and builds. They do not prove the
  deployed build behaves correctly for a real non-Owner admin — only runbook §3
  can, and it has not been executed.
- The build passing is not evidence that the tested build is the deployed build.
- This review found 9 issues in code a prior report called defect-free. The
  honest conclusion is not that the code is now perfect, but that the two
  categories which hid the blocker — an untested enforcement layer and an
  unasserted invalidation wire — are now covered, and both fixes fail loudly if
  reverted.

---

**Stopping here as instructed.** No merge, no deploy, no production change.
