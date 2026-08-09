# FOUNDATION-10B — Membership API Deployment

## What this is

`POST | PATCH | DELETE /api/admin/org/memberships` — the HTTP entry point for the **already-deployed** `membershipService`.

The F-10B activation gate found that the org library shipped without its route: `membershipService` carries the PDP check, the delegation constraints and the audit write, but had **no way to be called**. The first Department Head therefore could not be provisioned through the canonical authorization path — only by hand-written SQL, which would bypass all three. This closes that gap and nothing else.

## 🚫 This deployment does NOT activate Controller V2

| Fact | State |
|---|---|
| Route exists in production | after this ships — **yes** |
| Route reachable | **no** — returns `404` while the flag is OFF |
| `CONTROLLER_ORG_MEMBERSHIP_ENABLED` | **OFF** — 0 entries in every Vercel environment |
| `department_membership` | **0** |
| First Head | **not provisioned** |
| First department | **not selected** |
| F-10 activation | **NOT performed** — remains a separate, explicit Owner authorization |

`featureGate()` runs **first in every handler**, before identity, schema or service. While the flag is OFF the route performs **no membership read, no membership write, and no audit write** — proven by test (`flag OFF is fully inert`) and by mutation **M-M5** (removing the gate turns those tests RED).

## Contract

Derived from the existing service and schema — nothing new was invented.

| Method | Purpose | Body |
|---|---|---|
| `POST` | assign a membership | `{ targetUserId, targetDepartment, targetOrgRole, targetScope }` |
| `PATCH` | suspend / reactivate | `{ targetUserId, departmentId, status }` |
| `DELETE` | remove | `{ targetUserId, departmentId }` |

`targetOrgRole` ∈ `DEPARTMENT_HEAD | DEPARTMENT_MANAGER | EMPLOYEE` — `ULTIMATE_OWNER` is **not** expressible. `targetDepartment` is an enum over the canonical 15.

`listMemberships` exists in the service but is **deliberately not exposed**: F-10 does not require it, and adding CRUD "for completeness" would widen the surface without a consumer.

**Responses:** `200 { data: membership }` · `401` unauthenticated · `403` denied (permission, scope, role, Owner protection, cross-origin) · `404` feature gate or unknown membership/department · `422` schema · `429` rate limit · `500` unmapped, via the uniform `adminErrorResponse` envelope.

## The route is a thin adapter

```
HTTP → requirePermission (identity → corporate boundary → Owner Gate → PDP)
     → same-origin → rate limit → zod schema
     → membershipService (PDP again · delegation · constraints · audit)
     → uniform envelope
```

It owns **no** security logic. Statically asserted by test: no route-local `endsWith('@tappyai…')`, no role hierarchy, no independent Actor construction, no `writeAuditLog` call, no direct `department_membership` write, and it reads the flag through `orgMembershipEnabled()` rather than `process.env`.

**Defense in depth is real here.** Mutation **M-M3** — weakening the route's permission to one every role holds — stays GREEN, because `membershipService` re-checks `security.membership.manage` itself (`membershipService.ts:97, 180`). The service is the authoritative decider; the route's check is the redundant outer layer. That is the designed behaviour, not a gap.

## Verification

**Tests: 20** (10 from F-07D + 10 added here) — flag OFF inert (no mutation, no audit) · unauthenticated → 401 · non-privileged → 403 · Manager → 403 · Employee → 403 · Head cross-department → 403 · Head cannot create a peer Head → 403 · Head cannot grant GLOBAL → 403 · self-escalation → 403 · Owner cannot be modified → 403 · **Owner assigns the first Head → 200 + `org.membership_assigned` audited** · invalid payload → 422 · unknown membership → 404 not 500 · thin-adapter static assertions.

**Mutations:** M-M1 (auth/PDP guard removed) · M-M5 (flag gate removed) · M-M6 (route ignores the service decision) · M-M7 (schema removed) · M-M8 (audit delegation dropped) — **all RED**, byte-exact restores. M-M2 and M-M4 are not route-mutable by construction (the corporate boundary lives in `rbac.ts`, the PDP in the service); they are covered by the Option B and org suites, and the thin-adapter assertions prevent the route from re-implementing either.

**Gates:** tsc 0 · architecture 8/8 · sql-grants 0 · lint 0 · build PASS (route registers as `ƒ /api/admin/org/memberships`) · vitest **1187 / 1190**, +23 over the baseline with **0 new failures**. The 3 failures are the documented `auditChainInvariants` CRLF condition, reproduced on the untouched baseline.

## After this ships

The F-10 activation runbook's **PHASE 0 — Unblock** is satisfied. Remaining Owner decisions are unchanged: first department, first Head account, membership-authority policy ratification, and explicit activation authorization.
