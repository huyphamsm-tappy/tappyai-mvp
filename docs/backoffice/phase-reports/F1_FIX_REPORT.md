# F1 Fix Report — `fn_sync_last_login` SECURITY DEFINER

**Status:** Implemented (code-level). Not yet applied to any database. **Owner approval pending for next step (apply/deploy).**
**Source finding:** `AUTH_ANALYTICS_AUDIT.md` §3, F1 (Medium).

## Change
File: `supabase/migrations/20260713_auth_daily_rollup.sql`, function `public.fn_sync_last_login()`.

Added two clauses to the existing function definition:
```sql
CREATE OR REPLACE FUNCTION public.fn_sync_last_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  UPDATE public.user_acquisition ua
  SET last_login_at = u.last_sign_in_at, updated_at = now()
  FROM auth.users u
  WHERE u.id = ua.user_id
    AND u.last_sign_in_at IS DISTINCT FROM ua.last_login_at;
$$;
```
`SECURITY DEFINER` makes the function execute with the privileges of its owner (`postgres`, which owns/can read `auth.users`) instead of the caller (`service_role` via cron RPC), so the `auth.users` read cannot silently fail on a missing grant. `SET search_path` is the required hardening companion for any `SECURITY DEFINER` function (prevents search-path hijacking). No other line, signature, call site, or behavior changed.

## Scope discipline
- Only this one function was touched.
- No changes to: event emission, tracking pipeline, `user_acquisition`/`auth_daily_rollup` schemas, `fn_rollup_auth_daily`, `fn_upsert_user_acquisition`, the cron route, `authAnalyticsService`, the API, the dashboard, or any test.
- No new feature, no architecture change, no ADR required (pure robustness fix within the frozen v1.1 design).

## Verification (re-run in full)
| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Clean (SQL-only change, no TS impact) |
| `next lint` | ✅ Clean — only pre-existing warnings in unrelated files (`admin/analytics/page.tsx`, `chat/page.tsx`, etc.), none in touched file |
| `npm test` (vitest) | ✅ 81/81 passing (10 files) — unchanged, as expected for a SQL migration edit |
| `npm run build` | ✅ Compiled successfully, all routes emitted incl. `/admin/analytics/auth` and `/api/admin/analytics/auth` |
| `architecture:check` | ✅ 7/7 rules passed |

## Cron correctness check
Re-read `src/app/api/cron/analytics-snapshot/route.ts`: it calls `fn_sync_last_login` via RPC with no parameters and treats a thrown error as `lastLoginError` in its response without failing the whole run — unchanged by this fix. The `SECURITY DEFINER` change does not alter the function's signature (`RETURNS void`, no args), so the RPC call site requires no update. Logically, the fix only changes *whose privileges* the `UPDATE ... FROM auth.users` runs with — the query itself, its idempotency (`IS DISTINCT FROM` guard), and its interaction with the rollup/upsert steps are untouched.

## Documentation updated
- `AUTH_ANALYTICS_AUDIT.md`: F1 marked ✅ FIXED (code-level); Final Score raised 8.5 → 9.0; Go/No-Go gate updated (F1 fix no longer a pending action); Production Verification Checklist updated to include confirming `fn_sync_last_login` runs cleanly as `service_role` post-apply.

## Not done (explicitly out of scope per instruction)
F2 (cron `.limit(5000)` silent cap) and F3 (dashboard shared error state) — **not implemented**. No new features. No migration applied to any environment.

---
*Stopping after F1. Awaiting owner review/approval before any further action (including applying this migration or proceeding to F2/F3 or the next analytics module).*
