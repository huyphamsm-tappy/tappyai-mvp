# Step 3 — `auth_daily_rollup` + analytics-snapshot cron — Implementation Report

**Status:** Implemented + verified (code-level). **Production Verification Pending · Owner Approval Pending.** Migrations not applied; cron not deployed.
**Scope:** Step 3 only — the rollup fact, its aggregation, and the cron that populates it (and completes ongoing `user_acquisition` population). **No** APIs, dashboards, UI, reports, `authAnalyticsService`.
**Governance:** Analytics v1.1 implementation (spec §2.2). No architecture change, no ADR. Honors SR-1…SR-4.

## 1. What was implemented
| Artifact | Purpose |
|---|---|
| `supabase/migrations/20260713_auth_daily_rollup.sql` | `auth_daily_rollup` table + `fn_rollup_auth_daily` + `fn_sync_last_login` |
| `src/app/api/cron/analytics-snapshot/route.ts` | The cron: rollup + `user_acquisition` population + last-login sync |
| `src/lib/admin/analytics/rollupWindow.ts` | Pure `reconcileWindow()` (VN-day window, ADR-008) |
| `src/lib/admin/analytics/rollupWindow.test.ts` | 4 unit tests |
| `vercel.json` | Cron schedule `5 17 * * *` (00:05 VN = 17:05 UTC) |

## 2. Database changes
- **`auth_daily_rollup`** (grain **VN-day × platform × method**, spec §2.2): `signups, logins_success, logins_failed, first_logins, returning_logins, unique_users`, `UNIQUE(snapshot_date, platform, method)`, index on `snapshot_date`, RLS deny-by-default.
- **`fn_rollup_auth_daily(p_from, p_to)`** — aggregates `user_events` auth rows over the VN-day window and **UPSERTs** (recompute-and-overwrite → idempotent + reconciles late events). Day bucketing `AT TIME ZONE 'Asia/Ho_Chi_Minh'` (ADR-008).
- **`fn_sync_last_login()`** — set-based `last_login_at ← auth.users.last_sign_in_at` (authoritative, spec §2.1); only touches changed rows.
- **Reuses Step 2's `fn_upsert_user_acquisition`** (via the TS service in the cron) — the merge logic is **not** re-implemented (SR-4).
- **Additive + idempotent**; depends on Step 1.0 (envelope on `user_events`) + Step 2 (`user_acquisition` + `fn_upsert`). **Apply order: Step 1.0 → Step 2 → Step 3.**

## 3. Cron behaviour — incremental & idempotent
Each run (00:05 VN), over a **trailing 4 VN-day window** (`reconcileWindow`):
1. `fn_rollup_auth_daily(from,to)` — recompute the window's rollup rows (overwrite → idempotent; late events reconciled, §8A.4).
2. **`user_acquisition` ongoing population** — read `auth_signup_completed` events in the window, map with the **Step 2** `acquisitionFromSignupEvent`, write via **Step 2** `upsertAcquisition` (first-write-wins → idempotent). *This closes the Step-2 "gap until Step 3": new signups now get acquisition rows.*
3. `fn_sync_last_login()` — refresh `last_login_at` from `auth.users`.

**Every step is safe to re-run:** recompute-overwrite (rollup), first-write-wins (acquisition), only-if-changed (last login). Reprocessing the window causes no drift or duplication.

## 4. Reuse & non-duplication (SR-1…SR-4)
- **SR-4:** merge logic once (`fn_upsert_user_acquisition`, Step 2); aggregation once (`fn_rollup_auth_daily`); the cron **reuses** the Step 2 mapper + writer — no logic duplicated.
- **SR-1:** `user_acquisition` remains the single source of truth; rollup + acquisition both key by `user_id` (correlatable by JOIN).
- **SR-2:** `platform` is a rollup **dimension**; one aggregation for all platforms, no platform-specific code.
- **SR-3:** the rollup + dimension feed the one analytics platform (future Founder/Investor/Product views consume them).

## 5. Backward compatibility
- New table + functions + cron + pure util only. **No** existing table, column, API, event, tracker, or cron changed.
- Static suite green: `tsc` ✅ · `lint` ✅ · `build` ✅ · **36 tests (32 prior + 4 new)** ✅ · `architecture:check` 7/7 ✅.

## 6. Performance impact
- **Rollup:** one `GROUP BY` over auth-typed `user_events` in a 4-day window — served by the Step 1.0 indexes (`created_at`, `(event_type, created_at)`). Overwrites a handful of `(date,platform,method)` rows.
- **Acquisition:** per-signup `upsert` bounded to signups-in-window (`limit 5000`). At MVP this is small; a set-based version is a documented future optimization.
- **Last-login sync:** single set-based `UPDATE … WHERE IS DISTINCT FROM` (touches only changed rows).
- **Cron:** `maxDuration = 60s`; daily. No impact on request-path latency; no impact on existing queries (new objects only).

## 7. Known limitations
- **`unique_users`** counts distinct **non-null** `user_id` — anonymous failures (no `user_id`) are excluded; it means unique *authenticated* users per day/platform/method.
- **Reconcile window = 4 days.** Events arriving >4 days late are not re-rolled (acceptable per §8A.4's 3-day guidance).
- **Acquisition ongoing population** is driven off `auth_signup_completed` events + `auth.users` for last-login; `first_login_at` uses the signup event time (proxy), consistent with Step 2.
- **Vercel cron limits:** this adds a 4th `crons` entry — subject to the Vercel plan's cron allowance (ops concern).
- **Not live until:** all three migrations applied (1.0 → 2 → 3), `CRON_SECRET` set, and deployed. Until then the cron 401s / no rollup exists.

## 8. Production Verification checklist (after migrations applied + deployed)
```sql
-- rollup populated for recent VN days
select snapshot_date, platform, method, signups, logins_success, logins_failed,
       first_logins, returning_logins, unique_users
from public.auth_daily_rollup order by snapshot_date desc, method limit 30;
```
- [ ] Trigger the cron with `Authorization: Bearer $CRON_SECRET` → `200 { ok:true, window, acquisitionProcessed, … }`; wrong/no secret → `401`.
- [ ] `auth_daily_rollup` has rows for the window; counts reconcile to `user_events` auth rows (per day/platform/method).
- [ ] **Idempotency:** run the cron twice → identical rollup rows (no drift/duplication).
- [ ] **Late-event reconcile:** insert a backdated auth event within the window → next run updates that day's counts.
- [ ] `user_acquisition` now has rows for **new** signups (Step-2 gap closed); `last_login_at` matches `auth.users.last_sign_in_at`.
- [ ] Correlation still works: `auth_daily_rollup` by `method`/`platform`; `user_acquisition` JOINed by `user_id`.
- [ ] No regression in existing crons / analytics reads.

## 9. Not done (out of scope — Step 4+)
`authAnalyticsService` (read/query service), `/api/admin/analytics/auth` API, Authentication Dashboard, Founder/Investor integration, Reports/Export.

---
*Phase 0 held; `8e68f42` awaits S6/S7; migrations (1.0 → 2 → 3) not yet applied. No Step 4 until you review and approve Step 3.*
