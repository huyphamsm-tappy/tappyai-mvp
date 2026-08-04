# ADR-017 — Service Role Hardening Strategy

**Status:** Accepted · **Date:** 2026-08-03 · **Decider:** Platform Owner
**Applies to:** Controller V2 Foundation (Phase 1)
**Supersedes:** the lockdown step originally bundled into Component 1

> **Numbering note.** This ADR was requested as "ADR-015". That number is already
> taken by `docs/engineering/ADR-015-bug-reproduction-gate.md`, a binding rule
> cited by Engineering Constitution Amendment I. Reusing it would make every
> existing "ADR-015" reference ambiguous, so this is filed as **ADR-017**, the
> next free number. See §7 — the repository currently runs two parallel ADR
> series and `ADR-014` is already used twice.

---

## 1. Context

Controller V2 Component 1 closes audit finding G1: any `super_admin` could mint
unlimited additional Super Admins, and no Platform Owner existed. The fix has
three layers:

| Layer | Mechanism | Status |
|---|---|---|
| 1 | `platform_owner` table + partial unique index (exactly one active Owner) | shipped in Component 1 |
| 2 | `fn_grant_admin_role` / `fn_revoke_admin_role` — `SECURITY DEFINER`, enforcing the constitutional rules inside the database | shipped in Component 1 |
| 3 | `REVOKE INSERT, UPDATE, DELETE ON admin_roles FROM service_role` | **deferred by this ADR** |

Layer 3 is what makes the rules *unbypassable*: once the service-role identity
no longer holds write privilege on `admin_roles`, a fully compromised
`/api/admin/*` route cannot escalate privilege, because it does not have the
capability to escalate — not because it is checked.

Originally layer 3 shipped as a second migration inside Component 1, gated only
by a comment saying "apply after the code deploy".

## 2. Problem

A privilege revocation has a fundamentally different risk profile from a schema
addition, and bundling them together is unsafe for three reasons.

**It is the one step that cannot fail safe.** Every other Component 1 artefact
is additive: a new table, new functions, a new nullable column. If the deploy is
rolled back, they sit inert and harmless. The `REVOKE` is subtractive — it
removes a capability the *currently running* code depends on. Apply it a minute
early and role granting breaks in production, with a failure mode (permission
denied deep inside a handler) that looks nothing like its cause.

**Correct ordering was enforced only by a comment.** The instruction "apply this
only after the code is deployed" lived in a SQL header. The Analytics
production-readiness review (finding R1) already documented a *real* incident of
this class in this repository: migration files whose lexicographic order did not
match their dependency order, applied "successfully" by a directory-default run,
with the breakage surfacing later at call time. A comment is not a control.

**Its true precondition is broader than Component 1.** Layer 3 is safe only once
*nothing anywhere* writes `admin_roles` directly. Component 1 fixes the two RBAC
routes, but the Foundation still has nine components to build — Permission
Engine, Capability Registry, Plugin Registry, Audit, Event Bus and others — any
of which could legitimately need to touch role rows during development. Locking
the table at the start of a multi-component phase optimises for a threat that
the SECURITY DEFINER functions already largely contain, while adding friction
and breakage risk to every subsequent component.

## 3. Decision

**Split layer 3 out of Component 1 and defer it to the end of the Foundation.**

1. The `REVOKE` moves to `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql`.
2. `supabase/migrations/deferred/` is **outside** the normal migration path, so no
   bulk or directory-default apply can reach it. This converts "remember not to
   run this yet" from a comment into a structural property.
3. Its gate is explicit: every Phase 1 component shipped and soaked in production.
4. Applying it is its own change, with its own verification and its own rollback —
   never a line item inside another deployment.

Component 1 therefore ships layers 1 and 2 only.

## 4. Consequences

### Accepted risk during the interval

Between Component 1 shipping and this hardening being applied, the service-role
client retains direct `INSERT/UPDATE/DELETE` on `admin_roles`. A compromise that
achieves **arbitrary code execution inside a server route** could bypass the
functions and write role rows directly.

This is a real and deliberately accepted exposure. Three things bound it:

- **The constitutional rules still hold on every sanctioned path.** Both RBAC
  routes call the `SECURITY DEFINER` functions; neither `.insert()`s any more,
  and a test asserts this. Bypassing requires new malicious code, not misuse of
  the existing API.
- **The pre-existing exposure was strictly worse.** Before Component 1 the
  *documented, intended* API let any `super_admin` mint peers — no compromise
  required. This ADR defers the third lock on a door that previously had none.
- **It is time-boxed** to the Foundation, with the gate written down and the
  file staged and ready.

### Benefits

- Privilege revocation is never bundled with feature work.
- Remaining Foundation components are not blocked by a locked table.
- The precondition can be verified once, against the finished Foundation, rather
  than predicted at Component 1.
- The deferred folder generalises: future risky-order migrations have a home
  that structurally prevents accidental application.

### Costs

- The strongest layer arrives later.
- One more thing to remember. Mitigated by the folder, its README, the gate in
  the file header, and this ADR.

## 5. Preconditions for applying (all must hold)

1. Every Phase 1 Foundation component deployed and stable in production.
2. `grep -rn "from('admin_roles')" src/` shows **no** `.insert` / `.update` /
   `.delete` — only `.select`. Any remaining direct write starts failing on apply.
3. `fn_grant_admin_role` and `fn_revoke_admin_role` both have `prosecdef = true`.
4. An agreed rollback window with the Owner.

Verification after applying:

```sql
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'admin_roles' AND grantee = 'service_role';
-- expect SELECT only
```

Then re-run the Component 1 grant/revoke checks — they must still pass, since
the functions retain the privilege the caller lost. If they fail, roll back
immediately with the `GRANT` in the file header.

## 6. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Apply with Component 1 as originally written | The failure mode is a production outage on the role-granting path, ordered only by a comment — the exact class of failure finding R1 recorded |
| Drop layer 3 entirely, rely on `SECURITY DEFINER` + application checks | Gives up the only control that survives arbitrary code execution in a route. The functions are strong; "cannot, rather than must not" is stronger |
| Apply immediately but keep a standing `GRANT` rollback ready | Rollback still requires noticing the breakage first. Production role granting is low-frequency, so a break could go unnoticed for days |
| Use a separate low-privilege DB role for admin writes now | Genuinely better long-term and worth revisiting in the Secret Manager component (Phase 1 #9). Too large to attach to Component 1 |

## 7. Follow-up: ADR numbering is already broken

Discovered while filing this ADR, recorded so it is not lost:

- Two parallel series exist: `docs/backoffice/22_Architecture_Decision_Records.md`
  holds ADR-001…ADR-013 inline, while `docs/architecture/` and
  `docs/engineering/` hold standalone ADR-014…ADR-016 files.
- **`ADR-014` is already used twice** — `ADR-014-migration-apply-checklist.md`
  and `ADR-014-notification-unification.md`.
- The requested number for this ADR (015) was already taken.

Recommendation: adopt one series with a registry file, and give the duplicated
`ADR-014` pair distinct numbers. Not actioned here — renumbering a binding ADR
cited by the Engineering Constitution is its own change, needing its own approval.

**Owner decision 2026-08-03:** keep this ADR at 017; do not consolidate now.
Tracked as **[BL-001 — ADR Consolidation & Numbering Cleanup](../controller-v2/BACKLOG.md#bl-001--adr-consolidation--numbering-cleanup)**,
gated on completion of the Controller V2 Foundation.
