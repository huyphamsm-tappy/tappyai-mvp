# TappyAI Back Office — Analytics Architecture

**Version:** 1.1 (Review-hardened)  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13  
**Changelog:** v1.1 adds ingestion integrity (idempotency, schema versioning), the canonical reporting-timezone decision, the MAU/WAU rolling-count computation strategy, late-arriving-event reconciliation, and the anonymous-identity model. These close production-blocking gaps found in architecture review.

---

## 1. Objective

Define a unified analytics architecture that works identically across Web, Android, and iOS, populates all back office dashboards, and scales from MVP to growth without a full rewrite.

---

## 2. Architecture Overview

```mermaid
graph TD
    subgraph Clients["Client Layer — Web / Android / iOS"]
        WEB_SDK[Web Tracker<br/>tracker.ts]
        AND_SDK[Android Tracker<br/>TappyAnalytics.kt]
        IOS_SDK[iOS Tracker<br/>TappyAnalytics.swift]
    end

    subgraph Ingestion["Ingestion Layer"]
        TRACK_API[POST /api/track]
        BATCH[Batch buffer — 10 events or 10s]
    end

    subgraph Storage["Storage Layer"]
        RAW[(track_events — raw log)]
        AI_LOG[(ai_usage_log)]
    end

    subgraph Processing["Processing Layer"]
        SNAP_CRON[analytics-snapshot cron<br/>daily 00:05 VN = 17:05 UTC]
        COHORT_CRON[cohort-rollup cron<br/>daily 00:10 UTC]
        BEHAVIOR_CRON[behavior-rollup cron<br/>hourly]
    end

    subgraph Derived["Derived Layer"]
        DAILY[(daily_snapshots)]
        FEATURES[(feature_usage_rollup)]
        COHORTS[(cohort_metrics)]
        VERSION[(version_analytics)]
    end

    subgraph External["External Layer"]
        POSTHOG[PostHog<br/>funnel + session]
    end

    subgraph Presentation["Presentation Layer"]
        BO[Back Office Dashboards]
        API[/api/admin/analytics/*]
    end

    WEB_SDK --> BATCH
    AND_SDK --> BATCH
    IOS_SDK --> BATCH
    BATCH --> TRACK_API
    TRACK_API --> RAW
    TRACK_API --> AI_LOG

    SNAP_CRON --> RAW
    SNAP_CRON --> DAILY
    SNAP_CRON --> FEATURES
    SNAP_CRON --> VERSION
    COHORT_CRON --> DAILY
    COHORT_CRON --> COHORTS
    BEHAVIOR_CRON --> RAW

    DAILY --> API
    FEATURES --> API
    COHORTS --> API
    VERSION --> API
    POSTHOG --> API

    API --> BO
```

---

## 3. Event Schema

Every analytics event must include a **standard envelope** plus event-specific properties.

### Standard Event Envelope

```typescript
interface TrackEvent {
  // Identity
  event_type: string          // e.g. 'chat_message_sent'
  user_id: string | null      // null for anonymous
  session_id: string          // UUID generated per app session

  // Platform + version metadata (NEW — add to /api/track handler)
  platform: 'web' | 'android' | 'ios'
  app_version: string         // e.g. '1.2.3'
  build_number: string        // e.g. '100'
  os_name: string             // e.g. 'iOS', 'Android', 'Windows', 'macOS'
  os_version: string          // e.g. '18.0'
  device_type: 'phone' | 'tablet' | 'desktop' | 'unknown'
  device_model: string        // e.g. 'iPhone 16 Pro'

  // Locale
  country: string             // ISO 3166-1 alpha-2
  language: string            // e.g. 'vi', 'en'
  timezone: string            // e.g. 'Asia/Ho_Chi_Minh'

  // Timing
  client_timestamp: string    // ISO 8601 — when event occurred on device
  server_timestamp: string    // Set by server on receipt

  // Payload
  properties: Record<string, unknown>
}
```

### Cross-Platform Consistency Rule

The `event_type` string and `properties` structure must be **identical** across Web, Android, and iOS for the same action.

Example: A user liking a review must send:
- `event_type: "review_like"`
- `properties: { review_id, creator_id }`

...on all three platforms. No platform-specific naming.

---

## 4. Event Implementation per Platform

### 4.1 Web (existing `tracker.ts`)

Current implementation in `src/lib/tracking/tracker.ts` must be extended to:
1. Include the full standard envelope (platform metadata currently missing)
2. Read `platform: 'web'`, `app_version` from `/api/version`, `os_name`/`os_version` from `navigator.userAgentData`

### 4.2 Android (`TappyAnalytics.kt`)

New singleton to implement in `:app` module:
- Reads device metadata at init
- Batches events to POST `/api/track`
- Respects same 10-event / 10-second flush policy as web
- Sends events on `onDestroy` via WorkManager (survives process death)

### 4.3 iOS (`TappyAnalytics.swift`)

New class to implement:
- Reads device metadata at init
- Batches events, flushes on app background via `UIApplication.shared.beginBackgroundTask`
- Same event schema as web and Android

---

## 5. Metric Definitions

### User Growth

| Metric | Definition |
|---|---|
| Total Users | COUNT of all rows in `profiles` |
| New Users | COUNT of `profiles` where `created_at` falls in period |
| Returning Users | Users active in period who were also active in prior period |
| Churned Users | Users active in period N-1 but NOT active in period N |
| Growth Rate | (new_users / total_users_prior_period) × 100 |

### Active Usage

| Metric | Definition |
|---|---|
| DAU | Distinct `user_id` in `track_events` in the calendar day |
| WAU | Distinct `user_id` in a rolling 7-day window |
| MAU | Distinct `user_id` in a rolling 28-day window |
| Stickiness | DAU / MAU |

### Sessions

| Metric | Definition |
|---|---|
| Session | Sequence of events sharing the same `session_id` |
| Session Count | COUNT of distinct `session_id` per day |
| Session Duration | `MAX(client_timestamp) - MIN(client_timestamp)` per `session_id` |
| App Opens | COUNT of `app_open` events |

### AI

| Metric | Definition |
|---|---|
| AI Conversations | COUNT of distinct conversation starts per day |
| AI Messages | COUNT of `chat_message_sent` events |
| Input Tokens | SUM of `input_tokens` from `ai_usage_log` |
| Output Tokens | SUM of `output_tokens` from `ai_usage_log` |
| AI Cost | SUM of `cost_usd` from `ai_usage_log` |
| Response Latency | SUM/COUNT of `latency_ms` per feature |

---

## 6. Analytics Dashboard Requirements by Module

### Home Dashboard
- Source: `daily_snapshots` (yesterday)
- Metrics: DAU, new_users, ai_conversations, revenue_day_usd, moderation queue depth
- No raw table queries

### Product Analytics
- Source: `daily_snapshots` + `feature_usage_rollup`
- Time range: last 30/90/365 days
- Breakdowns: by feature, by platform

### User Analytics
- Source: `daily_snapshots` + `cohort_metrics` + `profiles` (count queries only)
- Cohort table: registration month × D1/D7/D30 rate

### AI Analytics
- Source: `ai_usage_log` (last 7/30 days) + `daily_snapshots.ai_*` fields
- No live aggregation — use `ai_usage_log` for detail, `daily_snapshots` for trends

### Business Analytics
- Source: `daily_snapshots` + `subscriptions` + Stripe API
- MRR computed from active subscription prices

### Release Analytics
- Source: `version_analytics`
- Filtered by platform + version

---

## 7. Cron Job Specifications

### `analytics-snapshot` (daily 00:05 VN, Asia/Ho_Chi_Minh, UTC+7 = 17:05 UTC)

Computes the final snapshot for yesterday.

```
1. Query track_events WHERE date = yesterday AND platform = X
2. Compute DAU, new_users, session counts, feature breakdown
3. Query ai_usage_log for yesterday's AI totals
4. Query subscriptions for subscription counts + MRR
5. Query notification_deliveries for notification stats
6. UPSERT into daily_snapshots per platform ('all', 'web', 'android', 'ios')
7. UPSERT into feature_usage_rollup per feature per platform
8. UPSERT into version_analytics per platform per version
```

### `cohort-rollup` (daily 00:10 UTC)

Computes retention for cohorts that have reached their D1/D7/D30 milestone today.

```
1. Find cohort dates where today = cohort_date + 1, + 7, or + 30
2. For each: count users from that cohort who were active (DAU) today
3. UPSERT into cohort_metrics
```

### `ai-cost-rollup` (hourly)

Aggregates AI cost into `daily_snapshots` incrementally.

```
1. Sum ai_usage_log entries in last hour by platform
2. UPDATE daily_snapshots for today, add to ai_cost_usd, ai_input_tokens, ai_output_tokens
```

---

## 8. PostHog Integration

PostHog remains the provider for:
- Funnel analytics (event A → B → C conversion)
- Session recordings (web only)
- Heatmaps (web only)
- A/B testing (future)

**Back office integration:**
- Use PostHog's server-side API to query funnel data for display in back office
- Do NOT duplicate PostHog events to `track_events` — they serve different purposes

**Current gap:** Android and iOS do not currently send events to PostHog. For unified funnel analytics, this must be addressed (PostHog has Android and iOS SDKs).

---

## 8A. Ingestion Integrity (CRITICAL)

The accuracy of *every* metric depends on the ingestion layer being correct. These rules are mandatory.

### 8A.1 Event Idempotency

**Problem:** Clients batch events and retry the whole batch on network failure or timeout. Without deduplication, a single user action can be counted 2–5×, inflating DAU, revenue, and every downstream KPI.

**Decision:** Every event carries a client-generated `event_id` (UUID v4). The ingestion endpoint deduplicates on `event_id`.

```typescript
interface TrackEvent {
  event_id: string          // UUID v4 generated on the device at event creation
  schema_version: number    // Envelope schema version (starts at 1)
  // ... rest of envelope (see §3)
}
```

**Implementation:**
- `track_events` has a `UNIQUE (event_id)` constraint.
- Ingestion uses `INSERT ... ON CONFLICT (event_id) DO NOTHING`.
- `event_id` is generated once when the event is *created* (not when sent), so retries reuse the same id.

**Benefits:** Exactly-once counting even with at-least-once delivery. **Trade-off:** One extra unique index (write cost). **Risk:** Negligible — dedup is the industry-standard approach.

### 8A.2 Event Schema Versioning

The `schema_version` integer lets the envelope evolve without breaking historical data or older app versions still in the field.

- Ingestion accepts any known `schema_version` and normalizes to the latest internal shape.
- The Event Catalog (`07_Event_Catalog.md`) records the schema version each field was introduced in.
- Old app versions (which cannot be force-updated) keep sending their schema version indefinitely; the pipeline must never assume all clients are current.

### 8A.3 Payload Limits & Abuse Protection

| Guard | Rule |
|---|---|
| Max batch size | 100 events per `/api/track` request |
| Max event size | 8 KB per event (reject oversized `properties`) |
| Per-client rate limit | 600 events/min per session_id (via existing `rateLimit.ts`) |
| PII rejection | Reject events whose `properties` contain email/phone patterns (defense-in-depth) |
| Unknown event_type | Accept but tag `is_unknown_event=true` for later triage (never drop — forward-compat) |
| Bot filtering | Drop events from known bot user-agents before insert |

### 8A.4 Late-Arriving Events & Reconciliation

**Problem:** A mobile client offline for 2 days flushes stale events (with old `client_timestamp`) after the daily snapshot for those days was already finalized. Naive snapshots miss them.

**Decision:** Two-tier finalization.
- **Provisional snapshot:** `analytics-snapshot` cron computes yesterday's snapshot at 00:05 (marked `is_final=false`).
- **Reconciliation pass:** A `snapshot-reconcile` cron re-computes snapshots for the trailing **3 days** once daily and marks them `is_final=true` after the 3-day window closes.
- Dashboards show a subtle "provisional" indicator on non-final days.

`daily_snapshots` gains: `is_final BOOLEAN DEFAULT false`, `reconciled_at TIMESTAMPTZ`.

**Trade-off:** Recent 3 days may shift slightly as late events land. **Benefit:** Correctness converges; no permanent undercount. **Risk:** Low — 3 days covers the vast majority of offline gaps.

---

## 8B. Reporting Timezone (CRITICAL DECISION)

**Problem:** "DAU", "new users today", and every per-day metric depend on where the day boundary falls. UTC midnight is 07:00 in Vietnam — splitting the Vietnamese evening peak across two reporting days.

**Decision:** The **canonical reporting timezone is `Asia/Ho_Chi_Minh` (UTC+7)**. All calendar-day bucketing (`snapshot_date`, cohort dates, "today") is computed in this timezone.

- Events store `client_timestamp` and `server_timestamp` in UTC (unambiguous storage).
- Bucketing converts to `Asia/Ho_Chi_Minh` at rollup time: `DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')`.
- The `analytics-snapshot` cron therefore runs at **17:05 UTC = 00:05 VN**, not 00:05 UTC, so it fires just after the VN day closes.
- Reports and dashboards label the timezone explicitly ("all dates in Vietnam time, UTC+7").

**Benefits:** Metrics align with the actual user day; no split-peak artifacts. **Trade-off:** International expansion later needs a per-report timezone override (noted in Future Recommendations). **Risk:** Low for a Vietnam-first product. This supersedes the "00:05 UTC" times used illustratively elsewhere; §7 cron times are updated accordingly.

---

## 8C. Active-User Computation Strategy (DAU / WAU / MAU)

**Problem:** WAU (7-day) and MAU (28-day) are *rolling distinct-user* counts. Naively recomputing them nightly means scanning up to 28 days of raw events every night — O(28 × daily volume) and increasingly slow.

**Decision:** Maintain a compact `user_active_days` table — one row per (user, active-day) — and derive all active-user counts from it.

> **Schema reference:** the authoritative `user_active_days` DDL is defined in `04_Database_Architecture.md` §7A (per Constitution §8, `04` is the single source of truth for schema). It is one row per `(user_id, active_date, platform)`. The DDL is not duplicated here.

- The hourly `behavior-rollup` cron UPSERTs a row the first time a user is seen each VN day (cheap, idempotent).
- DAU = `COUNT(DISTINCT user_id) WHERE active_date = D`.
- WAU = `COUNT(DISTINCT user_id) WHERE active_date BETWEEN D-6 AND D`.
- MAU = `COUNT(DISTINCT user_id) WHERE active_date BETWEEN D-27 AND D`.
- This table is tiny relative to `track_events` (one row/user/day, not one/event) and is the single source for retention/cohort joins too.

**Benefits:** All active-user and retention queries become index scans over a small table; independent of event volume. **Trade-off:** One extra derived table to maintain. **Risk:** Low. **Future scalability:** At very large scale this table can be replaced by HyperLogLog sketches per day (documented in Future Recommendations) without changing dashboard queries.

---

## 8D. Anonymous Identity Model

TappyAI allows anonymous usage (5 AI questions/day via the `tappy_anon` cookie; `anon_chat_usage` table). Analytics must treat anonymous users as first-class so the **anonymous → registered** funnel is measurable.

- Every event carries **either** `user_id` (registered) **or** `anon_id` (anonymous), never neither. `anon_id` is a stable UUID stored client-side (cookie on web, keychain/secure-store on native).
- On signup, the client emits `auth_anonymous_converted` carrying both the old `anon_id` and the new `user_id`. A stitching map (`anon_identity_map(anon_id, user_id, linked_at)`) lets funnels and cohorts follow a user across the boundary.
- DAU/WAU/MAU count **registered users only** by default; an "include anonymous" toggle on dashboards adds `anon_id`-based actives. This keeps headline metrics honest while still surfacing anonymous reach.

**Benefit:** True top-of-funnel visibility and accurate signup-conversion measurement. **Trade-off:** Slightly more complex identity resolution. **Risk:** Low.

---

## 9. Privacy & Compliance

| Rule | Implementation |
|---|---|
| No PII in `track_events.properties` | Enforce in event schema validation in `/api/track` handler |
| User identification | Use `user_id` (UUID). Email/name never stored in events. |
| IP address | Store in `audit_log` only. Not in analytics tables. |
| Data deletion | GDPR delete: anonymize `user_id` in `track_events` to null for deleted users |
| Opt-out | If user opts out of analytics: skip batch flush entirely on client |

---

## 10. Future Recommendations

> NOT in scope. Documented for future consideration only.

- **Real-time analytics**: Supabase Realtime subscription for live DAU counter on dashboard
- **ClickHouse**: Dedicated analytics DB when daily event volume exceeds 10M rows
- **Attribution**: Add `referrer` and `utm_*` parameters to event envelope for acquisition analytics
- **A/B testing**: PostHog feature flags + experiment analytics
- **Predictive churn**: ML model on D7/D30 retention signals

---

*End of Analytics Architecture*
