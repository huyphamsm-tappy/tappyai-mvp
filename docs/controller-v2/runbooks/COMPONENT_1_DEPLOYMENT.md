# Runbook — Component 1 (Platform Owner) Deployment

**Status:** NOT EXECUTED. Nothing in this runbook has been applied to production.
**Owner conditions honoured:** bootstrap requires exactly one active `super_admin`; migrations are idempotent; no migration is applied before read-only verification completes.

⚠️ **Order matters.** Step 5 (lockdown) revokes a privilege the *currently deployed* code depends on. Running it before step 4 breaks role granting in production until the deploy lands.

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

## Step 5 — Lockdown (only after step 4 is verified)

Apply `supabase/migrations/20260803_platform_owner_lockdown.sql`.

Verify the privilege is actually gone:

```sql
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'admin_roles' AND grantee = 'service_role';
-- expect SELECT only — no INSERT/UPDATE/DELETE
```

Then re-run the step 4 grant checks. They must still pass: the functions retain the privilege the caller lost.

**Rollback:** `GRANT INSERT, UPDATE, DELETE ON admin_roles TO service_role;`

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
