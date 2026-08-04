# RBAC Deployment Runbook — Component 3

**Branch:** `feat/controller-v2-component3-rbac` · **Branch point:** `35233a4`
**Registry version:** `2026-08-04.2`

> **Not approved for execution.** This runbook is written for review. Do not run
> any step until the Owner approves the PR. Per the standing rule (2026-08-03),
> production changes go **GitHub PR → Review → Merge → Deploy** — never a direct
> git merge to `main`.

---

## 0. What makes this deployment different

Component 3 has **no database migration and no new environment variable.**

```
SQL statements to run ....... 0
Tables/columns changed ...... 0
Env vars to configure ....... 0
```

Everything is application code. That has three consequences worth stating
plainly before anyone starts:

1. **Rollback is a revert-and-redeploy.** There is no database state to unwind,
   no `DOWN` migration, no risk of a half-applied schema — the failure mode that
   made the Component 1–2 deployment expensive.
2. **The deploy is atomic per instance.** An instance either serves the old
   role-rank gates or the new permission gates; there is no window where the
   registry exists but the routes do not consume it.
3. **The riskiest artefact is `defaultRoles`, not the code.** Deploying the
   wrong policy is a data-plane problem you cannot see in a build log. Step 3 is
   therefore an access-verification step, not a smoke test.

## 1. Pre-flight (read-only, safe to run any time)

Run from the branch. All four must pass before merge is even proposed.

```bash
npx tsc --noEmit && npx vitest run && npm run architecture:check && npx next build
```

Expected:

| Gate | Expected |
|---|---|
| `tsc --noEmit` | exit 0, no output |
| `vitest run` | **66 files / 647 tests passed**, 0 failed |
| `architecture:check` | 7/7 rules passed |
| `next build` | compiled successfully; **all `/admin` routes marked `ƒ` (dynamic)** |

The `ƒ` check is not cosmetic. A statically prerendered `/admin` route would be
served without any server-side authorization. `/admin` changed from static to
dynamic in this component precisely because it gained a guard.

Also confirm the migration lock is green — it is the proof that nobody's access
changed:

```bash
npx vitest run src/lib/admin/permissions/migration.test.ts
```

## 2. Merge (Owner-approved PR only)

1. Owner reviews and approves the PR on GitHub.
2. Merge with **"Create a merge commit"** — preserve history, do **not** squash
   (standing instruction from the Foundation merge).
3. Vercel deploys `main` automatically. Wait for the deployment to report Ready.

> `gh` CLI is **not authenticated** on this machine. The PR must be opened,
> reviewed and merged by the Owner in the GitHub UI.

## 3. Post-deploy verification (production)

The build passing proves the code compiles. It proves nothing about *who can
reach what*. Verify access directly.

### 3.1 Owner path — must be unchanged

Signed in as the Platform Owner:

| Check | Expected |
|---|---|
| `/admin` loads | ✅ |
| Sidebar shows **all** entries, including Roles and Settings | ✅ — the Owner's `listPermissions` returns the full catalogue |
| `/admin/rbac` loads | ✅ |
| Audit log shows the page views | ✅ |

If the Owner sees a reduced sidebar, **stop and roll back**: it means
`isOwner` is not resolving, which is a Component 1 regression surfacing through
Component 3's UI, not an RBAC bug.

### 3.2 Non-Owner admin path

This requires a second authenticated admin account. **BL-002 is still open for
exactly this reason** — see §6.

| Role under test | Sidebar should show | Sidebar should hide | Direct-URL check |
|---|---|---|---|
| `super_admin` (non-Owner) | everything | — | `/admin/rbac` loads; granting `super_admin` is **denied by the Owner Guard** |
| `admin` | Dashboard, Analytics ×3, Audit, Deals, Settings | **Roles** | `/admin/rbac` → redirects to `/admin` |
| `analyst` | Dashboard, Analytics ×3 | Audit, Deals, Settings, Roles | `/admin/audit` → redirects to `/admin` |

The direct-URL checks matter more than the sidebar checks. The sidebar is
presentation; the redirect is the actual boundary.

### 3.2b Owner Gate failure must not loop (Component 3 regression)

The review found and fixed an infinite redirect loop on Owner Gate failure. It
is unit-tested, but the deployed behaviour is worth one live check because it
only manifests when the gate is misconfigured — the worst moment to discover a
browser redirect loop.

**Do NOT induce this on production.** Verify it on a preview deployment by
unsetting `PLATFORM_OWNER_USER_ID` for Preview only, then loading `/admin`:

| Expected | Not expected |
|---|---|
| A single redirect out of the Controller (to `/reviews`) | `ERR_TOO_MANY_REDIRECTS` |

Restore the Preview variable afterwards. If the loop appears, roll back — it
means the deployed build predates the fix.

### 3.3 Fail-closed spot check

```bash
# Any /api/admin endpoint without a session must be 401, never 200.
curl -s -o /dev/null -w "%{http_code}\n" https://www.tappyai.com/api/admin/settings
```

Expected `401`. A `200` means identity resolution is broken; roll back.

### 3.4 Cache behaviour

1. Grant `analyst` to a test account. Confirm the sidebar gains the Analytics
   entries **within 60 s** (principal cache TTL dominates; the permission cache
   is invalidated immediately on the writing instance).
2. Revoke it. Confirm access is gone **within 60 s** and that direct navigation
   to `/admin/analytics/auth` redirects.

Revocation is the direction that matters. If revocation does not take effect
within 60 s, treat it as a P0 and roll back.

## 4. Rollback

No database state, so rollback is one action:

1. In Vercel, **promote the previous production deployment** (the pre-merge
   build). This is immediate and does not require a git operation.
2. Then, at leisure, `git revert` the merge commit on `main` and let the normal
   pipeline redeploy.

There is no data to repair and no partial state to reconcile. Roles in
`admin_roles` are untouched by this component.

**Rollback triggers** — any one of these:

- The Owner sees a reduced sidebar or is denied any admin route.
- Any `/api/admin` route returns `200` without a session.
- A role revocation does not take effect within 60 s.
- Any admin who could reach a surface before the deploy cannot reach it after.

The last trigger is the one the migration lock test is designed to make
impossible, but verify it in production anyway — the test proves the registry
matches the old ladder, not that the deployed build is the tested build.

## 4b. The one declared Policy Change

Everything else in this component preserves behaviour exactly. This does not,
so it is called out on its own.

**A Platform Owner holding no admin role can now reach `/admin`.**

| | |
|---|---|
| Before | `if (!resolveAdminRole(user.id)) redirect('/reviews')` — an Owner with no `admin_roles` row was redirected out of their own Controller |
| After | `if (!actor.isOwner && actor.roles.length === 0) redirect('/reviews')` |

Ownership does not derive from a role, so it must not depend on one — locking
the Owner out contradicts the Component 1 principle the Owner Guard exists to
enforce. **Nobody else is affected:** for any non-Owner the condition is
identical to before.

Verify during §3.1 that the Owner's badge reads **Platform Owner**, not
"analyst" — that label bug was fixed alongside this and is the visible signal
that `isOwner` is resolving.

Not currently reachable in production: the Owner holds `super_admin` (the
bootstrap derived ownership from it, and `fn_revoke_admin_role` protects it).
This closes the path architecturally rather than relying on that.

## 5. What this deployment does NOT do

State these to prevent a false expectation during review:

- It does **not** change anyone's roles.
- It does **not** change who can reach any existing surface (proven by
  `migration.test.ts`, verified in §3.2).
- It does **not** enable capability gating — `CAPABILITY_GATE_ENABLED = false`
  until Component 5.
- It does **not** alter the Platform Owner mechanism. Owner remains enforced by
  the Owner Guard and by `fn_grant_admin_role` in the database.
- It does **not** touch any Hub feature. Deals, Analytics and Audit behave
  identically for every authorized user.

## 6. Known open item — BL-002

Production validation of gate G1 (*a non-Owner `super_admin` cannot mint another
`super_admin`*) remains **OPEN** from the Foundation phase. It needs a second
authenticated non-Owner `super_admin` session, which cannot be created without
the Owner performing the account creation and sign-in.

Per the Owner's instruction, **BL-002 does not block Component 3.** Component 3
neither fixes nor worsens it: the Owner Guard call sites are unchanged, and
`migration.test.ts` proves the roles admitted to those routes are identical.

§3.2's `super_admin` row is the natural moment to close BL-002, if the Owner
chooses to provision the test account during this deployment.
