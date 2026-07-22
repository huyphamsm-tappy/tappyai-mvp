# Analytics Deployment Runbook — Step 1: Read-Only Production Verification Queries

**Scope of this document:** Step 1 only. Every query below is **read-only** (`SELECT`/`information_schema`/`pg_catalog` inspection) — none of them create, alter, insert, update, or delete anything. Run them in the Supabase SQL editor against production, in the exact order below, and paste back every result. I will not proceed to Step 2/3/4 until you do.

**How to use this document:** each query has four parts — the SQL, what a **PASS** result looks like, what a **FAIL** result looks like, and whether a FAIL means **STOP** (do not proceed with deployment until resolved) or **CONTINUE** (informational, doesn't block, but must be recorded).

---

## Group A — Phase 0 / RBAC prerequisite (must be true before anything else matters)

### Q1 — Does `admin_roles` exist, and is at least one active `super_admin` seeded?
```sql
select
  exists (select 1 from information_schema.tables where table_schema='public' and table_name='admin_roles') as admin_roles_table_exists,
  (select count(*) from public.admin_roles where role = 'super_admin' and (expires_at is null or expires_at > now())) as active_super_admin_count;
```
- **PASS:** `admin_roles_table_exists = true` AND `active_super_admin_count >= 1`.
- **FAIL:** either `admin_roles_table_exists = false`, or it's `true` but `active_super_admin_count = 0`.
- **Decision: STOP.** If Phase 0 isn't actually live with a working admin, nothing in this deployment can be verified afterward either (every dashboard/API check in later steps requires a working RBAC login) — this must be resolved (outside this plan's scope) before continuing to any Analytics-specific check.

---

## Group B — Pre-existing objects the pending migrations will modify (deployment-assumption checks)

These confirm the **starting shape** the 5 pending migrations assume. If any of these don't match, the migration files may fail or behave unexpectedly when applied in Step 3 — better to know now than mid-migration.

### Q2 — Does the pre-existing `user_events` table have the baseline shape the envelope migration expects to alter?
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'user_events'
order by ordinal_position;
```
- **PASS:** Returns rows, and includes at least `user_id`, `event_type`, `created_at` (or your table's equivalent baseline columns) — i.e. the table exists in a form the envelope migration's `ALTER TABLE` statements can act on. It should **not** yet have `event_id`, `session_id`, `platform` (those are what the migration adds — see Q4).
- **FAIL:** No rows at all (table doesn't exist — unexpected, since this table predates all Analytics work), or it's missing an expected baseline column the migration's `ALTER` statements reference.
- **Decision: STOP** if no rows returned (something is fundamentally different from what every prior report assumed). **CONTINUE (but record exactly what differs)** if rows are returned but with an unexpected shape — bring the exact column list back to me before Step 3 so I can check it against the migration file's assumptions.

### Q3 — Is there an existing restrictive CHECK constraint on `user_events.event_type` (the one the envelope migration drops)?
```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.user_events'::regclass and contype = 'c';
```
- **PASS:** Returns one or more CHECK constraints, one of which restricts `event_type` to a fixed list (this is the one the migration is designed to drop).
- **FAIL:** Returns no rows at all, or a CHECK constraint with a materially different shape than expected.
- **Decision: CONTINUE either way**, but paste the exact result back — if there's no such constraint, the migration's `DROP CONSTRAINT` statement may need adjustment (informational only, not a blocker by itself, but must be checked against the migration file's exact constraint name before Step 3).

### Q4 — Does `profiles` exist (required by `user_acquisition`'s foreign key)?
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='profiles') as profiles_exists;
```
- **PASS:** `true`.
- **FAIL:** `false`.
- **Decision: STOP** if false — `user_acquisition`'s `user_id uuid PRIMARY KEY REFERENCES public.profiles(id)` cannot be created without this table.

### Q5 — Do `auth.users` and `auth.identities` have the columns the backfill/upsert logic expects?
```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'auth' and table_name in ('users','identities')
  and column_name in ('id','created_at','last_sign_in_at','user_id','provider')
order by table_name, column_name;
```
- **PASS:** Returns `auth.users.id`, `auth.users.created_at`, `auth.users.last_sign_in_at`, `auth.identities.user_id`, `auth.identities.provider` — all present.
- **FAIL:** Any of those five rows missing (would mean Supabase's own auth schema differs from what the backfill/`fn_sync_last_login` assume).
- **Decision: STOP** if any column is missing — the one-time backfill in `user_acquisition_dimension.sql` and `fn_sync_last_login` both directly depend on these exact columns.

---

## Group C — Confirm which of the 5 pending migrations are (or aren't) already applied

**Run these in this exact order — each one's dependency is checked by the prior query, so if an early one unexpectedly shows "already applied," the later ones' results need extra scrutiny (see notes).**

### Q6 — Is the envelope migration (`20260713_analytics_envelope_foundation.sql`) already applied?
```sql
select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='user_events' and column_name='event_id'
) as envelope_applied;
```
- **Expected (per prior reports): `false`.**
- **PASS (expected state):** `false` — confirms not yet applied, safe to run in Step 3.
- **FAIL (unexpected state):** `true` — this migration was already applied outside this plan's tracking.
- **Decision:** If `false` → **CONTINUE** (matches expectation, proceed to Q7). If `true` → **STOP** — do not blindly re-run `20260713_analytics_envelope_foundation.sql` in Step 3; tell me first so I can check whether it's safe to re-run (it uses `IF NOT EXISTS`/idempotent patterns, but I want to confirm the *current* live column set matches what the file expects before re-running any part of it).

### Q7 — Is `user_acquisition` (`20260713_user_acquisition_dimension.sql`) already applied?
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_acquisition') as user_acquisition_applied;
```
- **Expected: `false`.**
- **PASS:** `false`. **FAIL:** `true`.
- **Decision:** `false` → CONTINUE. `true` → **STOP** — if this exists already, check next whether it already has the Activation columns too (Q9) before assuming anything about Step 3's plan.

### Q8 — Is `auth_daily_rollup` (`20260713_auth_daily_rollup.sql`) already applied, and specifically is `fn_sync_last_login` already `SECURITY DEFINER` (the F1 fix)?
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='auth_daily_rollup') as auth_rollup_table_applied;
select prosecdef as fn_sync_last_login_is_security_definer
from pg_proc where proname = 'fn_sync_last_login';
```
- **Expected: `auth_rollup_table_applied = false`; the second query returns no rows (function doesn't exist yet).**
- **PASS:** Both match expected. **FAIL:** Table exists, or the function already exists.
- **Decision:** Matches expected → CONTINUE. **STOP** if the table exists — this migration has a hard dependency on `user_acquisition` (Q7) already existing; if `auth_daily_rollup` is applied but Q7 showed `user_acquisition` does *not* exist, that's a serious inconsistency (this function couldn't have been created successfully without that table, per its own `fn_sync_last_login` body) and must be investigated before touching anything further. If the function exists and `prosecdef = false` (not yet `SECURITY DEFINER`), that confirms an **older, pre-F1-fix version** is live — flag this explicitly, since Step 3's file must overwrite it with the fixed version.

### Q9 — Is the Activation dimension extension (`20260714_activation_dimension.sql`) already applied?
```sql
select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='user_acquisition' and column_name='activated_at'
) as activation_dimension_applied;
```
- **Expected: `false`.** (This query is safe to run even if `user_acquisition` itself doesn't exist yet — it will simply return `false`, not an error, since it queries the columns catalog rather than the table directly.)
- **PASS:** `false`. **FAIL:** `true`.
- **Decision:** `false` → CONTINUE. `true` → **STOP** — this would mean Activation's schema exists even though (per Q7) the base `user_acquisition` table might not, which is contradictory and must be reconciled before Step 3.

### Q10 — Is `activation_daily_rollup` (`20260714_activation_daily_rollup.sql`) already applied?
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='activation_daily_rollup') as activation_rollup_applied;
```
- **Expected: `false`.**
- **PASS:** `false`. **FAIL:** `true`.
- **Decision:** `false` → CONTINUE (this completes the "which migrations are applied" picture). `true` → **STOP** — same reasoning as Q9, reconcile before proceeding.

---

## Group D — Naming-collision safety check (confirms no unrelated existing object would be silently overwritten)

### Q11 — Do any of the 6 new function names already exist for an unrelated reason?
```sql
select proname
from pg_proc
where proname in (
  'fn_upsert_user_acquisition', 'fn_rollup_auth_daily', 'fn_sync_last_login',
  'fn_upsert_activation', 'fn_rollup_activation_daily'
);
```
- **PASS:** Returns **no rows** (none of these names are in use yet by anything).
- **FAIL:** Returns one or more rows.
- **Decision:** No rows → CONTINUE. Any row returned → **CONTINUE, but flag it explicitly to me** before Step 3 — every migration in this plan uses `CREATE OR REPLACE FUNCTION`, which will silently overwrite an existing function of the same name. If one already exists (e.g. from Q8's older F1-pre-fix version, which is an *expected* possible match, not a concern), that's fine; if a name matches something **unrelated** to this Analytics work, that would silently replace someone else's function — needs a name check against this plan's own migration files before applying.

---

## Group E — Migration history + cron function-dependency confirmation (added per owner request)

### Q12 — Does a migration-history table exist, and if so, what does it show?

Supabase's own CLI-managed migration history (if this project uses it) lives in `supabase_migrations.schema_migrations`. Run this first to check for it:

```sql
select exists (
  select 1 from information_schema.tables
  where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
) as schema_migrations_table_exists;
```

**If `schema_migrations_table_exists = true`, also run:**
```sql
select version, name, statements is not null as has_statements
from supabase_migrations.schema_migrations
order by version desc
limit 20;
```

- **PASS (two possible passing outcomes):**
  (a) The table exists, and its rows show exactly the migrations expected to be live so far (per Q1–Q10's findings) and **none** of the 5 pending Analytics migrations listed as applied — i.e. its contents agree with Group C's conclusions; or
  (b) The table does not exist at all (`schema_migrations_table_exists = false`) — this simply means the project's migrations have been applied by hand (e.g. via the SQL editor, as this whole plan already assumes) rather than via the Supabase CLI's own tracked migration flow. **This is not a failure** — it is expected and explicitly anticipated by this runbook (§1 of the companion plan already states live state "cannot be determined from the repo alone" for exactly this reason).
- **FAIL:** The table exists **and** its contents **disagree** with Group C's findings — e.g. it lists one of the 5 pending migrations as already applied, but Q6–Q10 indicated otherwise (or vice versa).
- **Decision:**
  - Table absent → **CONTINUE.** Record the fact ("no CLI-tracked migration history; this project applies migrations manually via SQL editor") and rely on Group C's direct schema inspection as the source of truth instead.
  - Table present and consistent with Group C → **CONTINUE.**
  - Table present and **inconsistent** with Group C → **STOP.** A disagreement between the tracked history and the actual live schema means something was applied (or reverted) outside of what this plan accounted for — must be reconciled with me before Step 3.

### Q13 — Do every one of the Analytics cron's required functions exist (existence check only — nothing is executed)?

The `analytics-snapshot` cron (`src/app/api/cron/analytics-snapshot/route.ts`) calls exactly these five functions via RPC. This query only checks their existence in the catalog — it does **not** call/execute any of them:

```sql
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
where p.proname in (
  'fn_rollup_auth_daily',
  'fn_upsert_user_acquisition',
  'fn_sync_last_login',
  'fn_upsert_activation',
  'fn_rollup_activation_daily'
)
order by p.proname;
```

To make it explicit which ones are missing (rather than having to eyeball a possibly-shorter row count), also run:

```sql
with required(function_name) as (
  values ('fn_rollup_auth_daily'), ('fn_upsert_user_acquisition'), ('fn_sync_last_login'),
         ('fn_upsert_activation'), ('fn_rollup_activation_daily')
)
select r.function_name, exists (select 1 from pg_proc p where p.proname = r.function_name) as exists
from required r
order by r.function_name;
```

- **PASS (expected state, given Group C's expectations):** `fn_rollup_auth_daily`, `fn_upsert_user_acquisition`, `fn_sync_last_login`, `fn_upsert_activation`, `fn_rollup_activation_daily` **all show `exists = false`** — none of the cron's required functions exist yet, consistent with none of the 5 pending migrations being applied (Group C). This is the expected pre-deployment state.
- **FAIL (either direction of inconsistency):**
  - Some, but not all, of the five exist — a **partial** state (e.g. the Auth-side functions exist but the Activation-side ones don't, or vice versa) that doesn't match a clean "nothing applied yet" or "everything applied" picture.
  - Any function exists but Group C (Q6–Q10) indicated its owning migration was **not** applied — a direct contradiction requiring reconciliation.
- **Decision:**
  - All five `false`, consistent with Group C → **CONTINUE** (matches expected pre-deployment state; the cron would currently fail with "function does not exist" if triggered right now, which is expected and fine since it isn't deployed).
  - Any inconsistency (partial existence, or disagreement with Group C) → **STOP.** Do not proceed to Step 2/3 until we've identified exactly which functions exist, in what form (check `is_security_definer` particularly for `fn_sync_last_login` — same F1 relevance as Q8), and why that differs from the migration-application state established in Group C.

---

## Execution order summary

Run **Q1 → Q2 → Q3 → Q4 → Q5 → Q6 → Q7 → Q8 → Q9 → Q10 → Q11 → Q12 → Q13**, in that order, pasting each result as you go (or all 13 at once if you prefer — either is fine, as long as none are skipped). Any single **STOP** result means we pause and resolve that specific finding together before I prepare Step 2.

---

*This document is Step 1 only. Step 2 (environment variable verification), Step 3 (migration apply commands), and Step 4 (deploy) are not prepared yet, per your instruction. Waiting for your query results.*
