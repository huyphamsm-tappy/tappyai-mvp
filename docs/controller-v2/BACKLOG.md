# Controller V2 — Backlog

Deferred work, deliberately not done now. Each item states its gate. Nothing here is scheduled until its gate is met.

**Status authority:** [`STATUS.md`](STATUS.md) is the single source of truth for project status.

| ID | Title | Category | Type | Status | Blocks Component 3? |
|---|---|---|---|---|---|
| [BL-001](#bl-001--adr-consolidation--numbering-cleanup) | ADR Consolidation & Numbering Cleanup | Architecture / ADR cleanup | Development Task | Backlog | **No** |
| [BL-002](#bl-002--g1-production-validation) | G1 Production Validation | Production validation | **Production Acceptance Task** | **OPEN** | **No** |

**Nothing in this backlog blocks Component 3.** BL-001 is gated on Foundation completion and is unrelated to RBAC. BL-002 validates behaviour that is *already deployed* — it gates only the final acceptance wording of Components 1 & 2, not any further work. These two items are the complete set of open Controller V2 backlog entries.

---

## BL-002 — G1 Production Validation

**Type: PRODUCTION ACCEPTANCE TASK — not a development task.**
No code is written, changed or reviewed by this item. It validates already-deployed behaviour.

**Status:** OPEN · **Raised:** 2026-08-04 · **Blocks:** final acceptance of Components 1 & 2 only. Does **not** block Component 3.

### Objective

Prove, over real HTTP on live production, that **a `super_admin` who is not the Platform Owner cannot grant `super_admin`** — audit finding G1, the defect the entire Foundation exists to close.

Already verified at two other layers; this item covers only the end-to-end HTTP path:

- **Database** — `fn_grant_admin_role` raises `42501` for a non-Owner actor (authoritative layer)
- **Application** — `requireOwner()` covered by the named regression test in `src/app/api/admin/rbac/roles/route.test.ts`

### Prerequisites

1. A second user account that is **not** the Platform Owner (`4dcce7cf-…`). Production already has more than one profile; a brand-new account is not required.
2. That account granted `super_admin` **by the Platform Owner** — temporarily, immediately before the test.
3. Ability to sign in as that account (manual — the only step Claude cannot perform).
4. Production reachable at `https://www.tappyai.com`.

### Exact HTTP test procedure

**Step 1 — grant the temporary role.** As the Platform Owner, at `/admin/rbac`, grant `super_admin` to the test account. Record the returned role-assignment `id` — it is needed for cleanup.

**Step 2 — sign in as the test account** in a separate browser profile or private window, so the Owner session stays intact.

**Step 3 — issue the request.** On `https://www.tappyai.com`, in the DevTools console:

```js
const r = await fetch('/api/admin/rbac/roles', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: '00000000-0000-0000-0000-000000000001', // any uuid; must NOT be the caller's own
    role: 'super_admin'
  })
});
console.log(r.status, await r.text());
```

The target `user_id` must not equal the caller's own id, otherwise the self-promotion guard fires first and the test proves nothing.

### Expected HTTP response

```
403
{"error":{"code":"FORBIDDEN","message":"Only the Platform Owner may grant super_admin"}}
```

| Observed | Meaning |
|---|---|
| `403` + `Only the Platform Owner may grant super_admin` | ✅ **PASS** — G1 is closed |
| `403` + `Self-promotion is not permitted` | ❌ INVALID — you are signed in as the Owner, or the target uuid equals the caller's. Re-run |
| `200` | 🚨 **FAIL — G1 IS NOT CLOSED.** Revoke the temporary role immediately and roll back |
| `401` | Not signed in |

### Expected audit log

The rejected attempt is denied by `requireOwner()` **before** the handler reaches `writeAuditLog`, so **no `rbac.role_granted` row is written** — and its absence is itself the correct outcome.

What must be present is the audit trail of the temporary grant and its revocation:

```sql
SELECT action, actor_id, target_id, created_at
FROM audit_log
WHERE action IN ('owner.super_admin_granted','owner.super_admin_revoked')
ORDER BY created_at DESC
LIMIT 5;
```

Expect one `owner.super_admin_granted` (Step 1) and, after cleanup, one `owner.super_admin_revoked` — both with `actor_id` = the Platform Owner.

### Cleanup procedure

**Mandatory, immediately after the test — production must not be left with two Super Admins.**

1. Sign out of the test account.
2. As the Platform Owner, revoke the temporary `super_admin` at `/admin/rbac`.
3. Confirm exactly one remains:

```sql
SELECT count(*) AS active_super_admins
FROM admin_roles
WHERE role = 'super_admin' AND (expires_at IS NULL OR expires_at > NOW());
-- expect 1
```

4. Confirm the revocation was audited (query above).

### Acceptance criteria

All five must hold:

- [ ] Request returned **HTTP 403**
- [ ] Message was exactly `Only the Platform Owner may grant super_admin`
- [ ] **No** `admin_roles` row was created for the attempted grant
- [ ] Temporary role revoked; `active_super_admins` back to **1**
- [ ] Grant and revocation both present in `audit_log`

On completion, update [`STATUS.md`](STATUS.md) to **ACCEPTED** and close this item.

### If it fails

`200` means privilege escalation is live in production. Revoke the temporary role, then revert the merge commit `fb21ebe` and redeploy. No database rollback is required — the previous code neither reads `platform_owner` nor calls the RPCs.

---

## BL-001 — ADR Consolidation & Numbering Cleanup

**Status:** Backlog · **Gate:** after the Controller V2 Foundation (Phase 1) is complete
**Raised by:** [ADR-017 §7](../architecture/ADR-017-service-role-hardening-strategy.md) · **Owner decision 2026-08-03:** keep `ADR-017`, do not consolidate now

### Problem

The repository runs **two parallel, colliding ADR series**.

| Series | Location | Numbers |
|---|---|---|
| Inline | `docs/backoffice/22_Architecture_Decision_Records.md` (14 headings) | ADR-000 … ADR-013 |
| Standalone files | `docs/architecture/`, `docs/engineering/` | ADR-014 … ADR-017 |

Two concrete defects:

1. **`ADR-014` is ambiguous.** Two different documents claim it:
   - `docs/architecture/ADR-014-migration-apply-checklist.md`
   - `docs/architecture/ADR-014-notification-unification.md`

   **14 files reference "ADR-014"** and a reader cannot tell which document is meant. This is the real harm — not untidiness, but 14 citations that do not resolve.

2. **Numbers are allocated by guessing.** `ADR-015` was requested for the Service Role Hardening Strategy while already taken by `docs/engineering/ADR-015-bug-reproduction-gate.md` (binding; cited by Engineering Constitution Amendment I). Caught only because the number was checked before filing. There is no registry, so the next collision is a matter of time.

### Scale (measured 2026-08-03)

18 distinct ADR numbers in use, **~174 file references** in total.

| ADR | Files referencing | Note |
|---|---|---|
| 001 | 17 | |
| 008 | 16 | |
| **014** | **14** | **ambiguous — two documents** |
| 009 | 14 | |
| 003 | 12 | |
| 005, 011 | 11 | |
| 004, 007, 016 | 10 | |
| 002, 006 | 9 | |
| 010 | 8 | |
| 013, 015 | 6 | 015 is binding (Engineering Constitution) |
| 012, 017 | 5 | |
| 000 | 1 | |

### Proposed work

1. **Create an ADR registry** — one index file listing every ADR: number, title, status, canonical path. Allocation reads the registry; the registry is the source of truth for "what number is free".
2. **Resolve the `ADR-014` collision** — keep one, renumber the other to the next free number, update all 14 referencing files. Prefer renumbering the *migration-apply-checklist* (operational, fewer semantic citations) over *notification-unification*, but confirm by inspecting the actual references first.
3. **Decide one home for ADRs** — either promote the 14 inline ADRs in `docs/backoffice/22` to standalone files, or keep both forms and let the registry map them. Promoting is cleaner; it is also ~14 file moves plus reference rewrites.
4. **Add a guard** — extend `scripts/architecture/check.mjs` with a rule that fails CI when two files claim the same ADR number, or when an ADR is referenced but absent from the registry. The guard engine is already rules-as-data, so this is a new rule entry, not new machinery.

### Constraints

- **`ADR-015` (Bug Reproduction Gate) is binding** and cited by Engineering Constitution Amendment I. Renumbering it changes a governing document and needs its own explicit approval — do not fold it into a cleanup pass.
- Reference rewrites must be verified, not sed-and-hope: after the change, every `ADR-0NN` token must resolve to exactly one document.
- Do this as one atomic change. A half-renumbered state is worse than the current one.

### Why deferred

It touches binding governance documents and ~174 references across the doc set, while the Foundation is mid-build and the frozen `docs/backoffice` v1.1 set may itself be superseded by Controller V2 (open decision). Renumbering now risks doing the work twice.

**Not urgent:** the ambiguity is a documentation-navigation cost, not a correctness or security risk. No code reads ADR numbers.

---

## BL-C3-01 — Cross-instance cache invalidation

**Raised by:** Component 3 performance audit · **Severity:** low · **Status:** deferred

The principal cache (60 s, Component 2) and the permission cache (30 s,
Component 3) are both **per-process**, matching ADR-003. On Vercel,
`invalidateRoleCache(userId)` clears only the instance that served the write;
other warm instances keep serving until TTL.

**Worst case:** ≤30 s of stale permissions on instances that did not handle the
revocation — strictly tighter than the ≤60 s already accepted for roles.

**Not introduced by Component 3**, which inherited the model and made it no
worse. A fix (Redis pub/sub, or a short-lived revocation list checked on read)
is a Foundation-wide concern touching Component 2, and should not be smuggled
into a component that has no database or infrastructure surface of its own.

**Why deferred:** the exposure window is bounded, applies only to role
revocation, and the Controller has a handful of admins. Fixing it means adding
an external dependency to the authorization hot path — a larger security surface
than the problem it closes. Revisit when the admin population or the revocation
SLA makes 30 s unacceptable.

---

## BL-C3-02 — Should `moderator` keep analytics read access?

**Raised by:** Component 3 permission audit · **Severity:** policy · **Status:** needs Owner decision

`moderator` currently holds `analytics.auth.read` and
`analytics.activation.read`. This is **inherited, not designed**: the old
ROLE_RANK ladder gated those routes at `analyst`, and `moderator` outranked
`analyst`, so moderators can read analytics in production today.

Component 3 preserved it deliberately. Removing it would have been a silent
privilege revocation smuggled inside a mechanism change, which is exactly what
`migration.test.ts` exists to prevent.

The result is that `analyst` and `moderator` hold **identical** permission sets
(3 each). That is a smell worth resolving, but resolving it is a policy call:

- **Option A** — remove analytics from `moderator`. Moderation and analytics are
  different jobs; a moderator does not need funnel data.
- **Option B** — keep it. Moderators benefit from seeing activation trends when
  judging content patterns.

Either way the change requires bumping `REGISTRY_VERSION` and editing the
corresponding rows in `migration.test.ts` deliberately.

**Natural moment to decide:** when the Moderation Hub ships and `moderator`
gains permissions of its own, making the two roles genuinely distinct.
