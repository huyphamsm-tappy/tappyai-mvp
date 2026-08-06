# Release Readiness Report — Component 3 (RBAC)

**Review type:** PR review, Engineering Constitution V1
**Branch:** `feat/controller-v2-component3-rbac` · **Rebased onto:** `0654f45`
**Registry version:** `2026-08-04.2` · **Date:** 2026-08-04
**Diff:** 50 files (23 added · 1 deleted · 26 modified) — `src/` **+2409 / −194**

> Line totals are quoted for `src/` only. Quoting the whole-diff total inside the
> diff changes it on every documentation commit; the source figure is stable and
> is the one a reviewer actually needs.

# ✅ VERDICT: READY FOR MERGE

Nothing has been merged, deployed, or applied to production. No SQL executed.

---

## 1. What this review found

The previous report said **READY FOR PR** with "0 known code defects". Reviewing
the full diff against that claim found **four more issues**, including one that
**defeated a security fix from the previous review pass**.

| # | Finding | Severity | Status |
|---|---|---|---|
| P-1 | **The R-2 immutability fix did not work.** `Set.prototype.add.call()` walks straight past own-property overrides. `analyst` really could be given `security.roles.grant`. | **security** | fixed, 4 vectors asserted |
| P-2 | **Four nav placeholders lost their role gate.** An analyst could see `Users`, `Engagement`, `Monitoring` — previously admin-only. | regression | fixed, RED/GREEN |
| P-3 | **Undeclared Policy Change.** The layout gate began admitting a roleless Platform Owner, and the badge then called them "analyst". | policy | declared + label fixed |
| P-4 | **Audit recorded a fabricated role** for an Owner who holds none, now reachable via P-3. | audit integrity | `metadata.is_platform_owner` |

### P-1 — a false-safety fix for a false-safety claim

R-2 (previous pass) was: the role→permission map was typed `ReadonlySet` while
being runtime-writable, and a comment claimed protection that did not exist. The
fix overrode `add`/`delete`/`clear` on the Set and froze it.

That fix was defeated in one line:

```js
Set.prototype.add.call(map.get('analyst'), 'security.roles.grant')  // SUCCEEDED
```

Prototype methods reach the internal `[[SetData]]` slot directly. The probe
confirmed `analyst` gained `security.roles.grant` in the live map — and because
the production resolver builds its map once at module load, contaminating it
would have widened that role for every request until process restart.

Worse than the bug: `migration.test.ts` asserted `.add()` throws, which made the
suite *look* like it covered this. **The test guarded the door while the window
stood open beside it.**

Fixed by not handing out a `Set` at all. `PermissionSetView` declares only
`has`, `size` and iteration; the real set stays captured in a closure. With no
`[[SetData]]` of its own, every prototype method throws `TypeError: incompatible
receiver`. All four vectors — `.add`, `Set.prototype.add.call`,
`Set.prototype.clear.call`, `Set.prototype.delete.call` — are now asserted.

### P-2 — the sidebar lost a gate nobody was testing

`ready:false` placeholders carry no permission (their modules do not exist), so
`filterByPermission` passed them through unconditionally. Four entries that had
`minRole` before Component 3 became visible to everyone.

They are disabled and link nowhere, so nothing became *reachable* — but it is an
undeclared behaviour change, and it survived two review passes because **the nav
had no tests at all.** The rule now lives in `nav.ts` as a pure function, with
`nav.test.ts` pinning the visible set for every role entry by entry.

Placeholder visibility deliberately stays on **role rank**. Inventing
permissions for modules that do not exist would make the registry describe
things that are not there — the mistake R-7 exists to prevent.

## 2. Quality gates

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ exit 0, no output |
| Tests | `npx vitest run` | ✅ **67 files / 653 tests passed**, 0 failed |
| Architecture | `npm run architecture:check` | ✅ 7/7 rules |
| Lint | `npx next lint --dir src` | ✅ **0 errors** |
| Build | `npx next build` | ✅ compiled; **all 8 `/admin` routes `ƒ` dynamic** |

Component 3 owns **101** of them (47 engine · 23 migration · 12 guards · 7
invalidation · 12 nav). The suite total moved 647 → 653 when the branch was
rebased onto `0654f45`: the new baseline brought its own tests. Component 3's
own count did not change, and every one of its 101 still passes.

## 3. Authorization paths reviewed

| Path | Finding |
|---|---|
| **API routes** | 12/12 gated by `requirePermission`, all via `PERMISSIONS.*` constants. `rateLimit`/`isSameOrigin` counts byte-identical to the pre-Component-3 state, re-checked against both `35233a4` and the rebase base `0654f45`. No behaviour change beyond the guard swap. |
| **Server Components** | 8/8 pages guarded. Decision order identity → Owner Gate → authorization, asserted in `guards.test.ts`. |
| **Client Components** | No `'use client'` file imports a server-only permissions module. `client.ts` imports one *type* and nothing else. |
| **Navigation** | Nav permission === page-guard permission for all 8 real pages, checked mechanically. Placeholders re-gated (P-2). |
| **UI helpers** | `can` + `filterByPermission`, both consumed. No unconsumed export remains in `permissions/`. |
| **Resolver** | Union across all roles, sorted, deterministic. Role map built once per resolver, not per call. `resolveActorForUser` supplies all roles — never the highest alone. |
| **Cache** | §5. |
| **Owner Guard** | Unchanged. Still layered *on top* of RBAC for `security.roles.grant`/`revoke`. Owner bypass still precedes the registry lookup. |

## 4. Attempts to break the permission system

Each of these was executed, not reasoned about.

| Attack | Result |
|---|---|
| **Privilege escalation via registry mutation** | ✅ **Broke it** (P-1) — `Set.prototype.add.call` widened `analyst`. Fixed; all 4 vectors now throw `TypeError`. |
| **Stale cache after revoke** | ❌ Held. Entries keyed on the role set they were computed from — a narrower set cannot hit them. |
| **Stale cache with invalidation never called** | ❌ Held. Cutting the wire deliberately failed only 2 of 7 tests; the other 5 passed on role-set keying alone. |
| **Multiple-role edge cases** | ❌ Held. `['analyst','admin']` unions to 11; order-insensitive; dropping one role narrows correctly. |
| **Unknown permission** | ❌ Held. `UNKNOWN_PERMISSION` deny for everyone except the Owner (deliberate — authority is not catalogue-derived). |
| **Missing registry entry** | ❌ Held. Empty registry denies everything except the Owner. |
| **Permission drift** | ❌ Held. 20/20 matrix locked by `migration.test.ts`; `PERMISSIONS` ↔ registry bijection asserted. |
| **Bypass attempts** | ❌ Held. No legacy gate has a production caller; `page-guard.ts` deleted; no permission string outside the registry. |
| **Owner isolation** | ❌ Held. No `owner` role in the enum or registry; Owner never resolved through `roleMap`; sees the full nav holding no role. |
| **Redirect loops** | ❌ Held. Gate failure exits the Controller and is not caller-overridable; `/admin` overrides its own denial target. 3 RED/GREEN tests. |
| **Client/server inconsistency** | ✅ **Broke it** (P-2) — nav showed entries the pre-migration sidebar hid. Fixed; nav/page permissions now verified equal for all 8 pages. |

## 5. Cache path review

| Path | Mechanism | Verified by |
|---|---|---|
| Population | Keyed on `(userId, roleSet, registryVersion)` | `invalidation.test.ts` |
| Invalidation | Clears principal **and** permission cache | RED/GREEN (2 tests fail when cut) |
| Permission updates | `REGISTRY_VERSION` bump discards every entry | `engine.test.ts` |
| Multi-role updates | Role-set change ⇒ key miss ⇒ recompute | `invalidation.test.ts` |
| Revoke flow | `invalidateRoleCache(existing.user_id)` | route test asserts the **target**, not the actor |
| Grant flow | `invalidateRoleCache(input.user_id)` | route test asserts the **target**, not the actor |

**Bound, unchanged:** caches are per-process (ADR-003). On Vercel, invalidation
clears only the instance that served the write; others fall back to TTL. Worst
case ≤30 s — tighter than the ≤60 s already accepted for roles. → `BL-C3-01`.

## 6. Backward compatibility matrix — 20/20

Generated from the built registry and the old `ROLE_RANK` ladder, not typed by
hand. **AN**=analyst **MO**=moderator **AD**=admin **SA**=super_admin.

| Route | Permission | Allowed Roles | Previous Roles | Compatible? |
|---|---|---|---|---|
| `GET /api/admin/analytics/activation` | `analytics.activation.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ |
| `GET /api/admin/analytics/auth` | `analytics.auth.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ |
| `GET /api/admin/audit` | `audit.log.read` | AD+SA | AD+SA | ✅ |
| `GET /api/admin/settings` | `settings.config.read` | AD+SA | AD+SA | ✅ |
| `GET /api/admin/deals` | `commerce.deals.read` | AD+SA | AD+SA | ✅ |
| `POST /api/admin/deals` | `commerce.deals.create` | AD+SA | AD+SA | ✅ |
| `PATCH /api/admin/deals/[id]` | `commerce.deals.update` | AD+SA | AD+SA | ✅ |
| `DELETE /api/admin/deals/[id]` | `commerce.deals.delete` | AD+SA | AD+SA | ✅ |
| `POST /api/admin/deals/upload` | `commerce.deals.upload_media` | AD+SA | AD+SA | ✅ |
| `GET /api/admin/rbac/roles` | `security.roles.read` | SA | SA | ✅ |
| `POST /api/admin/rbac/roles` | `security.roles.grant` **+Owner Guard** | SA | SA | ✅ |
| `DELETE /api/admin/rbac/roles/[id]` | `security.roles.revoke` **+Owner Guard** | SA | SA | ✅ |
| `PAGE /admin` | `dashboard.home.view` | AN+MO+AD+SA | any admin | ✅ |
| `PAGE /admin/analytics` | `analytics.content.read` | AN+MO+AD+SA | any admin | ✅ |
| `PAGE /admin/analytics/auth` | `analytics.auth.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ |
| `PAGE /admin/analytics/activation` | `analytics.activation.read` | AN+MO+AD+SA | AN+MO+AD+SA | ✅ |
| `PAGE /admin/audit` | `audit.log.read` | AD+SA | AD+SA | ✅ |
| `PAGE /admin/deals` | `commerce.deals.read` | AD+SA | AD+SA | ✅ |
| `PAGE /admin/rbac` | `security.roles.read` | SA | SA | ✅ |
| `PAGE /admin/settings` | `settings.config.read` | AD+SA | AD+SA | ✅ |

### Navigation visibility — also verified, per role

| Role | Entries visible | Same as before? |
|---|---:|---|
| `analyst` | 4 | ✅ |
| `moderator` | 5 | ✅ |
| `admin` | 11 | ✅ |
| `super_admin` | 12 (all) | ✅ |
| Platform Owner | 12 (all), holding no role | ✅ |

### Policy Changes — exactly ONE, declared

**A Platform Owner holding no admin role can now reach `/admin`.**

| | |
|---|---|
| Before | `if (!resolveAdminRole(user.id)) redirect('/reviews')` — a roleless Owner was redirected out of their own Controller |
| After | `if (!actor.isOwner && actor.roles.length === 0) redirect('/reviews')` |

Ownership does not derive from a role, so it must not depend on one. **For any
non-Owner the condition is identical.** Not currently reachable in production
(the Owner holds `super_admin`, and `fn_revoke_admin_role` protects it) — this
closes the path architecturally rather than relying on that.

Everything else is an Implementation Change. Two things were deliberately **not**
changed: `moderator` keeps analytics read (`BL-C3-02`), and deals read/write keep
identical role sets.

## 7. Deployment safety

| Check | Result |
|---|---|
| Schema changes | **0** |
| Migrations | **0** — no `.sql` or `supabase/` file touched |
| Environment variables | **0** — new code reads no `process.env` |
| Role data touched | none |
| Rollback | Promote the previous Vercel deployment. No database state to unwind. |

**Rollback triggers:** the Owner sees a reduced sidebar or is denied any admin
route · any `/api/admin` route returns 200 without a session · a revocation does
not take effect within 60 s · any admin who could reach a surface before cannot
after · `/admin` produces `ERR_TOO_MANY_REDIRECTS`.

Residual risk is **policy, not code**: `defaultRoles` is the artefact that could
be wrong in a way no build log reveals. `migration.test.ts` locks it; runbook
§3.2 verifies it live.

## 8. Documentation audit

| Document | State |
|---|---|
| `03_COMPONENT3_RBAC_DESIGN.md` | ✅ §12 covers all 13 findings across both passes |
| `RBAC_MANIFEST.md` | ✅ file table, 20 decision points, removed-during-review table |
| `PERMISSION_REGISTRY.md` | ✅ 14 permissions, role counts 4/4/11/14 |
| `PERMISSION_RESOLUTION_FLOW.md` | ✅ redirect-target table |
| `RBAC_DEPLOYMENT_RUNBOOK.md` | ✅ §3.2b loop check, §4b Policy Change |
| `RBAC_PR_DESCRIPTION.md` | ✅ both findings tables, lessons |
| `RELEASE_READINESS_COMPONENT_3.md` | this document |

Every cited source path exists except `src/lib/admin/page-guard.ts`, correctly
cited **as deleted**. No stale test counts, permission counts or registry
versions remain.

## 9. Merge conditions

No blockers remain. Two conditions are mechanical, not defects:

1. **The Owner opens and merges the PR.** `gh` is unauthenticated here and I must
   not handle credentials. Body ready: `RBAC_PR_DESCRIPTION.md`. Use a **merge
   commit, not a squash**.
2. **Run runbook §3 after deploy.** §3.2 needs a second authenticated non-Owner
   admin session — I cannot create accounts or enter passwords.

**BL-002** stays open from the Foundation phase; per Owner instruction it does
not block Component 3, which neither fixes nor worsens it.

## 10. Why the verdict changed to READY FOR MERGE

The previous verdict was READY FOR PR because the code had never been read
against its own diff. It has now been, twice, and the two categories that hid
real defects are closed:

- **Untested enforcement layer** → `guards.test.ts` (12)
- **Untested navigation** → `nav.test.ts` (12)
- **Unasserted invalidation wire** → `invalidation.test.ts` (7)

Every regression fix is proven **RED/GREEN**: reverting P-1 lets the prototype
bypass through, reverting P-2 fails 5 nav tests, reverting R-1 fails 3 guard
tests, cutting R-9 fails 2 invalidation tests.

## 11. Honest limits

- Every number here was produced by a command that ran. The matrices in §6 were
  generated from the built registry, not typed.
- **Nothing has been verified against production.** The gates prove the code
  compiles, type-checks, passes 653 tests and builds. Only runbook §3 can prove
  the deployed build behaves correctly for a real non-Owner admin.
- Two review passes found 13 issues. The honest reading is not that a third pass
  would find zero — it is that the specific blind spots that produced these
  (enforcement, navigation, cache wiring, and "immutability" claims) now fail
  loudly when broken. That is the standard this verdict rests on.

---

**Stopping here as instructed.** No merge, no deploy, no production change.
