# Analytics Platform — Deployment Runbook (Steps 1–4)

**Purpose:** Exact, copy-pasteable steps for you to execute directly (Supabase SQL editor + Vercel dashboard) covering Steps 1–4 of the approved plan. I am not executing any of this — no database or deployment access exists in this session. Paste the results back to me after each step and I'll confirm it's safe to proceed to the next one.

**Do not skip the "Verify" query after each migration file** — that's what turns "I ran it" into the objective PASS/FAIL evidence the Verification Plan requires.

---

## Step 1 — Verify current live migration state (run FIRST, before anything else)

Run this in the Supabase SQL editor. It only reads — nothing is changed.

```sql
-- 1a. Confirm Phase 0 is live (should already be true)
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='admin_roles') as phase0_admin_roles_exists;
select count(*) as super_admin_count from public.admin_roles where role = 'super_admin' and (expires_at is null or expires_at > now());

-- 1b. Confirm the 5 pending migrations are NOT yet applied (expect all `false`/0)
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_events' and column_name='event_id') as envelope_applied;
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_acquisition') as user_acquisition_applied;
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='auth_daily_rollup') as auth_rollup_applied;
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_acquisition' and column_name='activated_at') as activation_dimension_applied;
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='activation_daily_rollup') as activation_rollup_applied;
```

**Paste me the 7 result values.** If `phase0_admin_roles_exists = false` or `super_admin_count = 0`, **stop** — that's a separate, more serious problem (Phase 0 not actually live) and we should not proceed to Analytics deployment until that's resolved. If any of the 5 "pending" checks unexpectedly return `true`, **stop and tell me which one** — it means that migration was already partially applied outside this plan's tracking, and I'll help you figure out safely from there instead of blindly re-running it.

---

## Step 2 — Verify required production environment variables

This is a Vercel Dashboard check, not SQL. Go to your Vercel project → **Settings → Environment Variables**, filtered to the **Production** environment (not Preview/Development), and confirm all four exist with non-empty values:

| Variable | What to check |
|---|---|
| `CRON_SECRET` | Set, non-empty. (Shared with several other crons — if it's already working for those, it's fine here too.) |
| `NEXT_PUBLIC_SITE_URL` | Set to your **exact** production origin, including `https://` and the correct `www` vs. apex domain (e.g. if your real site is `https://www.tappyai.vn`, this must say exactly that, not `https://tappyai.vn`). **This is the single most likely misconfiguration** — it silently 403s every dashboard request from a real browser while looking fine in every other test. |
| `NEXT_PUBLIC_SUPABASE_URL` | Set, matches your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Set, non-empty (this is a secret — just confirm it exists, don't paste its value to me). |

**Tell me: all 4 confirmed present and correct? (yes/no, and if no, which one).**

---

## Step 3 — Apply the 5 pending migrations, ONE AT A TIME, in this exact order

**Do not use any "apply all pending migrations" bulk action — it will apply these in the wrong (alphabetical) order and can fail. Open each file below, copy its full contents, paste into the Supabase SQL editor, and run it individually — then run the matching verify query — before moving to the next file.**

### 3.1 — `supabase/migrations/20260713_analytics_envelope_foundation.sql` (66 lines)
Run the full file contents. Then verify:
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_events' and column_name='event_id') as ok;
```
Expect `ok = true`. **Paste the result before continuing.**

### 3.2 — `supabase/migrations/20260713_user_acquisition_dimension.sql` (103 lines)
Run the full file contents (this also runs a one-time backfill — expect it to take a few seconds if you have existing users). Then verify:
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_acquisition') as table_ok;
select count(*) as backfilled_rows from public.user_acquisition;
```
**Paste both results before continuing.**

### 3.3 — `supabase/migrations/20260713_auth_daily_rollup.sql` (77 lines)
Run the full file contents (this is the file with the F1 `SECURITY DEFINER` fix already included). Then verify:
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='auth_daily_rollup') as table_ok;
select prosecdef as fn_sync_last_login_is_security_definer from pg_proc where proname = 'fn_sync_last_login';
```
Expect `table_ok = true` and `fn_sync_last_login_is_security_definer = true` (confirms the F1 fix took effect). **Paste both results before continuing.**

### 3.4 — `supabase/migrations/20260714_activation_dimension.sql` (39 lines)
Run the full file contents. Then verify:
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_acquisition' and column_name='activated_at') as ok;
```
Expect `ok = true`. **Paste the result before continuing.**

### 3.5 — `supabase/migrations/20260714_activation_daily_rollup.sql` (64 lines)
Run the full file contents. Then verify:
```sql
select exists (select 1 from information_schema.tables where table_schema='public' and table_name='activation_daily_rollup') as ok;
```
Expect `ok = true`. **Paste the result — this completes Step 3.**

---

## Step 4 — Deploy

1. Deploy this branch (`feat/backoffice-phase0`, or wherever it's merged to for production) via your normal Vercel deploy flow (git push to the production branch, or the Vercel dashboard's deploy button).
2. After deploy completes, go to the Vercel dashboard → **Cron Jobs** tab and confirm `/api/cron/analytics-snapshot` is listed with schedule `5 17 * * *`.
3. **Do not manually trigger the cron yet** — let it fire naturally at 00:05 VN, or tell me if you'd like to trigger it manually first (it's safe to do so — every stage is idempotent — but I'd rather you confirm you want to before we generate real production data ahead of schedule).

**Tell me once deploy is live and the cron entry is visible — that completes Steps 1–4. I'll then help structure execution of Step 5 (the full Verification Checklist) and draft the final Production Deployment Report (Steps 6–7) once you've gathered the evidence.**
