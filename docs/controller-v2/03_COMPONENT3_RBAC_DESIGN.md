# Component 3 — RBAC Design

**Status:** implemented, self-reviewed, awaiting Owner approval
**Branch:** `feat/controller-v2-component3-rbac`
**Branch point:** `35233a4` (merge of the Foundation closure PR)
**Registry version:** `2026-08-04.2`

---

## 1. What problem this solves

Components 1–2 gave the Controller an **Actor** — a resolved identity carrying
`isOwner`, `roles[]`, `capabilities[]`. What they did not give it was a way to
decide *what that Actor may do*. Authorization was a **role-rank ladder**:

```ts
requireAdminRole(req, 'admin')   // admits admin and everything above it
```

The ladder has three defects that get worse with every Hub added:

1. **It cannot express a role that is broad in one module and absent from
   another.** Rank is a single number. A future `support` role needing deep
   access to Users and none to Commerce has nowhere to sit on the ladder.
2. **The requirement lives at the call site.** `'admin'` is a literal inside a
   route handler. There is no catalogue, so "who can delete a deal?" is answered
   by grepping, and "what can `moderator` do?" cannot be answered at all.
3. **Read and write are indistinguishable.** `requireAdminRole(req,'admin')`
   guards the deals list and the deals delete identically.

Component 3 replaces the ladder with **permissions as first-class objects**.

## 2. The model

```
Actor ──▶ Roles[] ──▶ Permission Registry ──▶ Resolved Permission Set ──▶ Decision
  │
  └── isOwner ────────────────────────────────────────────────────────▶ ALLOW
                        (bypasses the entire pipeline)
```

Five pieces, each in its own file under `src/lib/admin/permissions/`:

| File | Role in the model | Client-safe |
|---|---|---|
| `types.ts` | Vocabulary: `PermissionId`, `PermissionDefinition`, `Decision` | ✅ |
| `registry.ts` | The catalogue. Single source of truth — 14 permissions. | ✅ |
| `roleMap.ts` | Derives role → permissions from `defaultRoles` | ✅ |
| `cache.ts` | Resolved-set cache with the safety properties in §6 | ✅ |
| `resolver.ts` | Actor → `ResolvedPermissionSet` | ✅ |
| `engine.ts` | The Policy Decision Point. Returns a `Decision`. | ✅ |
| `guards.ts` | Route/page enforcement. Throws or redirects. | ❌ **server only** |
| `client.ts` | UI helpers over a plain permission list | ✅ |

`guards.ts` is the only server-only module because it reaches for
`next/headers`. That split is the same boundary Component 2 established with
`roles.ts`, and it is enforced by an audit check (see `RBAC_MANIFEST.md` §4).

## 3. Why roles UNION rather than inherit

The old ladder implied inheritance: `admin` got everything `analyst` had,
because 3 ≥ 1. The registry does not model inheritance at all. An Actor holding
several roles gets the **union** of their permission sets.

This matters and is not a stylistic choice:

- Union is **monotone**. Adding a role can only add permissions. A rank ladder
  can *reduce* effective access if the highest role is used and it happens to
  lack something a lower role had — a real bug class, since `resolveAdminRole()`
  returns only the highest role.
- Union has no ordering to get wrong. `['admin','analyst']` and
  `['analyst','admin']` resolve identically, and the result is sorted so the
  cache key and the resolved set are deterministic.
- Inheritance would have to be re-derived every time a role is added. Union does
  not care how many roles exist.

The consequence is that **`resolveAdminRole` is not sufficient for
authorization**, because it discards every role but the top one. Component 3
therefore added `resolveActorForUser()` to `rbac.ts`, which returns all roles.
This was found during self-review — the first draft of `requirePagePermission`
used `resolveAdminRole` and would have silently dropped permissions for any
multi-role user.

## 4. The Platform Owner is not in this document's model

Per the Master Constitution, **Owner is not a role, not a permission, and not
part of the permission engine.** The engine's first statement is:

```ts
if (actor.isOwner) {
  return { allowed: true, reason: 'OWNER_BYPASS', permission }
}
```

It appears *before* the registry lookup, deliberately. An unknown permission
still resolves to ALLOW for the Owner, because the Owner's authority does not
derive from the catalogue and must not be revocable by editing it. If Owner
bypass came after the lookup, deleting a registry row would lock the Owner out
of their own platform — the exact failure the Owner Guard exists to prevent.

Owner remains enforced separately by `requireOwner()` from Component 1, which
Component 3 does **not** replace. Both are layered on the two constitutional
routes:

```ts
const ctx = await requirePermission(req, PERMISSIONS.SECURITY_ROLES_GRANT)  // RBAC
if (input.role === 'super_admin') requireOwner(ctx, 'grant super_admin')    // Owner Guard
```

RBAC says "you may administer roles". The Owner Guard says "but only the Owner
touches `super_admin`". The database enforces the same rule a third time inside
`fn_grant_admin_role`. None of the three is redundant: they fail closed at
different layers.

## 5. Decision order in the engine

The order is a security property, not an implementation detail:

1. **Owner bypass** → ALLOW (`OWNER_BYPASS`) — §4.
2. **Unauthenticated / no actor** → DENY (`UNAUTHENTICATED`).
3. **Permission not in registry** → DENY (`UNKNOWN_PERMISSION`).
4. **Capability unavailable** → DENY (`CAPABILITY_UNAVAILABLE`).
5. **Not granted by any held role** → DENY (`NO_GRANT`).
6. Otherwise → ALLOW (`ROLE_GRANT`).

Step 3 is the fail-closed rule: a typo'd or deleted permission denies everyone
except the Owner. The alternative — treating unknown as ungated — would mean a
deleted registry row silently opens a route to the public.

Step 4 is **inert today**: `CAPABILITY_GATE_ENABLED = false`, because
capabilities are not populated until Component 5. The branch and its tests exist
so that enabling it is a one-line change with proven behaviour, not new code
written under time pressure later.

## 6. Cache safety

Resolution is pure set arithmetic over data the Component 2 principal cache
already fetched, so the permission cache saves CPU, not I/O. That is what lets
it be aggressively conservative:

| Property | Mechanism |
|---|---|
| **No stale privilege escalation** | Entries are keyed on the **role set** they were computed from. If an actor's roles change, the old entry cannot match — even before TTL expiry, and even if nobody calls `invalidate()`. |
| **Version safe** | Entries carry `registryVersion`. A registry edit discards them rather than serving a set computed under old rules. |
| **Deterministic** | Sorted permissions, sorted role key, frozen result. Same inputs ⇒ byte-identical set. |
| **Explicitly invalidated** | `invalidateRoleCache(userId)` now also clears the permission cache. Both role-write paths call it. |

TTL is **30 s**, deliberately half the 60 s principal cache: the principal cache
is the one avoiding a database round-trip, so there is no reason to hold a
privilege decision as long.

### Known bound (inherited, not introduced)

The cache is **per-process**, matching ADR-003. On Vercel, `invalidate()` clears
only the instance that served the write; other warm instances keep their entry
until TTL. The worst case is therefore **≤30 s of stale permissions on other
instances**, strictly better than the ≤60 s the principal cache already allows
for roles. Component 3 does not make this worse and does not fix it; a
cross-instance invalidation bus is a Foundation-wide concern, recorded in
`BACKLOG.md`.

## 7. What integration actually required

An engine with no callers is not an authorization layer — it is a library
nobody uses. Self-review found exactly that: the first implementation had **zero
consumers**. Component 3 therefore migrated every authorization decision point:

- **12 API handlers** — `requireAdminRole(req, role)` → `requirePermission(req, PERMISSIONS.X)`
- **6 page guards** — `requirePageRole(role)` → `requirePagePermission(PERMISSIONS.X)`
- **2 previously unguarded pages** — `/admin` and `/admin/analytics` gained guards (§8)
- **Sidebar navigation** — `minRole` → `permission`, filtered via `filterByPermission`

`src/lib/admin/page-guard.ts` was **deleted**: after migration it had zero
callers and zero tests, and it was a parallel role-rank authorization path that
would let a future route bypass the registry. `requireAdminRole` was kept but
marked `@deprecated` — it has no production callers either, but its tests are
the coverage for the Component 1 Owner boot assertion, and deleting Component 2
test coverage is outside this component's scope.

## 8. Two doors that were hidden but not locked

The permission audit found `/admin` and `/admin/analytics` had **no guard of
their own**. They relied on the `/admin` layout, which admits any admin, while
the sidebar already hid them behind `dashboard.home.view` and
`analytics.auth.read`. Hiding a nav entry is presentation; it stops nobody who
types the URL.

Both now enforce their own permission. Every role holds both permissions today,
so **no operator's access changes** — the point is that the nav and the page now
read the same source of truth. `/admin/page.tsx` was `'use client'` and could
not carry a server guard, so its UI moved to
`src/components/admin/dashboard/HomeDashboard.tsx` and the page became a server
component. A side effect worth noting: `/admin` was previously **statically
prerendered**; it is now `ƒ` (dynamic), which is correct for an authenticated
surface.

## 9. Deliberate non-changes

Two things look like defects and are not:

**`moderator` holds the analytics read permissions.** Under the old ladder
these routes required `analyst`, and `moderator` outranks `analyst`, so
moderators can read analytics **today**. Omitting them from `defaultRoles` would
have been a silent privilege revocation smuggled inside a mechanism change.
Whether a moderator *should* read analytics is a policy question for the Owner,
proposed separately in `BACKLOG.md`, not something Component 3 decides.

**Deals read and write share the same roles.** `commerce.deals.read` and
`commerce.deals.delete` both grant `['admin','super_admin']`, mirroring the
single `requireAdminRole(req,'admin')` they replaced. The permissions are
*separate objects* with different `category` and `riskLevel`, so splitting them
later is a `defaultRoles` edit rather than a code change. Splitting them now
would change who can delete a deal, which is a policy decision.

This is why `canAll`/`canAny` were written and then removed (dead-code audit
D1): with no read/write split anywhere in the registry, no screen has a viewer
who cannot also act, so any consumer would have been invented to justify the
helper.

## 10. Test strategy

88 tests across four files:

- `engine.test.ts` (47) — the 11 required scenarios plus production-registry
  integrity invariants: id format, complete metadata, module prefix matches
  `module`, `PERMISSIONS` ↔ registry bijection, `security` category ⇒
  `critical`, `destructive` ⇒ ≥ `high`, `read` ⇒ never `critical`, `analyst`
  holds only `read`, no non-`super_admin` holds a `security`-category permission.
- `migration.test.ts` (22) — the **backward-compatibility lock**: for all 20
  decision points, asserts the new permission grants *exactly* the role set the
  old ladder admitted. Plus the role-map immutability assertion.
- `guards.test.ts` (12) — the **enforcement layer**: decision order, failure
  modes, and redirect targets. Added during review, because the engine tests
  could never have caught the redirect loop described in §12.
- `invalidation.test.ts` (7) — grant, revoke and multi-role cache flows, plus
  an adversarial case proving a revoked role cannot authorize **even if
  invalidation is never called**.

The integrity invariants matter more than they look. They mean a future engineer
adding a `critical` permission to `analyst` gets a red test rather than a
production incident.

## 11. Files

See `RBAC_MANIFEST.md` for the complete inventory with line counts and the
per-file audit results.

## 12. What the formal review changed

The review found nine issues in this component's own implementation. Three are
worth reading in full because they are design-level, not typos.

### R-1 — the redirect loop (blocker)

`requirePagePermission` redirected to `/admin` when the Owner Gate failed. That
was safe while `/admin` had no guard. §8 gave `/admin` a guard — which turned the
fallback into a self-redirect: gate failure → `/admin` → gate failure → forever.
`ERR_TOO_MANY_REDIRECTS` in the exact scenario where the Controller most needs
to fail diagnosably.

Fixed by separating the two failure modes. A **Controller outage** now exits the
Controller entirely (`/reviews`) because bouncing inside a dead Controller is
meaningless; a **permission denial** still returns to `/admin`, except on
`/admin` itself, which passes its own `deniedRedirect`. Proven RED/GREEN: the
three regression tests fail when the old targets are restored.

The general lesson: *adding a guard to a fallback destination turns that
fallback into a loop.* Any future guarded page must be checked against every
redirect target that points at it.

### R-2 — the role map was mutable

`buildRolePermissionMap` returned `ReadonlySet`s and a comment claiming callers
could not mutate them. `ReadonlySet` is erased at compile time and
`Object.freeze` does **not** stop `Set.add` — so every role's permission set was
writable at runtime through a shared reference, on the authorization hot path.
The comment asserted a protection that did not exist. Now genuinely sealed.

### R-7 — the registry lied about what it protected

`/admin/analytics` is a **content** analytics page (reviews, videos, hashtags,
creators). It was gated on `analytics.auth.read`, an **authentication**
permission, because that was the closest existing entry. Same roles, so no
access changed — but the registry is supposed to be the answer to "what does
this permission protect", and that answer was wrong. Added
`analytics.content.read` with identical `defaultRoles`.

