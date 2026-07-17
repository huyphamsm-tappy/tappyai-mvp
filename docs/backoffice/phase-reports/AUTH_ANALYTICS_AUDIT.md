# Authentication Analytics — Full Module Audit & Production Readiness Review

**Scope:** Steps 1.0 → 6 audited as one end-to-end system. No implementation, no architecture change, no next module.
**Method:** static re-read + cross-layer data-flow tracing (event → track → tables → rollup → cron → service → API → UI) + SR-1…SR-4 compliance + duplication/security/scalability review.
**Result:** No *blocking* (No-Go) issues. **1 Medium** + **2 Low** defects found (fixes proposed, **not applied**, awaiting approval). Module marked *Code-Verified · Production-Verification Pending · Owner-Approval Pending*.

---

## 1. Architecture Audit Report

### 1.1 End-to-end pipeline — component-by-component

| # | Stage | Artifact | Verified behaviour | Verdict |
|---|---|---|---|---|
| 1 | **Event emission** | `src/lib/analytics/authEvents.ts`, `src/hooks/useAuthEvents.ts`, instrumented login/register/SignOut/TrackingProvider | Emits `auth_signup_completed{method}`, `auth_login_completed{method,is_first_login}`, `auth_login_failed{method,reason}`, `auth_logout_completed`. PENDING/EMITTED sessionStorage guards prevent duplicate emission across the `onAuthStateChange` listener. `method` vocab fixed (google/zalo/apple/email_otp/email/facebook). | ✅ |
| 2 | **Tracking pipeline** | `src/lib/tracking/{envelope,tracker}.ts`, `src/app/api/track/route.ts`, `20260713_analytics_envelope_foundation.sql` | Envelope (event_id idempotency, schema_version, platform/app_version/device_type, anon_id, client_timestamp) attached client-side; `/api/track` accepts anon+authed, `upsert onConflict event_id ignoreDuplicates`, caps 100 events/8 KB, 600/min rate limit, PII regex reject, forward-compat `is_unknown_event`. Table `user_events` reconciled (envelope cols + `UNIQUE(event_id)`, restrictive CHECK dropped, indexes). | ✅ |
| 3 | **user_acquisition (SR-1)** | `20260713_user_acquisition_dimension.sql`, `userAcquisitionService.ts` | PK `user_id → profiles`. `fn_upsert_user_acquisition` = first-write-wins `COALESCE` + `LEAST(first_login)` / `GREATEST(last_login)`. One-time backfill from `auth.users ⋈ profiles ⋈ auth.identities` with `unknown` sentinels + `ON CONFLICT DO NOTHING`. Service maps signup/login events → RPC params (lazy admin import keeps pure fns dependency-free). | ✅ |
| 4 | **auth_daily_rollup** | `20260713_auth_daily_rollup.sql` | Grain VN-day × platform × method. `fn_rollup_auth_daily(from,to)` GROUP BY over `user_events` auth rows; `is_first_login` read as `metadata->>'is_first_login' = 'true'` (confirmed correct — jsonb bool → text `'true'`); ON CONFLICT recompute-overwrite (idempotent re-run). `unique_users = count(distinct user_id)` (nulls from failed logins correctly ignored). RLS deny. | ✅ |
| 5 | **Analytics cron** | `src/app/api/cron/analytics-snapshot/route.ts`, `rollupWindow.ts`, `vercel.json` `5 17 * * *` (00:05 VN) | `CRON_SECRET` bearer; reconcile 4-VN-day window (late events); calls `fn_rollup_auth_daily`, reuses Step-2 `upsertAcquisition` on signup events, calls `fn_sync_last_login`. Per-stage errors captured in the JSON response (no crash). | ⚠️ *(F1, F2)* |
| 6 | **authAnalyticsService (SR-4)** | `src/lib/admin/analytics/authAnalyticsService.ts` | Single source of KPIs (`loginSuccessRate`, `firstLoginConversion`) + aggregations (summarize/provider/platform/dailyTrend/acquisition). Thin `fetchRollup`/`fetchAcquisition` (lazy admin client). VN-day-aligned range filters (`+07:00`). `unique_users` excluded from summable summary. | ✅ |
| 7 | **Auth Analytics API** | `src/app/api/admin/analytics/auth/{route,schema}.ts` | Thin GET: `requireAdminRole('analyst')` → same-origin (403) → rate limit 100/min (429) → Zod validate (422) → dispatch by `view` → `{data}` / `{data,meta.page}`. No SQL/KPI/aggregation duplicated — pure passthrough to the service. | ✅ |
| 8 | **Dashboard UI** | `authAnalyticsClient.ts` + `components/admin/analytics/*` + `app/admin/analytics/auth/page.tsx` | Data **only** via client → API → service (no direct DB, no UI-side KPI). Presentational components (props-only) → Founder/Investor-reusable. RBAC `analyst` page-guard. Loading/empty/error/responsive states. | ⚠️ *(F3)* |

### 1.2 Standing-Rule compliance

- **SR-1 (single source of truth):** ✅ `user_acquisition` is the only per-user dimension; every layer correlates by `user_id` (JOIN), never re-derives or duplicates acquisition attributes. Merge is centralized in `fn_upsert_user_acquisition`.
- **SR-2 (cross-platform parity):** ✅ Identical `event_type`/`properties`/aggregation regardless of origin; `platform` is a column/dimension only. One pipeline; no platform-specific branches. (Native emission remains a documented downstream contract, not a separate implementation.)
- **SR-3 (one unified platform):** ✅ Founder/Investor will consume the *same* API + the *same* presentational components + the *same* metric definitions; only the composed view differs.
- **SR-4 (reusable services / logic-once):** ✅ KPI math exists once (`authAnalyticsService`); aggregation/merge exist once in SQL functions; API and UI are thin. No duplicated SQL, KPI, or filtering logic found across layers.

### 1.3 Duplication & reuse review
- **SQL duplication:** none. `fn_rollup` (aggregate), `fn_upsert` (merge), `fn_sync_last_login` (last-login) each defined once; the service issues only simple filtered SELECTs, not re-aggregation.
- **KPI duplication:** none. Rates computed once in the service; the UI only *formats* (`formatPct`/`formatInt`).
- **Component reuse:** `AuthBreakdownTable` is generic (`Column<T>`) and serves provider/platform/acquisition; chart reuses the legacy dependency-free div-bar approach (no new lib).

### 1.4 API consistency
Standard envelope (`{data}` / `{data,meta}` / `{error:{code,message}}`) honored; list views expose `meta.page.hasMore`; error codes consistent with Phase 0 (`UNAUTHENTICATED`/`FORBIDDEN`/`VALIDATION`/`RATE_LIMITED`). ✅

---

## 2. Production Readiness Report

| Dimension | Assessment | Rating |
|---|---|---|
| **RBAC** | Page + API both gate at `analyst` (hierarchy: super_admin>admin>moderator>analyst). Cron gated by `CRON_SECRET`. Writes use service-role admin client only. | ✅ Strong |
| **Security** | Same-origin check, per-route rate limits (track 600/min, API 100/min), Zod validation (422), PII regex on ingest, no PII in analytics payloads (`method`/`platform`/uuid only), new tables RLS-deny (service-role only). | ✅ Strong |
| **Performance** | UI/API read **pre-aggregated** rollup + indexed dimension; parallel fetch; 25/page. Rollup filters `snapshot_date` (indexed); acquisition filters `signup_at`/`method`/`platform`/`source` (indexed). | ✅ Good |
| **Scalability** | Incremental reconcile window (not full-table); idempotent recompute. Per-signup upsert loop + `limit(5000)` are the ceiling (F2 / TD-2). | ⚠️ Adequate for MVP |
| **Maintainability** | Clear layering, per-step reports, 81 tests, `architecture:check` 7/7, no cross-layer leakage. | ✅ Strong |
| **Production-verified?** | **No** — migrations (1.0→2→3) not applied, nothing deployed, no live login/cron/dashboard run. | ⛔ Pending |

---

## 3. Known Issues (defects — fixes proposed, **not applied**)

> Per protocol these are reported for approval; **no code changed.**

### F1 — `fn_sync_last_login` may silently no-op on `auth.users` grants — **Severity: Medium — ✅ FIXED (2026-07-14, code-level; not yet applied to any DB)**
`fn_sync_last_login()` was `LANGUAGE sql` **without `SECURITY DEFINER`** and read `auth.users` at runtime. Called from the cron via RPC, it executes as `service_role`. Supabase restricts direct `SELECT` on `auth.users` for the API roles; if the grant is absent, the UPDATE affects 0 rows and the cron records `lastLoginError` but **does not crash** — so `last_login_at` silently stops syncing from `auth.users` (returning-user recency degrades).
*(Backfill + `fn_rollup` + `fn_upsert` are unaffected: backfill runs as `postgres` at migration time; the latter two touch only `public`.)*
**Fix applied:** function is now `SECURITY DEFINER SET search_path = public, auth, pg_temp` (owner `postgres` owns `auth.users`), guaranteeing the read regardless of caller grants. One-line change in `20260713_auth_daily_rollup.sql`. No other logic, signature, or call site changed. See `F1_FIX_REPORT.md`. Migration still **not applied** to any database — takes effect on next apply.

### F2 — Cron signup reprocessing has a silent `limit(5000)` cap — **Severity: Low**
The cron re-scans signup events in the 4-day window with a bare `.limit(5000)` and no log if the cap is hit → potential silent under-population of `user_acquisition` on a very high-signup day (violates the "no silent caps" principle).
**Proposed fix:** log the returned count and warn when `=== 5000`; or paginate by `created_at` cursor until drained. Low urgency at MVP volume.

### F3 — Dashboard shares one `error` state across all sections — **Severity: Low**
`AuthAnalyticsDashboard` sets a single `error` used by KPI/trend/provider/platform *and* acquisition; an acquisition-only fetch failure surfaces an error banner on every section.
**Proposed fix:** a separate `acqError` for the acquisition block. Cosmetic; no data impact.

*(Also carried from Step 6: sidebar highlights both "Analytics" and "Auth Analytics" on the sub-route — cosmetic active-state, not re-counted here.)*

---

## 4. Technical Debt
- **TD-1:** `acquisitionFromLoginEvent` (in `userAcquisitionService.ts`) has **no non-test caller** — `last_login` is currently synced via `fn_sync_last_login` instead. Keep as a documented reusable primitive *or* remove; decide when the login-event acquisition path is actually needed.
- **TD-2:** Acquisition population is a per-signup RPC loop (N calls/run). Fine at MVP; convert to a set-based upsert (or batched RPC) if signup volume grows.
- **TD-3:** `user_acquisition` has no index on `signup_app_version`/`signup_country`/`signup_language`; filtering the acquisition view by those does a table scan (acceptable now).
- **TD-4:** Dashboard is English-only; admin i18n (doc 18) is deferred.
- **TD-5:** Charts are dependency-free div-bars; a Recharts migration is deferred (intentional).

## 5. Future Improvements
- Add composite indexes on `user_acquisition` for the three unindexed acquisition filters if those views get heavy use.
- Emit a lightweight cron run-summary metric (rows rolled, acquisitions upserted, last-login rows synced) for observability.
- Founder/Investor dashboards to consume the exact same client + presentational components (SR-3/SR-4) — no new fetch/KPI code.
- Optional CSV/report export as a *new consumer* of `authAnalyticsService` (Step 9), not a new query path.
- `from ≤ to` range validation in the API schema (currently a reversed range just returns empty).

## 6. Production Verification Checklist (end-to-end, post-deploy)
**Migrations (in order):**
- [ ] Apply `20260713_analytics_envelope_foundation.sql` → verify `user_events` envelope cols + `UNIQUE(event_id)`.
- [ ] Apply `20260713_user_acquisition_dimension.sql` → backfill row count ≈ existing users; spot-check `LEAST/GREATEST` merge.
- [ ] Apply `20260713_auth_daily_rollup.sql` → tables + functions present, incl. `fn_sync_last_login` as `SECURITY DEFINER` (**F1 fix applied 2026-07-14**).
- [ ] After apply, confirm `fn_sync_last_login` runs without a permissions error even when invoked as `service_role` (e.g. `select fn_sync_last_login();` via the service role, or by observing the cron's `lastLoginError` field is null).

**Pipeline:**
- [ ] Deploy; perform real logins (Google + Zalo — owner-only) + a failed login + a logout.
- [ ] Confirm `user_events` rows for `auth_signup_completed` / `auth_login_completed{is_first_login}` / `auth_login_failed{reason}` / `auth_logout_completed`, envelope populated, no duplicates (idempotency).
- [ ] Trigger the cron (or wait for 00:05 VN) → `auth_daily_rollup` populated for the VN-day; `user_acquisition` upserted for new signups; `last_login_at` synced (**F1**).
- [ ] Re-run the cron → rollup values stable (idempotent), no double counting.

**Service / API / UI:**
- [ ] `GET /api/admin/analytics/auth` as analyst returns each `view`; numbers reconcile to `auth_daily_rollup`.
- [ ] Non-admin → 401/403; bad params → 422; rate limit → 429.
- [ ] `/admin/analytics/auth`: KPI cards, provider/platform tables, trend, acquisition render; filters narrow (date/platform/method across all; app_version/country/language on acquisition); Load-more paginates; empty/error states; responsive mobile/tablet/desktop.

## 7. Final Score
**9.0 / 10** (updated 2026-07-14, post-F1 fix).
Rationale: correct, layered, SR-1…SR-4-compliant, no duplication, well-tested (81), thin API/UI, strong RBAC/security. The one Medium runtime-robustness defect (F1) is now fixed at the code level. Docked for: two remaining Lows (F2, F3) and the inherent fact that the system is **not yet production-verified** (migrations unapplied, undeployed). Ceiling rises to ~9.5 after successful production verification.

## 8. Go / No-Go
**CONDITIONAL GO.** No blocking (No-Go) defects. F1 is fixed (code-level). Remaining gate before flipping to fully production-ready:
1. Apply migrations 1.0 → 2 → 3 (including the F1-fixed `fn_sync_last_login`) and deploy.
2. Execute the §6 Production Verification Checklist, including confirming `fn_sync_last_login` runs cleanly as `service_role`.
F2/F3/TD items remain non-blocking and can follow at owner's discretion.

---

## Module Status
Authentication Analytics (Steps 1.0 → 6):
- **Implemented** ✅
- **Code Verified** ✅ (tsc · lint · build · 81 tests · architecture 7/7)
- **Production Verification Pending** ⛔ (migrations unapplied, undeployed)
- **Owner Approval Pending** ⛔

*No implementation changed during this audit. F1/F2/F3 fixes await explicit approval before any edit.*
