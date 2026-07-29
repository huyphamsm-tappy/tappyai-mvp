# Analytics Platform — Extension Guide

How to build a new analytics domain on top of the frozen v1 platform without redesigning it. For each candidate future module, what's reusable as-is, what new components are needed, and whether any architecture change is required.

**General recipe (applies to every domain below):**
1. Define event types under the domain's snake_case prefix (`<domain>_<action>_<state>`), emitted via the existing `track()` — no new tracking API.
2. Add domain-specific fields to `metadata` only — never touch the envelope or `device_context`.
3. Add one rollup table + one `fn_rollup_<domain>_daily` function (new migration) if the domain needs daily aggregates.
4. Add one cron step to `analytics-snapshot/route.ts` (error-isolated, like the existing 4 steps) — do not create a second cron.
5. Add `<domain>AnalyticsService.ts` + `<domain>AnalyticsClient.ts` + `/api/admin/analytics/<domain>` (role/rate-limit-gated identically to auth/activation) + `/admin/analytics/<domain>/page.tsx` (page-guarded identically).

No step above requires touching the Envelope, `device_context`, `/api/track`, or any existing domain's tables/services.

---

## Explore Analytics
- **Reusable as-is:** envelope, `track()`, `device_context`, `/api/track`, event catalog convention, RBAC/rate-limit pattern, dashboard shell.
- **New:** `explore_*` event types (e.g. `explore_search_performed`, `explore_result_clicked`); `explore_daily_rollup` table + function if daily KPIs are needed; `exploreAnalyticsService/Client`; `/admin/analytics/explore`.
- **Architecture change required:** none.

## Product Analytics
- **Reusable as-is:** same as above.
- **New:** `product_*` events; likely a `product_daily_rollup` per metric family (views, saves, shares); services/API/dashboard per the recipe.
- **Architecture change required:** none. If product analytics needs cross-domain joins (e.g. correlating product views with activation state), do this by **querying two rollup tables from the service layer**, not by merging domains — keeps layering intact.

## AI Usage Analytics
- **Reusable as-is:** same as above; `metadata` already supports arbitrary jsonb, so token counts/model/latency fit without envelope changes.
- **New:** `ai_usage_*` events; a rollup if usage-over-time dashboards are needed; service/API/dashboard.
- **Architecture change required:** none. If cost/quota enforcement is later needed, that is a **separate concern** (billing/rate-limiting), not an analytics-platform change — don't fold it into this domain's service.

## Maps Analytics
- **Reusable as-is:** same as above.
- **New:** `maps_*` events (search, pin view, directions requested); rollup/service/API/dashboard per recipe.
- **Architecture change required:** none.

## Review Analytics
- **Reusable as-is:** same as above.
- **New:** `review_*` events (created, edited, flagged); rollup/service/API/dashboard.
- **Architecture change required:** none.

## Notification Analytics
- **Reusable as-is:** same as above; `platform`/`device_context` already distinguish push-capable clients.
- **New:** `notification_*` events (sent, delivered, opened); a rollup keyed by notification campaign if needed; service/API/dashboard.
- **Architecture change required:** none. Delivery/opened events may arrive from a server-side push provider webhook rather than client `track()` — that's an **ingestion path**, not a platform change: have the webhook handler call the same `/api/track` insert path (or a thin variant) so it lands in the same `user_events` shape.

## Affiliate Analytics
- **Reusable as-is:** same as above.
- **New:** `affiliate_*` events (link clicked, conversion attributed); rollup/service/API/dashboard. Attribution logic (matching a click to a later conversion) is new domain logic, analogous to the existing Activation Rule Engine/Provider pattern — reuse that *pattern* (pluggable rule provider), not its code.
- **Architecture change required:** none, provided attribution reuses the Rule Engine/Provider *shape* rather than inventing a new plugin mechanism.

## Revenue Analytics
- **Reusable as-is:** same as above.
- **New:** `revenue_*` events (subscription started/renewed/cancelled, IAP purchased); rollup/service/API/dashboard. Revenue data likely originates from Stripe/IAP webhooks, not client `track()` — same ingestion-path note as Notification Analytics applies.
- **Architecture change required:** none for analytics itself. Any change to how Stripe/IAP webhooks are handled is a **backend/payments concern**, out of this platform's scope.

## Operational Analytics
- **Reusable as-is:** same as above; the cron error-isolation pattern is directly useful for tracking rollup/job health.
- **New:** `operational_*` events (cron step succeeded/failed, latency); could reuse `user_events` or, if operational data shouldn't mix with user-behavior analytics, a **separate table** following the same envelope shape — worth a small decision when this domain is actually built, not now.
- **Architecture change required:** none for the common case; a table-separation decision (documented above) only if operational events must not share `user_events`.

---

## Summary

Every listed future domain fits the existing pattern with **zero platform redesign**: new event types under `metadata`, one rollup table+function+cron-step, one service/client/API/dashboard set, identical RBAC/rate-limit gating. The two domains needing a genuinely new *idea* (Affiliate's attribution, Operational's possible table separation) still reuse an existing *pattern* (Rule Provider, envelope shape) rather than requiring new platform primitives.
