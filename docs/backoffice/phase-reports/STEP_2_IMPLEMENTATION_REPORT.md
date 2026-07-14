# Step 2 — `user_acquisition` Dimension + Backfill — Implementation Report

**Status:** Implemented + verified (code-level). **Production Verification Pending · Owner Approval Pending.** Migration not applied.
**Scope:** Step 2 only — the permanent acquisition dimension + one-time backfill + the reusable writer. **No** `auth_daily_rollup`, cron wiring, service reads, APIs, dashboards, or reports (those are Step 3+).
**Governance:** Analytics v1.1 implementation (spec §2.1). No architecture change, no ADR. Honors SR-1 (single source of truth), SR-2 (platform-agnostic), SR-3 (feeds one platform), SR-4 (merge logic once).

## 1. What was implemented
| Artifact | Purpose |
|---|---|
| `supabase/migrations/20260713_user_acquisition_dimension.sql` | Table + indexes + RLS + merge function + one-time backfill |
| `src/lib/admin/analytics/userAcquisitionService.ts` | Reusable writer: pure mappers (`acquisitionFromSignupEvent`, `acquisitionFromLoginEvent`, `toRpcParams`) + `upsertAcquisition()` |
| `src/lib/admin/analytics/userAcquisitionService.test.ts` | 8 unit tests (mappers + writer with mock client) |

**SR-4:** the merge logic (first-write-wins for acquisition attributes; earliest `first_login_at`, latest `last_login_at`) lives **once** in the SQL function `fn_upsert_user_acquisition`. The backfill, the service, and the future Step 3 cron all call it — no duplicated logic.

## 2. Database changes
- **New table `user_acquisition`** (PK `user_id` → `profiles`): `anon_id, signup_method, signup_platform, signup_app_version, signup_device_type, signup_country, signup_language, acquisition_source, signup_at, first_login_at, last_login_at, created_at, updated_at`.
- **Indexes:** `signup_method`, `signup_platform`, `acquisition_source`, `signup_at` (+ PK on `user_id` for correlation JOINs).
- **RLS:** enabled, deny-by-default (no policies) — written/read only via the service-role client (04 §8).
- **Function `fn_upsert_user_acquisition(...)`** — idempotent merge (SR-4).
- **One-time backfill** (in the migration).
- **Additive + idempotent:** no existing table/column/constraint touched; `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, backfill `ON CONFLICT DO NOTHING`.

## 3. Backfill strategy
One-time SQL (`INSERT … SELECT … ON CONFLICT DO NOTHING`) over existing users:
- Source: `auth.users` ⋈ `public.profiles` (only users with a profile — the FK requires it).
- `signup_method` = the user's **first auth identity provider** (`auth.identities`, earliest), else `'unknown'`.
- `signup_platform` / `signup_app_version` / `signup_device_type` = `'unknown'` (no envelope existed for historical events).
- `signup_at` = `auth.users.created_at`; `first_login_at` = `created_at` (proxy); `last_login_at` = `auth.users.last_sign_in_at` (authoritative).
- **Idempotent:** re-running inserts nothing for already-present users.
- **Ongoing population is Step 3** (a cron reads `auth_*` events and calls `upsertAcquisition`). The service + merge function are ready for it now.

## 4. Backward compatibility
- New table + function + test only. **No** change to any existing table, column, API, event, or tracker.
- Static suite green: `tsc` ✅ · `lint` ✅ · `build` ✅ · **32 tests (24 prior + 8 new)** ✅ · `architecture:check` 7/7 ✅.
- The service's admin-client import is **lazy** (only when no client is injected), keeping the pure functions dependency-free and unit-testable.

## 5. Performance impact
- **Storage:** one row per user (~120–160 B) + 4 secondary indexes. Tiny relative to `user_events`.
- **Backfill:** a single set-based `INSERT … SELECT` with a correlated subquery per user — one-time; scales linearly with user count.
- **Writes:** `fn_upsert_user_acquisition` is one `INSERT … ON CONFLICT` (O(1) per call); called per signup/login by the future cron (not per raw event).
- **Reads / correlation:** all future correlation is `JOIN user_acquisition USING (user_id)` on the PK — index-only. The `signup_method`/`platform`/`source` indexes serve dashboard group-bys.
- **Existing queries:** unaffected — brand-new table, nothing else changed.

## 6. Known limitations
- **Historical envelope unknown:** backfilled `signup_platform`/`app_version`/`device_type` = `'unknown'` (no envelope for past users).
- **Historical `signup_method` is best-effort:** derived from `auth.identities.provider`. Zalo (a custom, non-Supabase-OAuth flow) and other custom historical users may show `'email'`/`'unknown'` rather than `'zalo'`.
- **Historical timestamps are proxies:** `signup_at`/`first_login_at` = account `created_at`, not the true first-login event time.
- **Gap until Step 3:** the backfill covers users existing at apply time. **New signups after the backfill have no row until the Step 3 cron wires ongoing population.** The writer (`upsertAcquisition`) exists but is **not yet called by anything** (by design — Step 3).
- **Migration not applied yet** (owner-gated); until applied, the table/function/backfill don't exist in the DB.

## 7. Production Verification checklist (run after migration applied)
```sql
-- structure + backfill coverage
select count(*) as acquisition_rows from public.user_acquisition;
select count(*) as eligible_users from auth.users u join public.profiles p on p.id=u.id;   -- should match
-- sample: method distribution + unknown platform for historical
select signup_method, signup_platform, count(*) from public.user_acquisition group by 1,2 order by 3 desc;
-- correlation JOIN works (users by acquisition method)
select ua.signup_method, count(*) from public.user_acquisition ua
  join public.profiles p on p.id = ua.user_id group by 1;
```
- [ ] Table + 4 indexes + RLS present; direct anon `select` denied.
- [ ] Backfill row count = eligible users (users with a profile); re-run migration → no new rows (idempotent).
- [ ] Sample rows: `signup_method` matches identity provider; historical `signup_platform='unknown'`; `last_login_at` = `last_sign_in_at`.
- [ ] `fn_upsert_user_acquisition` idempotency + first-write-wins: call twice for one user with different signup_method → the **first** value is kept; `last_login_at` advances to the latest.
- [ ] Correlation JOIN returns per-method counts (proves SR-1 usability with no duplicated data).
- [ ] No regression in existing analytics reads (new table only).

## 8. Not done (out of scope — Step 3+)
`auth_daily_rollup`, the analytics-snapshot cron wiring that calls `upsertAcquisition`, `authAnalyticsService`, APIs, dashboards, reports.

---
*Phase 0 held; `8e68f42` awaits S6/S7; Step 1.0 & Step 1 migrations not yet applied. No Step 3 until this is reviewed and approved.*
