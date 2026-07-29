# Analytics Platform v1 — Freeze Declaration

**STATUS: FROZEN**

Future analytics work must extend this platform rather than redesign it.

Basis: `ANALYTICS_PLATFORM_ARCHITECTURE_REVIEW.md` (full audit, no critical flaw found). This document freezes the public contracts below as v1. See `ANALYTICS_PLATFORM_EXTENSION_GUIDE.md` for how future domains build on top, and `ANALYTICS_PLATFORM_KNOWN_LIMITATIONS.md` for what is intentionally deferred.

---

## Frozen contracts

### 1. Analytics Envelope
Fields: `event_id, schema_version, anon_id, platform, app_version, build_number, os_name, os_version, device_type, language, session_id, client_timestamp`, plus `device_context` and `metadata`. Attached automatically by `buildEnvelope()`/`track()`; callers never construct it by hand. **Frozen field set** — new envelope-level fields require a version bump (`schema_version`), not a silent addition.

### 2. `device_context` (19-field contract)
`platform, os_name, os_version, browser_name, browser_version, device_type, manufacturer, device_model, screen_width, screen_height, pixel_ratio, color_scheme, locale, timezone, app_version, build_number, sdk_version, network_type, is_pwa`. One jsonb column, one detection module per platform. **Frozen** — Android/iOS must emit exactly this shape when they ship device telemetry; no field renamed, removed, or retyped without a version bump.

### 3. Event naming convention
`<domain>_<action>_<state>` snake_case (e.g. `auth_signup_completed`, `activation_signal_recorded`). Domain prefix identifies the owning analytics module. **Frozen** — new domains (Explore, Product, AI Usage, etc.) must follow this convention.

### 4. Event `metadata`
Free-form jsonb, event-type-specific, never containing envelope/device fields (that separation is load-bearing — see Architecture Review §2). **Frozen boundary**: metadata = business properties only, never device/session/identity fields.

### 5. API response contracts
Admin analytics APIs (`/api/admin/analytics/<domain>`) return `{ data, meta }`-shaped JSON, gated by `requireAdminRole(req, 'analyst')` + `rateLimit(...)` + `isSameOrigin`. **Frozen pattern** — every future analytics API must gate identically (role floor `analyst`, per-user-per-domain rate limit, same-origin check).

### 6. Rollup contracts
One daily rollup table + one idempotent `fn_rollup_<domain>_daily` SQL function per domain, recomputed over a trailing window by the single `analytics-snapshot` cron, each step error-isolated. **Frozen pattern** — a new domain adds one table + one function + one cron step, never a new cron job or a bespoke scheduling mechanism.

### 7. Analytics Service interfaces
`<domain>AnalyticsService.ts` (server query logic) → `<domain>AnalyticsClient.ts` (typed fetch wrapper) — one pair per domain, no service reaching into another domain's tables directly. **Frozen layering**: Dashboard → Client → API route → Service → DB. No upward calls, no cross-domain service imports.

### 8. Dashboard data contracts
`/admin/analytics/<domain>/page.tsx` behind `requirePageRole('analyst')`, rendering KPI cards / breakdown tables / trend charts / filters sourced only from that domain's Client. **Frozen** — new dashboards follow the same page-guard + component shape.

---

## Declaration

No critical architectural flaw was found during the audit. **Analytics Platform v1 is declared FROZEN.** No schema, API, or migration changes were made as part of this freeze — this is a documentation-only governance action, per the task's explicit constraints (no new features, no commits, no pushes, no merges, no deploys).
