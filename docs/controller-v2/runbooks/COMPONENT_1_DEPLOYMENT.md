> **⚠️ SUPERSEDED STATUS — see [`STATUS.md`](STATUS.md).**
> Components 1 & 2 are **ACCEPTED WITH OPEN PRODUCTION VALIDATION TASK** — merged (`fb21ebe`), deployed, and verified in production. The verdicts and "not yet applied" statements below were accurate when written and are retained as the historical record of the review; they no longer describe current state.

# Runbook — Component 1 (Platform Owner) Deployment

**Status: EXECUTED — 2026-08-04.** Steps 1, 2 and 3 were run against production and verified via PostgreSQL catalog queries; Step 4 completed with the merge of `fb21ebe` and its deployment. Step 5 remains deliberately **DEFERRED** (see below). One post-deploy check from Step 4 is still open — the G1 end-to-end HTTP test, tracked as [BL-002](../BACKLOG.md#bl-002--g1-production-validation).

*The procedure below is retained verbatim as the executable record and as the template for future components. Read the "not yet applied" phrasing in it as describing the state at authoring time.*
**Owner conditions honoured:** bootstrap requires exactly one active `super_admin`; migrations are idempotent; no migration is applied before read-only verification completes.

**Scope (owner decision, 2026-08-03):** the `REVOKE ... ON admin_roles FROM service_role` step is **not part of Component 1**. It is staged as an end-of-Foundation hardening migration at `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql`, rationale in [ADR-017](../../architecture/ADR-017-service-role-hardening-strategy.md). **This runbook ends at Step 4.**

Every step below states: Preconditions · Execution · Verification · Rollback · STOP conditions.

---

## Step 1 — Read-only verification

**Purpose:** prove production is in the exact state Component 1 assumes, before anything is changed. Specifically: exactly one active `super_admin` exists (the bootstrap derives the Owner from it), Component 1 is not already partially applied, no function-name collision would be silently overwritten, and the Phase 0 objects the migration depends on are present.

**Preconditions:** Phase 0 back-office schema live in production (`admin_roles`, `admin_role` enum, `profiles`). Supabase SQL editor access.

**Execution** — read-only, changes nothing:

```sql
-- Q1: the bootstrap precondition. MUST be exactly 1.
SELECT COUNT(*) AS active_super_admins
FROM admin_roles
WHERE role = 'super_admin' AND (expires_at IS NULL OR expires_at > NOW());

-- Q2: confirm Component 1 is not already applied.
SELECT to_regclass('public.platform_owner') AS platform_owner_table,
       to_regprocedure('public.fn_grant_admin_role(uuid,uuid,admin_role,text,timestamptz)') AS grant_fn,
       to_regprocedure('public.fn_revoke_admin_role(uuid,uuid)') AS revoke_fn;

-- Q3: no name collision with an unrelated pre-existing function.
SELECT proname FROM pg_proc
WHERE proname IN ('fn_grant_admin_role','fn_revoke_admin_role','fn_is_platform_owner');

-- Q4: prerequisites the migration depends on must already exist.
SELECT to_regtype('public.admin_role') AS admin_role_enum,
       to_regclass('public.admin_roles') AS admin_roles_table,
       to_regclass('public.profiles')    AS profiles_table;

-- Q5: baseline for rollback — record this output before changing anything.
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_name = 'admin_roles' AND grantee = 'service_role';
```

**Verification:** read each query's output against the table below. Nothing is changed by this step, so "verification" and "STOP conditions" are the same decision table.

**STOP conditions:**

| Result | Decision |
|---|---|
| Q1 = 1 | CONTINUE |
| **Q1 ≠ 1** | **STOP.** Report the count. The Owner must be assigned deliberately, never derived from an ambiguous state. |
| Q2 all NULL | CONTINUE |
| Q2 any non-NULL | **STOP** — already partially applied; reconcile before proceeding |
| Q3 returns 0 rows | CONTINUE |
| Q3 returns rows | **STOP** — `CREATE OR REPLACE` would silently overwrite an unrelated function |
| Q4 all non-NULL | CONTINUE |
| Q4 any NULL | **STOP** — the migration will fail; Phase 0 schema is missing |
| Q5 | informational only; record the output for Step 2 rollback |

**Rollback:** none required — read-only.

---

## Step 2 — Apply the schema migration

**Purpose:** create the Platform Owner principal and the database-enforced constitutional guards — the `platform_owner` table with its single-active-owner invariant, and the three `SECURITY DEFINER` functions that become the only sanctioned way to grant or revoke an admin role. Purely additive; the deployed application does not reference any of it yet.

**Preconditions:** Step 1 passed with no STOP. Q5 output recorded.

**Execution:** paste `supabase/migrations/20260803_platform_owner.sql` as one statement batch.

Additive only — creates one table, two indexes, three functions, enables RLS. No `DROP`, no `REVOKE`, no `ALTER` of any existing object. Idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`), so a re-run is safe.

**Verification:**

```sql
SELECT to_regclass('public.platform_owner') IS NOT NULL AS table_ok,
       (SELECT relrowsecurity FROM pg_class WHERE relname='platform_owner') AS rls_on,
       EXISTS (SELECT 1 FROM pg_indexes
               WHERE indexname='uq_platform_owner_single_active') AS single_owner_index,
       (SELECT prosecdef FROM pg_proc WHERE proname='fn_grant_admin_role')  AS grant_secdef,
       (SELECT prosecdef FROM pg_proc WHERE proname='fn_revoke_admin_role') AS revoke_secdef,
       (SELECT prosecdef FROM pg_proc WHERE proname='fn_is_platform_owner') AS owner_fn_secdef;
```

**Verification 2 — callability (owner decision 2026-08-03).**

The application reaches these objects through PostgREST as `service_role`. The migration now grants every required privilege explicitly (§5), so these queries **confirm** the grants landed rather than compensating for their absence.

```sql
-- A1: service_role must hold EXECUTE on all three functions.
SELECT p.proname,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
WHERE p.proname IN ('fn_grant_admin_role','fn_revoke_admin_role','fn_is_platform_owner');

-- A4: service_role must hold SELECT on platform_owner. owner.ts reads it as a
-- TABLE, not through an RPC, so a missing grant degrades to "no owner assigned"
-- and — with PLATFORM_OWNER_USER_ID set — returns 403 for the WHOLE Controller.
SELECT has_table_privilege('service_role', 'platform_owner', 'SELECT') AS can_select;

-- A4b: platform_owner must NOT be client-readable. RLS is enabled with zero
-- policies, so anon/authenticated are denied regardless of any table grant.
SELECT relrowsecurity AS rls_enabled,
       (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'platform_owner') AS policy_count
FROM pg_class WHERE relname = 'platform_owner';

-- A2: force a PostgREST schema-cache reload so the new functions are callable
-- immediately rather than after an indeterminate lag. Without this, the first
-- RPC call can return PGRST202, which the route does not map and therefore
-- surfaces as HTTP 500.
NOTIFY pgrst, 'reload schema';
```

**STOP conditions:**

| Result | Decision |
|---|---|
| all six assertions `true` | CONTINUE |
| any `false` / NULL | **STOP** and roll back |
| `grant_secdef` or `revoke_secdef` ≠ true | **STOP.** Load-bearing: without `SECURITY DEFINER` the functions cannot hold a privilege the caller lacks, so the constitutional guards would not be enforceable. |
| A1 — any `can_execute` = false | **STOP.** The migration's §5 `GRANT EXECUTE` did not land. Do not deploy: every role grant would return 500. Re-apply §5 and re-verify. |
| A4 — `can_select` = false | **STOP.** The migration's §5 `GRANT SELECT` did not land. Do not deploy: with `PLATFORM_OWNER_USER_ID` set, the whole Controller would answer 403. Re-apply §5 and re-verify. |
| A4b — `rls_enabled` ≠ true **or** `policy_count` ≠ 0 | **STOP.** `platform_owner` must be deny-by-default to clients. A policy here would expose the ownership record. |

**Rollback:**

```sql
DROP FUNCTION IF EXISTS fn_grant_admin_role(uuid,uuid,admin_role,text,timestamptz);
DROP FUNCTION IF EXISTS fn_revoke_admin_role(uuid,uuid);
DROP FUNCTION IF EXISTS fn_is_platform_owner(uuid);
DROP TABLE IF EXISTS platform_owner;
```

Safe at this point: nothing in the deployed application references these objects yet.

---

## Step 3 — Bootstrap the Owner

**Purpose:** assign the one and only Platform Owner, and record the same UUID in the Vercel environment so ownership is pinned in two independent places. After this step, transferring ownership requires both database access and an environment change — neither alone is sufficient.

**Preconditions:** Step 2 verified. Application code **not yet deployed** (order matters — see Step 4).

**Execution:** run `supabase/seed/platform_owner_bootstrap.sql`. It re-checks the exactly-one condition itself and aborts otherwise; Step 1's Q1 is a pre-flight, not the only guard. Idempotent — re-running after success is a no-op.

Then read the Owner id:

```sql
SELECT user_id FROM platform_owner WHERE active = true;
```

Set `PLATFORM_OWNER_USER_ID = <that uuid>` in Vercel (**Production + Preview + Development**).

**Verification:**

```sql
SELECT COUNT(*) AS active_owners FROM platform_owner WHERE active = true;  -- must be 1
SELECT fn_is_platform_owner('<that uuid>') AS is_owner;                     -- must be true
```

**STOP conditions:**

| Result | Decision |
|---|---|
| script raises `BOOTSTRAP ABORTED` | **STOP.** Production has ≠ 1 active `super_admin`. Do not force it. |
| `active_owners` ≠ 1 | **STOP** and roll back |
| `is_owner` ≠ true | **STOP** — the function is not resolving the row it should |

**Rollback:**

```sql
UPDATE platform_owner SET active = false, revoked_at = NOW() WHERE active = true;
```

Also unset `PLATFORM_OWNER_USER_ID` in Vercel. Order does not matter here: the deployed code does not read either yet.

---

## Step 4 — Deploy application code

**Purpose:** activate the application half of Component 1 — the Owner Guard, the Actor, and the RPC-backed grant/revoke routes — against a database that is already prepared. This is also the only point at which the *enforced* path of the Owner Gate can be exercised, since it requires a real authenticated admin session.

**Preconditions:** Steps 2 and 3 verified. `PLATFORM_OWNER_USER_ID` set in Vercel and matching the active owner row. PR approved.

**Execution:** merge the PR; Vercel deploys.

**Verification** — with an authenticated session for each role:

| Check | Expected |
|---|---|
| `/admin` loads for the Owner | 200, shell renders |
| `/admin` loads for a non-owner admin | unchanged from today |
| Owner grants `analyst` to a test user | 200 |
| **Non-owner `super_admin` grants `super_admin`** | **403** (the G1 regression check) |
| Any actor grants a role to themselves | 403 |
| Revoke the last `super_admin` | 409 |
| Audit log after an Owner `super_admin` grant | row with `action = 'owner.super_admin_granted'` |
| Product routes (`/`, `/reviews`, `/scam-shield`) | 200 — unaffected |

This step also closes the one gap left by local testing: the **enforced** path of the owner gate cannot be exercised without a real admin session.

**STOP conditions:**

| Symptom | Decision |
|---|---|
| Every Controller request 403 with `ownership assertion failed` | `PLATFORM_OWNER_USER_ID` is wrong. Fix the env var and redeploy — do NOT touch the database. |
| Non-owner `super_admin` CAN grant `super_admin` | **STOP and roll back.** G1 is not closed. |
| Product routes affected | **STOP and roll back.** Component 1 must not touch them. |

**Rollback:** revert the merge commit on `main` and redeploy.

No database action is required, and this is by design: the previous code has no owner gate and never reads `platform_owner`, so the table and the env var are inert to it. Leave both in place — rolling back the schema as well would only add risk. If a full teardown is genuinely wanted, run Step 3's then Step 2's rollback **after** the code revert is live, never before.

---

## Step 5 — DEFERRED (a pointer, not a step in this runbook)

*No Purpose/Preconditions/Execution/Verification/Rollback/STOP block appears here by design: this is not a step of the Component 1 deployment. It is a signpost to a separate change with its own full runbook in ADR-017 §5.*

Service-role privilege reduction is staged at `supabase/migrations/deferred/FOUNDATION_END_service_role_hardening.sql` and runs only at the end of the Foundation, as its own change with its own preconditions, verification and rollback — see [ADR-017 §5](../../architecture/ADR-017-service-role-hardening-strategy.md).

**Do not apply it as part of Component 1.** Until it runs, the constitutional rules are enforced by the `SECURITY DEFINER` functions plus the application checks — strong on every sanctioned path, but the service-role client still technically retains direct write access to `admin_roles`. ADR-017 §4 records that accepted exposure and why it is smaller than the exposure that existed before Component 1.

---

## Break-glass (owner-approved mechanism — do not automate)

**Purpose:** transfer ownership when the Owner account is permanently lost, without ever creating a second Owner and without an automated path an attacker could drive. Recovery requires **both** Supabase database access **and** a Vercel env change. Deliberately no API, no UI, no offline recovery code.

**Preconditions:** the Owner account is genuinely unrecoverable, and the reassignment is authorised by the business.

**Execution:**

1. **Enter maintenance mode** — set `PLATFORM_OWNER_USER_ID` to an intentionally invalid value and redeploy. Every Controller request now returns 403 while product routes stay up. Ownership must never change while the Controller is serving.
2. **Record intent** — insert an `audit_log` row with `action = 'owner.break_glass.initiated'`, naming who authorised it and why.
3. **Reassign** —
   ```sql
   UPDATE platform_owner SET active = false, revoked_at = NOW() WHERE active = true;
   INSERT INTO platform_owner (user_id, assigned_by, notes)
   VALUES ('<new-owner-uuid>', 'break_glass', '<incident ref + authorisation>');
   ```
4. **Restore** — set `PLATFORM_OWNER_USER_ID` to the new uuid and redeploy.
5. **Verify** — run the Verification block below while still in maintenance mode.
6. **Close** — write `action = 'owner.break_glass.completed'` with the verification results, then lift maintenance mode.

**Verification** — all three must pass, or leave the Controller down rather than half-recovered:

- `SELECT user_id FROM platform_owner WHERE active = true` matches the env var
- the new Owner can load `/admin`
- the new Owner can grant a throwaway `analyst` role, **and** a non-owner cannot grant `super_admin`

**STOP conditions:** if any Verification check fails, do **not** lift maintenance mode and do **not** proceed to step 6. A Controller that is down is recoverable; one serving with ambiguous ownership is not.

**Rollback:** re-point `PLATFORM_OWNER_USER_ID` at the previous owner uuid and re-activate that row, only if the original account turns out to be recoverable.

Entering maintenance mode *before* ownership changes is deliberate: a break-glass event is never silent, because it is visible in the Controller's own availability.
