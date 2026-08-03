# Runbook — Component 1 (Platform Owner) Deployment

**Status:** NOT EXECUTED. Nothing in this runbook has been applied to production.
**Owner conditions honoured:** bootstrap requires exactly one active `super_admin`; migrations are idempotent; no migration is applied before read-only verification completes.

**Scope change (owner decision, 2026-08-03):** the `REVOKE ... ON admin_roles FROM service_role` step is **no longer part of Component 1**. It is staged as an end-of-Foundation hardening migration at `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql`, with the rationale in [ADR-017](../../architecture/ADR-017-service-role-hardening-strategy.md). This runbook therefore ends at step 4.

---

## Step 1 — Read-only verification (STOP gate)

Run in the Supabase SQL editor. Changes nothing.

```sql
-- Q1: the bootstrap precondition. MUST be exactly 1.
SELECT COUNT(*) AS active_super_admins
FROM admin_roles
WHERE role = 'super_admin' AND (expires_at IS NULL OR expires_at > NOW());

-- Q2: confirm Component 1 is not already applied.
SELECT to_regclass('public.platform_owner')            AS platform_owner_table,
       to_regprocedure('public.fn_grant_admin_role(uuid,uuid,admin_role,text,timestamptz)') AS grant_fn,
       to_regprocedure('public.fn_revoke_admin_role(uuid,uuid)')  AS revoke_fn;

-- Q3: no name collision with an unrelated pre-existing function.
SELECT proname FROM pg_proc
WHERE proname IN ('fn_grant_admin_role','fn_revoke_admin_role','fn_is_platform_owner');

-- Q4: current service_role privileges on admin_roles (baseline for rollback).
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'admin_roles' AND grantee = 'service_role';
```

| Result | Decision |
|---|---|
| Q1 = 1 | CONTINUE |
| **Q1 ≠ 1** | **STOP.** Report the count. The Owner must be assigned deliberately, not derived. |
| Q2 all NULL | CONTINUE |
| Q2 any non-NULL | STOP — already partially applied; reconcile before proceeding |
| Q3 returns rows | STOP — `CREATE OR REPLACE` would silently overwrite an unrelated function |

---

## Step 2 — Apply the schema migration

Paste `supabase/migrations/20260803_platform_owner.sql` as a single statement batch.

Verify:

```sql
SELECT to_regclass('public.platform_owner') IS NOT NULL AS table_ok,
       (SELECT relrowsecurity FROM pg_class WHERE relname='platform_owner') AS rls_on,
       EXISTS (SELECT 1 FROM pg_indexes
               WHERE indexname='uq_platform_owner_single_active') AS single_owner_index,
       (SELECT prosecdef FROM pg_proc WHERE proname='fn_grant_admin_role')  AS grant_secdef,
       (SELECT prosecdef FROM pg_proc WHERE proname='fn_revoke_admin_role') AS revoke_secdef;
```

All five must be `true`. `grant_secdef`/`revoke_secdef` = `true` is the load-bearing check — without `SECURITY DEFINER` the functions cannot hold a privilege the caller lacks, and step 5 would simply break granting instead of securing it.

**Rollback:** `DROP FUNCTION fn_grant_admin_role(uuid,uuid,admin_role,text,timestamptz); DROP FUNCTION fn_revoke_admin_role(uuid,uuid); DROP FUNCTION fn_is_platform_owner(uuid); DROP TABLE platform_owner;`

---

## Step 3 — Bootstrap the Owner

Run `supabase/seed/platform_owner_bootstrap.sql`. It re-checks the exactly-one condition itself and aborts otherwise — Step 1's Q1 is a pre-flight, not the only guard.

Then read the Owner id and set it in Vercel (**Production + Preview + Development**):

```sql
SELECT user_id FROM platform_owner WHERE active = true;
```

`PLATFORM_OWNER_USER_ID = <that uuid>`

The env var does **not** take effect until the next deploy — which is step 4.

**Rollback:** `UPDATE platform_owner SET active = false, revoked_at = NOW() WHERE active = true;`

---

## Step 4 — Deploy application code

Merge the PR and let Vercel deploy. After deploy, verify with an authenticated Owner session:

| Check | Expected |
|---|---|
| `/admin` loads for the Owner | 200, shell renders |
| `/admin` loads for a non-owner admin | unchanged from today |
| Owner grants `analyst` to a test user | 200 |
| **Non-owner `super_admin` attempts to grant `super_admin`** | **403** |
| Any actor grants a role to themselves | 403 |
| Audit log shows `owner.super_admin_granted` for an Owner super_admin grant | present |

If `PLATFORM_OWNER_USER_ID` is wrong, **every** Controller request returns 403 with `ownership assertion failed` in the logs. Fix the env var and redeploy; product routes are unaffected by design.

---

## Step 5 — DEFERRED (not part of this deployment)

Service-role privilege reduction is staged at
`supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql` and runs
only at the end of the Foundation, as its own change with its own verification
and rollback. Its gate and preconditions are in
[ADR-017 §5](../../architecture/ADR-017-service-role-hardening-strategy.md).

**Do not apply it as part of Component 1.** Until it runs, the constitutional
rules are enforced by the `SECURITY DEFINER` functions plus the application
checks — strong on every sanctioned path, but the service-role client still
technically retains direct write access to `admin_roles`. ADR-017 §4 records
that accepted exposure and why it is smaller than the pre-existing one.

---

## Break-glass (owner-approved mechanism — do not automate)

Recovery of a lost Owner account requires **both** Supabase database access **and** a Vercel env change. There is deliberately no API, no UI, and no offline recovery code, and exactly one active Owner is retained.

1. **Enter maintenance mode** — set `PLATFORM_OWNER_USER_ID` to an intentionally invalid value and redeploy. Every Controller request now returns 403 while product routes stay up. Ownership must never change while the Controller is serving.
2. **Record intent** — insert an `audit_log` row with `action = 'owner.break_glass.initiated'` including who authorised it and why.
3. **Reassign** —
   ```sql
   UPDATE platform_owner SET active = false, revoked_at = NOW() WHERE active = true;
   INSERT INTO platform_owner (user_id, assigned_by, notes)
   VALUES ('<new-owner-uuid>', 'break_glass', '<incident ref + authorisation>');
   ```
4. **Restore** — set `PLATFORM_OWNER_USER_ID` to the new uuid and redeploy.
5. **Verify before resuming** — all three must pass, or leave the Controller down rather than half-recovered:
   - `SELECT user_id FROM platform_owner WHERE active = true` matches the env var
   - the new Owner can load `/admin`
   - the new Owner can grant a throwaway `analyst` role, and a non-owner cannot grant `super_admin`
6. **Close** — write `action = 'owner.break_glass.completed'` with the verification results.

Entering maintenance mode *before* ownership changes is deliberate: a break-glass event is never silent, because it is visible in the Controller's own availability.
