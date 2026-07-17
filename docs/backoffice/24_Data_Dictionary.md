# TappyAI Back Office — Data Dictionary

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Provide the single authoritative definition of every field used across the analytics and back office data model. When any document, dashboard, report, or query references a field, this dictionary defines its meaning, type, source, and constraints.

**Rule:** No field may be interpreted differently in two places. This dictionary is the tie-breaker.

---

## 2. Standard Event Envelope Fields

| Field | Type | Required | Introduced (schema_version) | Definition |
|---|---|---|---|---|
| `event_id` | UUID v4 | Yes | 1 | Client-generated at event creation. Idempotency key. Reused on retry. |
| `schema_version` | int | Yes | 1 | Envelope schema version. Increments on breaking envelope change. |
| `event_type` | string | Yes | 1 | Canonical event name from `07_Event_Catalog.md`. snake_case. |
| `user_id` | UUID \| null | Conditional | 1 | Registered user id. Null when anonymous. Exactly one of user_id/anon_id present. |
| `anon_id` | UUID \| null | Conditional | 1 | Stable anonymous device id. Null when registered. |
| `session_id` | UUID | Yes | 1 | Session identifier. New id after 30 min inactivity (see §4). |
| `platform` | enum | Yes | 1 | `web` \| `android` \| `ios`. |
| `app_version` | string | Yes | 1 | Semantic app version, e.g. `1.3.0`. |
| `build_number` | string | Yes | 1 | Platform build id (VERSION_CODE / CFBundleVersion / web build). |
| `os_name` | string | Yes | 1 | `iOS` \| `Android` \| `Windows` \| `macOS` \| `Linux`. |
| `os_version` | string | Yes | 1 | OS version string. |
| `device_type` | enum | Yes | 1 | `phone` \| `tablet` \| `desktop` \| `unknown`. |
| `device_model` | string | No | 1 | e.g. `iPhone16,2`. Best-effort. |
| `country` | string | No | 1 | ISO 3166-1 alpha-2, derived server-side from IP if absent. |
| `language` | string | Yes | 1 | App UI language, `vi` \| `en`. |
| `timezone` | string | No | 1 | IANA tz, e.g. `Asia/Ho_Chi_Minh`. |
| `client_timestamp` | ISO 8601 UTC | Yes | 1 | When the event occurred on device. |
| `server_timestamp` | ISO 8601 UTC | Yes (server-set) | 1 | When ingestion received the event. |
| `properties` | JSON | No | 1 | Event-specific payload. Max 8 KB. No PII. |

---

## 3. Derived Field Definitions

| Field | Owning Table | Type | Definition |
|---|---|---|---|
| `snapshot_date` | daily_snapshots | date | Calendar day in **Asia/Ho_Chi_Minh** (UTC+7). The canonical reporting day. |
| `is_final` | daily_snapshots | bool | True after the 3-day reconciliation window closes; false = provisional. |
| `active_date` | user_active_days | date | A VN calendar day on which the user emitted ≥1 event. |
| `cohort_date` | cohort_metrics | date | The VN calendar day a user registered. Defines their cohort. |
| `mrr_usd` | daily_snapshots | numeric | Monthly Recurring Revenue in USD as of that day (see KPI doc). |
| `cost_usd` | ai_usage_log | numeric | Anthropic API cost for one call = input_tokens × in-rate + output_tokens × out-rate (per model pricing). |

---

## 4. Canonical Concept Definitions

These concepts have exactly one definition platform-wide.

### Session
A sequence of events from one user/device with no gap greater than **30 minutes** of inactivity. A new `session_id` is minted when: (a) the app is cold-started, or (b) the app returns to foreground after ≥30 min in background, or (c) 30 min elapse between events. Session duration = `MAX(client_timestamp) − MIN(client_timestamp)` within a `session_id`.

### Active User
A user (registered `user_id`, or `anon_id` when "include anonymous" is on) with ≥1 event on a given VN calendar day. Recorded in `user_active_days`.

### New User
A user whose `profiles.created_at` falls within the period, bucketed in VN time.

### Returning User
A user active in the current period who was **also** active in the immediately prior period of the same length.

### Churned User
A user active in period N−1 but with zero activity in period N. Churn is directional and period-scoped; always state the period (e.g. "30-day churn").

### Registered vs Anonymous
Headline metrics count **registered users** unless a dashboard explicitly enables "include anonymous". Anonymous reach is reported separately to keep headline KPIs honest.

---

## 5. Enumerations (Controlled Vocabularies)

| Enum | Allowed Values |
|---|---|
| `platform` | `web`, `android`, `ios`, `all` (aggregate rows only) |
| `feature_key` | `chat`, `food`, `travel`, `explore`, `reviews`, `music`, `games`, `profile`, `settings`, `horoscope`, `fortune`, `viet_writer`, `currency`, `weather`, `deals` |
| `admin_role` | `super_admin`, `admin`, `moderator`, `analyst` |
| `subscription_tier` | `free`, `pro` |
| `account_status` | `active`, `suspended`, `banned`, `deleted` |
| `moderation_status` | `pending`, `in_review`, `resolved`, `dismissed` |
| `campaign_channel` | `push`, `in_app`, `announcement` |
| `report_format` | `pdf`, `xlsx`, `docx`, `csv`, `json` |

Any new value requires updating this table AND the corresponding Postgres enum (see `29_Database_Governance.md` for the enum-change procedure).

---

## 6. Units & Formats

| Quantity | Unit | Format |
|---|---|---|
| Money | USD (storage), VND (VN display) | numeric(10,2)+; display per locale |
| Tokens | count | bigint |
| Duration | seconds (storage) | numeric; display as `Xm Ys` |
| Rates/ratios | 0.0–1.0 (storage) | display as `%` |
| Dates | UTC (storage) | display in VN time, labeled |

---

## 7. Field Naming Conventions

- Counts end in `_count` or are plural nouns (`review_views`).
- Money ends in `_usd` or `_vnd`.
- Rates end in `_rate` and are stored 0–1.
- Timestamps end in `_at`; dates end in `_date`.
- Booleans start with `is_` / `has_`.
- Foreign keys end in `_id`.

---

*End of Data Dictionary*
