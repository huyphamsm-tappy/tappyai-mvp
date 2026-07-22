# Step 4 — `authAnalyticsService` — Implementation Report

**Status:** Implemented + verified (code-level). **Production Verification Pending · Owner Approval Pending.**
**Scope:** Step 4 only — the reusable service (the single home for auth-analytics business logic). **No** APIs, dashboards, UI, reports, exports (Step 5+).
**Governance:** Analytics v1.1 implementation (spec §5A/§6/§7). No architecture change, no ADR. Honors SR-1…SR-4.

## 1. What was implemented
| Artifact | Purpose |
|---|---|
| `src/lib/admin/analytics/authAnalyticsService.ts` | The single source of truth for auth-analytics logic |
| `src/lib/admin/analytics/authAnalyticsService.test.ts` | 12 unit tests (KPIs, aggregations, service wiring) |

**No database changes** — the service **reads** `auth_daily_rollup` (Step 3) and `user_acquisition` (Step 2). No new SQL, aggregation, or KPI math anywhere else (SR-4).

## 2. SR-4 — single source of truth
Every auth KPI + aggregation lives here, once:
- **KPIs (pure):** `loginSuccessRate`, `firstLoginConversion`.
- **Aggregations (pure):** `summarizeRollup`, `providerBreakdown`, `platformBreakdown`, `dailyTrend`, `countAcquisitionByDimension`.
- **Data access (thin):** `fetchRollup`, `fetchAcquisition` (filters applied per source).
- **Public API:** `authAnalyticsService.{getSummary, getByProvider, getByPlatform, getDailyTrend, getAcquisitionBreakdown}`.

Consumers (dashboards, APIs, reports, exports, notifications, Founder + Investor dashboards) call these methods — they are presentation/delivery only; they contain **no** KPI/SQL logic.

## 3. Reusable methods (what consumers call)
| Method | Returns | Source |
|---|---|---|
| `getSummary(filter)` | totals + `login_success_rate` + `first_login_conversion` | rollup |
| `getByProvider(filter)` | per-`method` signups/logins/failures + success rate | rollup |
| `getByPlatform(filter)` | per-`platform` breakdown | rollup |
| `getDailyTrend(filter)` | per-day time series (+ per-day `unique_users`) | rollup |
| `getAcquisitionBreakdown(filter, dim)` | user counts by `method\|platform\|app_version\|country\|language\|source` | dimension |

All methods accept an optional injected `SupabaseClient` (for tests / reuse); default is the lazy service-role client.

## 4. Filter matrix
The service supports **date range, platform, method, app_version, country, language**. Because `auth_daily_rollup` grain is `date × platform × method`, the filters map by source:

| Filter | rollup metrics (summary / provider / platform / trend) | acquisition (`getAcquisitionBreakdown`) |
|---|---|---|
| `from` / `to` | ✅ `snapshot_date` | ✅ `signup_at` |
| `platform` | ✅ | ✅ `signup_platform` |
| `method` | ✅ | ✅ `signup_method` |
| `app_version` | — (not in rollup grain) | ✅ `signup_app_version` |
| `country` | — | ✅ `signup_country` |
| `language` | — | ✅ `signup_language` |

`app_version`/`country`/`language` counts come from `user_acquisition` (signup-time attributes) — deliberate, to keep the rollup cardinality bounded (spec §2.2). This is the acquisition-oriented view (SR-3).

## 5. Standing rules
- **SR-1:** reads `user_acquisition` (single source of truth) by `user_id`-keyed dimension; correlations remain JOIN-based.
- **SR-2:** `platform` is a filter/dimension; one implementation, no platform branches.
- **SR-3:** one service feeds all dashboards/reports; Founder/Investor are just callers.
- **SR-4:** all KPI/aggregation math lives here once; no duplication.

## 6. Backward compatibility
- New module + tests only. **No** existing table, API, event, service, or cron changed.
- Static suite green: `tsc` ✅ · `lint` ✅ · `build` ✅ · **48 tests (36 prior + 12 new)** ✅ · `architecture:check` 7/7 ✅.
- Admin-client import is **lazy** → the pure functions are dependency-free and unit-testable (mock client injected in tests).

## 7. Performance impact
- Reads **pre-aggregated** rollup rows (bounded: date-range × platforms × methods — e.g. 30×3×6 ≈ 540 rows max) and filtered `user_acquisition` rows. **No raw-event scans** (Performance §3.1).
- Aggregation is O(rows) in TS over these small sets.
- No write path; no impact on existing queries.

## 8. Known limitations
- **`unique_users` in `getDailyTrend`** is the per-day sum across platform×method — an approximation if a user is active on multiple platforms the same day. It is intentionally **excluded from `getSummary`** (summing per-day distinct counts across a range would over-count). A true cross-range distinct would require `user_active_days` (later).
- **`app_version`/`country`/`language`** filter/aggregate **acquisition (signup-time)** metrics only — login-count metrics can't filter by them (not in the rollup grain). By design.
- Results are only meaningful once Steps 2 & 3 migrations are applied and the cron has run (else empty). The service is **empty-safe** (returns zeros/empty arrays).
- Read-only service; no API/dashboard yet (Step 5+).

## 9. Production Verification checklist (after data populated)
- [ ] `getSummary({from,to})` totals reconcile to `SELECT sum(...) FROM auth_daily_rollup` for the range; `login_success_rate = success/(success+failed)`.
- [ ] `getByProvider` per-method success rates match manual computation.
- [ ] `getByPlatform` sums match rollup per platform.
- [ ] `getDailyTrend` returns one point per VN day, ascending.
- [ ] `getAcquisitionBreakdown(filter,'country'|'app_version'|'language')` groups `user_acquisition` correctly; `app_version`/`country`/`language` filters narrow results.
- [ ] Empty range → zeros/empty arrays (no throw).
- [ ] No regression in existing analytics.

## 10. Not done (out of scope — Step 5+)
`/api/admin/analytics/auth` (thin API over this service), Authentication Dashboard, Founder/Investor integration, Reports/Export/Notifications consumers.

---
*Phase 0 held; `8e68f42` awaits S6/S7; migrations (1.0 → 2 → 3) not yet applied. No Step 5 until you review and approve Step 4.*
