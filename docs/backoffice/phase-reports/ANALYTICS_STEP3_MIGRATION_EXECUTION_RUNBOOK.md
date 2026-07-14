# Analytics Deployment Runbook — Step 3: Production Migration Execution Plan

**Scope of this document:** Step 3 planning only. **No migration is applied, no code changed, no deployment performed as part of producing this document.** This defines exactly what will be run, in what order, how to verify each one, and how to roll back if something goes wrong — for execution in a later, explicitly-approved action.

**Precondition (already satisfied):** Step 1 confirmed the production database (Supabase project `fwznnobrdctuskgrvuik`) is in a clean pre-deployment state — none of the 5 migrations below are applied, all prerequisite objects (`profiles`, `auth.users`, `auth.identities`, the pre-envelope `user_events` shape) exist as expected, and there is no naming collision risk. Step 2 confirmed all 4 required production environment variables are correctly set (with `NEXT_PUBLIC_SITE_URL` corrected during that step — not yet live until the Step 4 deploy).

**Ground rule for execution (from the Step 1/Readiness Report R1 finding):** apply these **one file at a time, in the exact order below** — never via a bulk "apply all pending migrations" action. The files' names do not sort into correct dependency order (confirmed: `auth_daily_rollup` sorts before `user_acquisition_dimension`, and `activation_daily_rollup` sorts before `activation_dimension`, both backwards). Run the verification query after each file and get a PASS before moving to the next.

---

## Execution order (dependency-safe)

| Order | File | Depends on |
|---|---|---|
| 1 | `20260713_analytics_envelope_foundation.sql` | none (extends pre-existing `user_events`) |
| 2 | `20260713_user_acquisition_dimension.sql` | `profiles`, `auth.users`, `auth.identities` (pre-existing) |
| 3 | `20260713_auth_daily_rollup.sql` | **migration #2** (`fn_sync_last_login` writes to `user_acquisition`) |
| 4 | `20260714_activation_dimension.sql` | **migration #2** (`ALTER TABLE user_acquisition`) |
| 5 | `20260714_activation_daily_rollup.sql` | **migration #4** (`fn_rollup_activation_daily` reads the columns it adds) |

---

## Migration 1 — `20260713_analytics_envelope_foundation.sql`

**Purpose:** Reconcile the pre-existing `user_events` table into the shared v1.1 analytics envelope (idempotency, cross-platform metadata) that every later Authentication + Activation object depends on.

**Expected objects created/modified:**
- `ALTER TABLE public.user_events`: drops `NOT NULL` on `user_id`; adds `event_id`, `schema_version`, `anon_id`, `platform`, `app_version`, `build_number`, `os_name`, `os_version`, `device_type`, `country`, `language`, `session_id`, `client_timestamp`, `is_unknown_event`.
- `UNIQUE` constraint/index on `event_id` (idempotency).
- Drops the existing restrictive `event_type` CHECK constraint (confirmed present as `user_events_event_type_check` in Step 1's Q3); adds a new, non-restrictive identity CHECK (`NOT VALID`).
- New indexes supporting the added columns.
- **No new table.**

**Verification SQL (run immediately after applying):**
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='user_events' and column_name in ('event_id','session_id','platform','client_timestamp')
order by column_name;

select conname from pg_constraint
where conrelid = 'public.user_events'::regclass and contype = 'u';
```
- **PASS:** First query returns all 4 column names. Second query returns at least one unique constraint/index (covering `event_id`).
- **FAIL:** Any of the 4 columns missing, or no unique constraint found.
- **Decision:** PASS → CONTINUE to Migration 2. FAIL → **STOP** — do not proceed to Migration 2 (which conceptually assumes the enriched envelope is in place for later cron reads), investigate the exact statement that didn't apply before retrying.

**Rollback guidance if this migration fails partway:** All statements use additive patterns (`ADD COLUMN`, `ADD CONSTRAINT ... NOT VALID`) — a failure on one statement does not corrupt what succeeded before it in the same file (Postgres runs a migration file as a single transaction by default in the Supabase SQL editor, so a mid-file error automatically rolls back the entire file — verify no partial state exists via the query above showing zero of the new columns, which is what you'd expect after an auto-rolled-back transaction). If the file appears to have partially applied outside of that safety (e.g. run statement-by-statement manually), the safe reversal is `ALTER TABLE user_events DROP COLUMN <name>` for each newly-added column, and re-adding the original CHECK constraint from Step 1's Q3 evidence before retrying.

---

## Migration 2 — `20260713_user_acquisition_dimension.sql`

**Purpose:** Create the permanent `user_acquisition` dimension (SR-1 single source of truth for acquisition) and backfill it once from existing users.

**Expected objects created/modified:**
- New table `public.user_acquisition` (columns: `user_id` PK → `profiles(id)`, `anon_id`, `signup_method`, `signup_platform`, `signup_app_version`, `signup_device_type`, `signup_country`, `signup_language`, `acquisition_source`, `signup_at`, `first_login_at`, `last_login_at`, `created_at`, `updated_at`).
- Indexes on `signup_method`, `signup_platform`, `acquisition_source`, `signup_at`.
- RLS enabled, deny-by-default (no policies).
- New function `fn_upsert_user_acquisition(...)` (first-write-wins merge).
- **One-time backfill**: `INSERT ... SELECT` from `auth.users` ⋈ `profiles` ⋈ `auth.identities`, `ON CONFLICT DO NOTHING` — populates a row per existing user.

**Verification SQL:**
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_acquisition') as table_exists;
select count(*) as backfilled_rows from public.user_acquisition;
select prosecdef from pg_proc where proname = 'fn_upsert_user_acquisition';
```
- **PASS:** `table_exists = true`; `backfilled_rows` is a positive number roughly matching your known existing user count (not zero, unless this is a genuinely brand-new project with no users yet — if so, `0` is acceptable and expected); the function exists.
- **FAIL:** Table missing, function missing, or `backfilled_rows = 0` on a project you know has existing users (indicates the backfill's `SELECT` didn't match anything — likely a join condition issue worth investigating before proceeding).
- **Decision:** PASS → CONTINUE to Migration 3. FAIL → **STOP** — Migration 3's `fn_sync_last_login` has a hard dependency on this table existing; do not proceed until resolved.

**Rollback guidance:** If the table was created but the backfill produced wrong data, the backfill itself is safe to re-run (idempotent via `ON CONFLICT DO NOTHING` — it will not duplicate or double-count, though it also won't *correct* already-inserted rows; a correction would need a targeted `UPDATE`, not a blind re-run). Full reversal: `DROP FUNCTION fn_upsert_user_acquisition; DROP TABLE user_acquisition;` — only if genuinely necessary, since by the time Migrations 3-5 run, other objects reference this table.

---

## Migration 3 — `20260713_auth_daily_rollup.sql`

**Purpose:** Create the Authentication Analytics rollup fact and the two cron-callable aggregation functions, including the F1 `SECURITY DEFINER` fix.

**Expected objects created/modified:**
- New table `public.auth_daily_rollup` (grain: `snapshot_date` × `platform` × `method`; columns `signups`, `logins_success`, `logins_failed`, `first_logins`, `returning_logins`, `unique_users`).
- Index on `snapshot_date`.
- RLS enabled, deny-by-default.
- New function `fn_rollup_auth_daily(p_from date, p_to date)` — set-based aggregation over `user_events`, idempotent recompute-overwrite.
- New function `fn_sync_last_login()` — **must be `SECURITY DEFINER`** (the F1 fix) with `search_path` pinned; writes `user_acquisition.last_login_at` from `auth.users`.

**Verification SQL:**
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='auth_daily_rollup') as table_exists;
select proname, prosecdef from pg_proc where proname in ('fn_rollup_auth_daily','fn_sync_last_login');
```
- **PASS:** `table_exists = true`; both functions exist; `fn_sync_last_login`'s `prosecdef = true` (confirms the F1 fix is live, not an old pre-fix version).
- **FAIL:** Table or either function missing, **or** `fn_sync_last_login` exists with `prosecdef = false` (would mean the F1 fix did not take effect — this specific check matters more here than a generic existence check, since this is the one migration in this batch carrying a previously-identified defect fix).
- **Decision:** PASS → CONTINUE to Migration 4. FAIL → **STOP.** If `prosecdef = false` specifically, do not proceed — re-apply this file (its `CREATE OR REPLACE FUNCTION` is safe to re-run) and re-check before continuing; this is the exact regression the F1 fix was meant to prevent.

**Rollback guidance:** `DROP FUNCTION fn_rollup_auth_daily; DROP FUNCTION fn_sync_last_login; DROP TABLE auth_daily_rollup;` if full reversal is needed. A wrong/pre-fix function body is always safe to correct via re-running `CREATE OR REPLACE FUNCTION fn_sync_last_login(...)` from this file — no DROP needed for that specific fix.

---

## Migration 4 — `20260714_activation_dimension.sql`

**Purpose:** Extend `user_acquisition` with the two Activation columns and add the first-write-wins activation writer function.

**Expected objects created/modified:**
- `ALTER TABLE public.user_acquisition ADD COLUMN activated_at timestamptz, ADD COLUMN activation_rule_version text` (both nullable, no default, no backfill — correct, since pre-instrumentation users genuinely have no activation history to reconstruct).
- New function `fn_upsert_activation(p_user_id, p_activated_at, p_activation_rule_version)` — first-write-wins, guarded by `WHERE activated_at IS NULL` (sibling to `fn_upsert_user_acquisition`, does not modify it).

**Verification SQL:**
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='user_acquisition' and column_name in ('activated_at','activation_rule_version');
select exists (select 1 from pg_proc where proname = 'fn_upsert_activation') as fn_exists;
```
- **PASS:** Both columns returned; `fn_exists = true`.
- **FAIL:** Either column missing, or the function missing.
- **Decision:** PASS → CONTINUE to Migration 5. FAIL → **STOP** — Migration 5's `fn_rollup_activation_daily` reads these exact columns; do not proceed until they exist.

**Rollback guidance:** `DROP FUNCTION fn_upsert_activation; ALTER TABLE user_acquisition DROP COLUMN activated_at, DROP COLUMN activation_rule_version;` — safe, since these columns are nullable and additive; dropping them does not affect any Authentication Analytics column or function (confirmed independent in every prior implementation report).

---

## Migration 5 — `20260714_activation_daily_rollup.sql`

**Purpose:** Create the Activation Analytics rollup fact and its aggregation function.

**Expected objects created/modified:**
- New table `public.activation_daily_rollup` (grain: `snapshot_date` × `platform` × `signup_source` × `rule_version`; columns `signups_in_cohort`, `activated_count`, `activated_within_7d_count`, `avg_time_to_activation_seconds`).
- Index on `snapshot_date`.
- RLS enabled, deny-by-default.
- New function `fn_rollup_activation_daily(p_from date, p_to date)` — set-based GROUP BY over `user_acquisition`, idempotent recompute-overwrite; non-activated signups land under `rule_version='none'`.

**Verification SQL:**
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='activation_daily_rollup') as table_exists;
select exists (select 1 from pg_proc where proname = 'fn_rollup_activation_daily') as fn_exists;
```
- **PASS:** Both `true`.
- **FAIL:** Either `false`.
- **Decision:** PASS → **this completes all 5 migrations — proceed to the final checklist below.** FAIL → **STOP** — this is the last migration; nothing further depends on it, so investigate and re-apply this file alone once resolved.

**Rollback guidance:** `DROP FUNCTION fn_rollup_activation_daily; DROP TABLE activation_daily_rollup;` — fully independent of everything except reading (not writing) `user_acquisition`'s Activation columns; dropping it has zero impact on Migrations 1–4's objects.

---

## Cross-cutting notes for execution

- **Run each file in the Supabase SQL editor as a single paste-and-run** (not split into individual statements) so the editor's default single-transaction behavior gives you automatic rollback-on-error for that file, per the rollback guidance above.
- **Do not skip a verification query.** Each one is fast (all are simple catalog lookups, not data scans) and is the only objective evidence that the specific PASS/FAIL/STOP decision above can be made correctly.
- **Do not apply Migration 3 before confirming Migration 2's PASS**, and **do not apply Migration 5 before confirming Migration 4's PASS** — these are the two specific ordering violations the filenames alone would not prevent (per the Step 1 Readiness Report's R1 finding).
- If any migration's verification shows **FAIL**, stop the entire sequence at that point — do not attempt to "skip ahead" to a later migration hoping it will still work; every later migration in this batch has a real dependency on the one(s) before it.

---

## Final checklist before proceeding to Step 4 (Deployment)

- [ ] All 5 migrations applied, in the exact order above, each with a recorded PASS on its verification query.
- [ ] `fn_sync_last_login` specifically confirmed `prosecdef = true` (F1 fix live) — recorded from Migration 3's verification.
- [ ] `user_acquisition.backfilled_rows` recorded from Migration 2's verification (for later cross-reference — e.g. confirming Step 5's live-signup counts make sense against this baseline).
- [ ] No STOP was hit at any point without being explicitly resolved and re-verified before continuing.
- [ ] Confirm once more (quick repeat of Step 1's Q6–Q10 style checks, or simply re-running this document's 5 verification queries in sequence) that all 5 objects now exist together, consistently — i.e. the database is in the fully-migrated state, not a partial one.
- [ ] Re-confirm Step 2's environment variables are still correctly set in Production (no unrelated change occurred between Step 2 and now) — **remember `NEXT_PUBLIC_SITE_URL`'s fix only takes effect on the next deploy, which is Step 4** — this is expected, not a blocker, but should not be mistaken for "already fixed in the live app."
- [ ] No code has been changed, and no deployment has occurred, as a side effect of this step — Step 3 is database-only.

**Step 3 is considered complete and ready for Step 4 only when every box above is checked with real evidence, not assumed.**

---

*This document defines Step 3's execution plan only. No migration has been applied yet, no code changed, no deployment performed. Waiting for your approval before any migration is actually run (and, per your established preference, whether you'd like me to execute this via the connected browser, one migration at a time with your confirmation between each, or run it yourself and report back).*
