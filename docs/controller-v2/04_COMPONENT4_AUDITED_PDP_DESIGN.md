# Component 4 — Audited PDP

**Status:** implemented, self-reviewed, READY FOR REVIEW
**Branch:** `feat/controller-v2-component4-audited-pdp` · **Base:** `933c4f8` (`origin/main`, the Component 3 merge) — cut directly, never rebased
**Scope decision:** Owner-approved Option 1 — audited PDP (B+C+D), **no resource dimension**

---

## 1. Why Component 4 is not what the roadmap called it

`ROADMAP.md` lists Component 4 as "Permission Engine". Component 3's
specification already required — and delivered — every part of it:

| C3 spec item | Symbol | Shipped |
|---|---|---|
| Permission Engine | `createPermissionEngine` | ✅ |
| Permission Registry | `createRegistry` | ✅ |
| Role → Permission map | `buildRolePermissionMap` | ✅ |
| Permission Resolver | `createResolver` | ✅ |
| Permission Cache | `createPermissionCache` | ✅ |
| Route / page / UI helpers | `requirePermission` · `requirePagePermission` · `filterByPermission` | ✅ |
| Capability hook | `CAPABILITY_GATE_ENABLED` | ✅ |

Starting "Component 4" by its name would therefore have meant either doing
nothing or inventing scope. The architecture document supplied the real answer:
three obligations of the PDP that Component 3 deliberately left out.

**The most serious was that the PDP recorded nothing.**
`01_CONTROLLER_V2_ARCHITECTURE.md` §Owner powers:

> The Owner bypasses the PDP by constitutional rule — and every bypass writes an
> `owner_override` audit row. **Unaudited power is the thing that makes an audit
> log worthless.**

Component 3 shipped with `writeAuditLog` appearing **nowhere** under
`permissions/`, and denials going to `console.warn`. Production confirmed the
consequence: after the Platform Owner had used the Controller, the `audit_log`
table was **empty** — because only mutating handlers write rows, and the Owner
had only read. The single most privileged principal on the platform left no
trace whatsoever.

## 2. What this component does

| | |
|---|---|
| **B** | Owner bypass writes an `owner.override` audit row |
| **C** | PDP denials become audit rows, not just log lines |
| **D** | Every legacy authorization path is **deleted**, and that is locked by test |

Explicitly **out of scope** (Owner decision): the `resource` dimension the
architecture shows in `authorize(actor, permission, resource)`. Nothing in the
Controller needs resource-scoped authorization today, and this project has three
times shipped machinery with no consumer — Component 2 and Component 3 both did,
and both were caught in review. Adding it now would be the fourth.

## 3. Where the auditing lives, and why not in the engine

```
requirePermission (PEP, server-only)
  ├─ identity           resolveActor
  ├─ Owner Gate         checkOwnerGate       ← still first; unchanged
  ├─ decision           permissionEngine.authorize   (PDP — pure, client-safe)
  └─ record             auditAuthorizationDecision   ← Component 4
```

`decisionAudit.ts` sits beside the guards, never inside `engine.ts`. The engine
is client-safe by construction; importing the audit writer would drag the
service-role Supabase client into it and collapse the layering Component 3
established. Auditing is an **enforcement** concern, so it belongs with the PEP.

`singleDecisionPath.test.ts` asserts this: no file under `permissions/` other
than `guards.ts` may import `./decisionAudit`.

## 4. What gets recorded, and what deliberately does not

| Decision | Recorded? | Action |
|---|---|---|
| Any denial (`NO_GRANT`, `UNKNOWN_PERMISSION`, `CAPABILITY_UNAVAILABLE`, …) | ✅ always | `rbac.access_denied` |
| Owner bypass on write / destructive / security | ✅ | `owner.override` |
| Owner bypass on a **read** | ❌ | — |
| Ordinary `ROLE_GRANT` allow | ❌ | — |
| Owner Gate failure | ❌ | — |

Three of these are judgement calls, so each is asserted in
`decisionAudit.test.ts` rather than left as an opinion in a comment.

**Owner reads are not recorded.** This is the one deliberate departure from
"every bypass". A single Owner browsing produces on the order of ten
`authorize()` calls per page load; recording each would add hundreds of
thousands of rows a year and bury the handful that matter. An audit log nobody
can read is its own kind of worthless. `AUDIT_OWNER_READS` restores literal
compliance with one edit.

**Ordinary allows are not recorded** because the mutation handler downstream
already audits its own effect with before/after state. Auditing the permission
check as well would double-count every action.

**An Owner Gate failure is not an RBAC denial.** The Controller is unavailable;
that is not a decision about this actor, and mislabelling it would poison denial
analytics.

## 5. The attack this component opened, and closed

Auditing denials put a **database write on a path any authenticated user can
drive**. `rateLimit()` runs *inside* each handler — after `requirePermission`
returns — so a caller who is denied throws before ever reaching it. Nothing
throttled the write.

Any logged-in user could hammer `/api/admin/*` and inflate `audit_log` without
limit. That is an attack on the audit log itself, not merely on storage: the
real signal drowns.

Closed by collapsing identical **denials** per `(actor, permission, reason,
surface)` into one row per 60 s. **Only denials** — an `owner.override` is not
attacker-reachable and each row is a distinct privileged action, so throttling
those would break the 1:1 correspondence the architecture asks for. The
adversarial review caught that: `deals/upload` writes no audit row of its own,
so five uploads in a minute would have left one row. **Collapsing is not dropping** — the next row
written carries `suppressed_since_last`, so a spike is still visible as a
number. The key map is bounded (5 000 entries) so varying the key to defeat the
throttle cannot grow memory instead.

Proven RED/GREEN: disabling the throttle fails the 500-request regression test.

## 6. Retiring the legacy paths (D)

| Removed | Why it was safe |
|---|---|
| `requireAdminRole(req, minRole)` | Zero production callers since Component 3. Its five tests — including the two pinning Owner-Gate-before-authorization — were **ported to `requirePermission`** in `apiGuard.test.ts` before deletion, so no coverage was lost. |
| `resolveAdminRole(userId)` | Zero callers. Collapsed an actor to their highest role, which under union semantics silently drops permissions. |
| `AdminContext` | Existed only as `requireAdminRole`'s return type. |

`03_PHASE1_FOUNDATION_DESIGN.md` names this the Block-A exit condition: the shim
"is deleted once the PDP has replaced every `hasRole` call".

`ROLE_RANK` and `hasRole` **survive**, and that is correct — they order a display
badge, gate disabled nav placeholders whose modules do not exist yet, and power
the Component 3 compatibility lock. None of those is an authorization decision.
`singleDecisionPath.test.ts` pins the exact allow-list, so a new consumer has to
justify itself there.

## 7. Behaviour changes (rule 6 — none of these is silent)

| Change | Who is affected | Visible how |
|---|---|---|
| Denied requests now write an audit row | Nobody's access changes | New `rbac.access_denied` rows |
| Owner bypass on non-reads writes a row | Nobody's access changes | New `owner.override` rows |
| `audit_log.actor_role` records `owner` / `none` | — | The Owner is no longer logged as a role they may not hold (the P-4 defect) |
| `requireAdminRole` / `resolveAdminRole` deleted | No caller existed | Compile error if anyone reintroduces one |

**No access decision changes.** The permission matrix is untouched; Component 3's
20-row compatibility lock and the per-role navigation lock both still pass.

## 8. No schema, no migration, no configuration

```
SQL statements ............. 0
Migrations ................. 0
Environment variables ...... 0
Production data touched .... none
```

`audit_log.action` and `audit_log.actor_role` are both `TEXT NOT NULL` with no
enum or check constraint, so `owner.override`, `rbac.access_denied`, `'owner'`
and `'none'` are all writable as-is. This was verified against the migration
before the type was widened, not assumed.

**Naming note:** the architecture writes the action as `owner_override`. The
dotted `owner.override` matches the vocabulary already in the table
(`rbac.role_granted`, `owner.super_admin_granted`), and nothing greps for the
literal. Recorded here so the deviation is deliberate and findable.

## 9. Tests

69 new tests across four files; 725 total.

| File | Tests | Covers |
|---|---:|---|
| `decisionAudit.test.ts` | 30 | The recording policy, the emitted row shape, the anti-flood throttle |
| `apiGuard.test.ts` | 12 | `requirePermission` decision order (ported from the deleted shim) + audit emission |
| `singleDecisionPath.test.ts` | 31 | **Architectural lock** — reads the source tree and fails if a second way to authorize appears |
| `guards.test.ts` (existing) | 12 | Page guard; unchanged |

`singleDecisionPath.test.ts` is the one worth understanding. It asserts against
the *source tree*, not behaviour, because behaviour tests can only prove the
paths that exist are correct — they cannot see a new path someone adds tomorrow.
It fails if a handler loses its guard, if the engine consults rank, if a client
component imports a server-only module, or if a deleted symbol returns.
