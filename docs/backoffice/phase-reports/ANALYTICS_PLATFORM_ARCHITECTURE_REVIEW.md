# Analytics Platform — Architecture Review (pre-freeze audit)

**Scope:** full-system audit of everything shipped under the Analytics platform to date: Envelope, `track()`, `device_context`, Event Catalog, `/api/track`, `user_events`, Authentication Analytics, Activation Analytics, rollup architecture, analytics services, admin APIs, dashboards, cron pipeline, schema, migrations, security/RBAC/rate-limiting, performance, documentation.

**Method:** static re-verification against the current working tree (not assumed from prior reports) — file layout, RBAC/rate-limit gates on every admin analytics route, migration inventory, cron consolidation, naming conventions, and cross-checks against the three `DEVICE_CONTEXT_*.md` reports already on file.

---

## 1. Analytics Envelope

`src/lib/tracking/envelope.ts` — one `buildEnvelope()` builds every event's shared fields (`event_id`, `schema_version`, `anon_id`, `platform`, `app_version`, `build_number`, `os_name`, `os_version`, `device_type`, `language`, `session_id`, `client_timestamp`) plus `device_context`. All device-derived flat fields are **projected from** `detectDeviceContext()` — one detection call per event, no parallel detection path. `tracker.ts`'s `track()` spreads `...buildEnvelope()` unconditionally; callers cannot bypass or partially populate the envelope.

**Verdict: stable.** Single source of truth for shared event shape.

## 2. `track()` / Event Catalog / `/api/track`

`track(event_type, metadata)` is the only public entry point client-side; `metadata` carries event-specific business properties, kept separate from envelope/device fields (the architecture's core separation, established before this audit and preserved by every subsequent change). `/api/track/route.ts` accepts the envelope + `metadata` + `device_context`, and writes flat columns + `metadata` jsonb + `device_context` jsonb into `user_events`. No per-event-type branching logic lives in the route — event semantics live in `metadata`, not in server code, so adding new event types never requires a route change.

**Verdict: stable, extensible without redesign.**

## 3. `device_context`

Fully covered by the three existing reports (`DEVICE_CONTEXT_IMPLEMENTATION_REPORT.md`, `DEVICE_CONTEXT_ARCHITECTURE_DECISION.md`, `DEVICE_CONTEXT_AUDIT.md`), re-verified here: one detection module (`deviceContext.ts`), one additive jsonb column, 19-field contract, zero duplicate detection in the analytics path, 176/176 tests passing, PASS verdict on the dedicated audit. Re-confirmed in this pass: no new consumer has been added that reads `device_context` since those reports — it remains write-only, zero blast radius.

**Verdict: stable, matches the frozen contract below.**

## 4. `user_events` / Database schema / Migrations

Inventory (7 analytics-relevant migrations, in apply order): `20260713_backoffice_phase0.sql` (RBAC/audit foundation) → `20260713_analytics_envelope_foundation.sql` (`user_events` + envelope columns) → `20260713_auth_daily_rollup.sql` (`fn_rollup_auth_daily`, `auth_daily_rollup` table) → `20260713_user_acquisition_dimension.sql` (`user_acquisition` table, `fn_upsert_user_acquisition`, `fn_sync_last_login`) → `20260714_activation_dimension.sql` (`user_activation` table, `fn_upsert_activation`) → `20260714_activation_daily_rollup.sql` (`fn_rollup_activation_daily`) → `20260714_device_context.sql` (additive `device_context jsonb`, **staged, not yet applied to any environment**).

No migration duplicates another's table/function/column. Each is additive; none rewrites a prior migration. `device_context` is the only unapplied one — it must be applied before its consuming code path deploys (documented in the Architecture Decision, §5).

**Verdict: stable, no unused or orphaned migrations.**

## 5. Authentication Analytics / Activation Analytics / Rollups

- **Auth:** `fn_rollup_auth_daily` (idempotent window recompute) + `userAcquisitionService.ts` (signup-event mapper/writer, first-write-wins) + `fn_sync_last_login`. Consumed by `authAnalyticsService.ts` → `authAnalyticsClient.ts` → `/api/admin/analytics/auth` → `/admin/analytics/auth`.
- **Activation:** Rule Engine/Provider abstraction (`activationRuleEngine.ts` + `activationRuleProvider.ts`, in-code provider `inCodeActivationRuleProvider`, rules under `activationRules/`) → `activationEvaluationRunner.ts` (evaluate + upsert) → `activationDimensionWriter.ts` (writer) → `fn_rollup_activation_daily`. Consumed by `activationAnalyticsService.ts` → `activationAnalyticsClient.ts` → `/api/admin/analytics/activation` → `/admin/analytics/activation`.
- **Single cron** (`src/app/api/cron/analytics-snapshot/route.ts`) drives all four rollup/sync steps (auth rollup, acquisition, last_login sync, activation) as one idempotent, incremental, trailing-window job; each step's error is isolated (a failure in one never blocks the others). This is the one place rollup orchestration lives — no second cron or scheduled job duplicates any of these steps (grep-verified: only one file references any of the four rollup/sync RPCs from a cron/schedule context).

**Verdict: stable.** Both domains follow an identical shape (Service ↔ Client ↔ API ↔ Dashboard, backed by one rollup function + one cron step), which is itself the reusable pattern for future analytics domains (see Extension Guide).

## 6. Analytics Services / Admin APIs / Dashboards

Naming is consistent across both domains: `<domain>AnalyticsService.ts` (server-side query logic) / `<domain>AnalyticsClient.ts` (typed fetch wrapper) / `/api/admin/analytics/<domain>/route.ts` + `schema.ts` / `/admin/analytics/<domain>/page.tsx` + dashboard components. Every admin analytics API route re-verified this pass to gate identically:
- `requireAdminRole(req, 'analyst')` (role check) + `rateLimit('admin:analytics:<domain>:${user.id}', 100, 60_000)` in both `auth/route.ts` and `activation/route.ts`.
- Every admin analytics page calls `requirePageRole('analyst')` in both `auth/page.tsx` and `activation/page.tsx`.

No route skips the gate; no route uses a different rate-limit budget without reason (both are 100/60s, keyed identically by user + domain).

**Verdict: stable, no naming or gating inconsistency found.**

## 7. Security / RBAC / Rate limiting

RBAC (`requireAdminRole` / `requirePageRole`, `analyst` role floor) and per-user-per-domain rate limiting are applied uniformly to every analytics surface (API + page). `isSameOrigin` CSRF-style check present on both admin analytics routes. No analytics endpoint is reachable without both the role gate and the rate limit.

**Verdict: stable.**

## 8. Performance

Rollups are precomputed daily tables (`auth_daily_rollup`, `activation_daily_rollup`), so dashboard reads never scan raw `user_events` — they read small aggregate tables. The cron's `RECONCILE_DAYS = 4` trailing-window recompute bounds each run's cost regardless of total historical volume. `device_context` has no index yet (deliberately deferred — nothing queries it relationally); this is correct until segmentation queries exist, at which point a GIN index is additive.

**Verdict: stable for current & near-term scale.**

## 9. Documentation

Three `device_context` reports are current (19-field, 176-test state) and PASS-verdicted. Auth/Activation Analytics architecture is documented from earlier phases (not re-litigated here — no code change since, no re-audit needed). This document plus the three governance documents produced alongside it (Freeze, Extension Guide, Known Limitations) complete the documentation set for v1.

---

## Overall finding

**No critical architectural flaw was found.** No duplicated business logic, no duplicated event definitions, no duplicated device detection, no duplicated rollup logic (one cron, one function per rollup), no circular dependencies (services depend downward only: Dashboard → Client → API → Service → DB function; nothing calls back upward), no layering violations, no hidden coupling, no dead code introduced by this platform, no unused migrations, no API or dashboard naming inconsistency.

Two pre-existing LOW-severity items were already flagged in the `device_context` audit (F-1: an unrelated `login/page.tsx` UA check outside the analytics domain; P-1: a low-entropy fingerprint-surface note) — both accepted, out-of-scope or documented tradeoffs, neither blocking.

See `ANALYTICS_PLATFORM_V1_FREEZE.md` for the frozen contracts and status declaration.
