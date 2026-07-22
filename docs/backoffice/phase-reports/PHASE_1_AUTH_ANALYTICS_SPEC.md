# Phase 1 — Authentication Analytics: Final Implementation Specification

**Status:** Specification — **Pending Owner Approval to implement.** No code written.
**Governance:** Implementation of **Analytics Architecture v1.1** (Event Catalog `07`, Analytics `06`, Data Dictionary `24`, KPI `25`, Retention `34`). **No architecture change. No new ADR.** Stop-and-flag clause active if a genuine v1.1 conflict is found.
**Scope boundary:** Does not touch the held Phase 0 or the in-flight `8e68f42` release.

---

## 0. Standing rules (established by this spec, per owner requirements)

**SR-1 — Single source of truth for acquisition.** `user_acquisition` is the **permanent analytics dimension**. Every current and future analytics module correlates to it **by `user_id`** (JOIN). Acquisition attributes are stored **once**, here. No module may copy or re-derive them. Adding a new analytics module = add its own fact/rollup keyed by `user_id` + JOIN `user_acquisition`; never duplicate acquisition data.

**SR-2 — Cross-platform parity.** Web, Android, iOS emit the **same `event_type`, same `properties`, same naming**, and are aggregated by the **same logic**. Platform is a **metadata dimension** (`platform` field) only. The Back Office has **one** implementation per metric and filters/breaks-down by `platform` — it must never contain platform-specific code paths or platform-specific metric definitions.

**SR-3 — Business-oriented, not feature-oriented.** Every analytics module must contribute to answering **business questions**, not just report isolated feature statistics. The platform supports end-to-end business analysis across the standard growth lifecycle: **Acquisition → Activation → Engagement → Retention → Monetization → Revenue → Churn → LTV → Growth → Investor Metrics.**
- Every dashboard's metrics must be **correlatable through the existing analytics dimensions** (`user_acquisition`, `user_active_days`, `cohort_metrics`, `subscriptions`, …) with **no duplicated tracking or business logic**.
- **Authentication is Stage 1** of the user journey; every future module (AI, Reviews, Social, Affiliate, Notifications, Subscription, Revenue, …) is **another stage of the same journey**, not a separate silo.
- The **Founder Dashboard** and **Investor Dashboard** consume the **same analytics foundation** (same facts, same dimensions, same metric definitions) — they are curated *views*, never parallel pipelines.
- The Back Office exposes **one unified analytics platform**, not multiple independent dashboards.

**SR-4 — Every analytics capability must be reusable.** Analytics is **never** implemented for one dashboard. Every metric, aggregation, API, rollup, event, and data model must be reusable by: Founder Dashboard, Investor Dashboard, Product / User / AI / Business Analytics, future dashboards, **Reporting**, **Export Center**, **Notifications**, and future **External APIs**.
- **Dashboards are presentation layers only.** Business logic, aggregation logic, KPI definitions, filtering, and calculations exist **once**, in reusable **analytics services**.
- **Reports and exports (PDF/Excel/Word/CSV) consume exactly the same analytics services/APIs** the dashboards use. Notifications and scheduled reports consume the same services.
- **No duplicated SQL. No duplicated KPI calculations. No duplicated aggregation logic.**
- **Extend-before-create:** every new analytics feature must first determine whether an existing service can be extended before adding a new implementation.

These rules are binding on all current and future analytics work.

---

## 1. The analytics funnel (auth = Stage 1)

```
Stage 0 Anonymous     anon_id            §8D anon_identity_map
Stage 1 Acquisition   signup/first login user_acquisition  ← THIS SPEC
Stage 2 Activation    first value events keyed by user_id
Stage 3 Engagement    AI/reviews/social  keyed by user_id
Stage 4 Monetization  quota/subscription keyed by user_id
Stage 5 Retention/Churn/LTV               keyed by user_id
```

Every stage ≥1 keys by `user_id` and JOINs `user_acquisition` for acquisition-sliced views. The Authentication Dashboard renders Stage 1 and is the funnel entry every later module extends.

---

## 1A. Business-question orientation (SR-3)

The platform is built to answer business questions; features are the *instruments*, not the *goal*. Each lifecycle question is answered by an existing fact **correlated through a shared dimension** — never a bespoke tracker.

| Lifecycle stage | Business question | Fact(s) | Dimension |
|---|---|---|---|
| Acquisition | Which channels bring users, at what quality? | `auth_daily_rollup`, `user_acquisition` | `user_acquisition` |
| Activation | Do new users reach first value, by source? | first-value events + `user_acquisition` | join |
| Engagement | Who engages (AI/reviews/social), by cohort/source? | `feature_usage_rollup`, engagement facts | join |
| Retention | Do users stay, by acquisition source? | `user_active_days`, `cohort_metrics` | join |
| Monetization | Who converts to Pro, from which source? | `subscriptions` | join |
| Revenue / LTV | Revenue & lifetime value per acquisition source? | `subscriptions` + `user_acquisition` | join |
| Churn | Who leaves, and were they low-quality acquisition? | activity decay + `user_acquisition` | join |
| Growth / Investor | MAU/MRR/retention headline + acquisition mix | `daily_snapshots`, `cohort_metrics` | shared |

**Authentication answers the Acquisition question and seeds the dimension** that lets every later question be answered *by source* — that is why it is Stage 1.

### One unified analytics platform (not independent dashboards)
- **Shared foundation:** all dashboards read the same facts + dimensions with metrics defined **once** (KPI `25` / Business KPI `35`).
- **Founder Dashboard (`26`)** and **Investor Dashboard (`15`)** are **curated views** over that foundation — same numbers, different framing. No dashboard owns its own pipeline or metric math.
- **Authentication Dashboard** is Stage 1 of this single platform and is designed to hand off to every downstream stage via the `user_acquisition` join (§4), so future modules *extend* the funnel rather than add silos.

---

## 2. Data model

### 2.1 `user_acquisition` — permanent dimension (SR-1)

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID PK → profiles(id) | one row per registered user |
| `anon_id` | UUID | pre-auth link (§8D); nullable |
| `signup_method` | TEXT | `google`\|`zalo`\|`apple`\|`email_otp`\|… (open vocab) |
| `signup_platform` | TEXT | `web`\|`android`\|`ios` (acquisition platform) |
| `signup_app_version` | TEXT | |
| `signup_device_type` | TEXT | |
| `signup_country` | TEXT | |
| `signup_language` | TEXT | |
| `acquisition_source` | TEXT | referrer/utm/campaign if available; else `organic` |
| `signup_at` | TIMESTAMPTZ | |
| `first_login_at` | TIMESTAMPTZ | |
| `last_login_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Indexes: PK(`user_id`); `(signup_method)`, `(signup_platform)`, `(acquisition_source)`, `(signup_at)`.

**Distinction:** `signup_platform` = *acquisition* platform (durable). The per-event `platform` in the envelope = *usage* platform (varies). Both preserved; never conflated.

**Population (derived from the unified pipeline + Supabase-native, no auth-flow business-logic duplication):**
- Upserted by the existing rollup cron from `auth_signup_completed` events — **first-write-wins** for signup_* fields (idempotent on `user_id`).
- `first_login_at` = first `auth_login_completed`; `last_login_at` = `auth.users.last_sign_in_at` (authoritative, free).
- `signup_method` fallback = `auth.identities.provider` when the event is absent (opt-out/loss).
- **One-time backfill** for existing users from `auth.users` (created_at, last_sign_in_at) + `auth.identities` (provider). Platform/version/device unknown for pre-instrumentation users → `unknown`.

**Retention:** long-lived (like `daily_snapshots`), **outliving raw `track_events` (90d, doc 34)** — the reason a durable dimension is required for multi-year LTV/retention-by-source.

### 2.2 `auth_daily_rollup` — auth fact (mirrors `feature_usage_rollup`)

Grain `(snapshot_date, platform, method)` → `signups, logins_success, logins_failed, first_logins, returning_logins, unique_users`. Populated by the existing `analytics-snapshot` cron. Dashboards read this, never raw events (Performance §3.1).

---

## 3. Events (Event Catalog §4 — additive within v1.1; identical across platforms per SR-2)

| Event | Status | Properties (besides the shared envelope) |
|---|---|---|
| `auth_signup_completed` | reuse | `method` |
| `auth_login_completed` | reuse + add optional | `method`, `is_first_login` |
| `auth_login_failed` | **add** | `method`, `reason` (`invalid_credentials`\|`expired`\|`oauth_denied`\|`network`) |
| `method` vocabulary | **extend** (open TEXT) | `google`, `zalo`, `apple`, `email_otp`, +future |

Every event carries the v1.1 envelope: `event_id` (idempotency), `schema_version`, `user_id`/`anon_id`, `platform`, `app_version`, `build_number`, `os_*`, `device_type`, `country`, `language`, `session_id`, timestamps. Ingestion dedups on `event_id` (§8A). **Same emission contract on Web/Android/iOS.**

---

## 4. Correlation contract (SR-1 in practice)

| Module (current/future) | Its fact | Correlation |
|---|---|---|
| Authentication | `auth_daily_rollup` | native + JOIN dim |
| AI usage | `ai_usage_log` | JOIN `user_acquisition` on user_id |
| Reviews/comments/likes/saves/shares | engagement facts | JOIN on user_id |
| Affiliate/orders | affiliate events (§12A) | JOIN on user_id |
| Notifications | `notification_deliveries` | JOIN on user_id |
| DAU/WAU/MAU, Retention | `user_active_days`, `cohort_metrics` | JOIN on user_id |
| Subscription/Revenue/LTV/Churn | `subscriptions` | JOIN on user_id |
| Any future module | its own `user_id`-keyed fact | JOIN on user_id |

**Rule:** acquisition attributes are read only via JOIN to `user_acquisition`. No fact table copies them. A `method`/`source` column is added to a specific rollup **only** if a named dashboard's performance requires pre-aggregation — default is join-at-read.

---

## 5. API (existing handler contract; platform-agnostic per SR-2)

`GET /api/admin/analytics/auth` — RBAC `analyst`+, rate-limited, uniform `{data,meta}` envelope. **Thin wrapper over `authAnalyticsService` (§5A)** — no SQL/KPI math in the handler.
- Params: `from`, `to`, `platform?` (filter), `method?` (filter), `group_by` (`method`\|`platform`\|`day`).
- Service reads `auth_daily_rollup` (+ optional JOIN to `user_acquisition` for acquisition-source cuts).
- **One implementation**; platform is a query filter, never a code branch (SR-2).
- The same endpoint/service feeds dashboards, reports, exports, and notifications (SR-4).
- `/api/track` unchanged (auth events already flow through it).

---

## 5A. Reusable analytics service layer (SR-4)

All analytics logic lives **once**, in a layered stack; every consumer calls the same services.

```
Data:      user_acquisition · auth_daily_rollup · user_active_days · cohort_metrics · subscriptions · …
              │  (facts + dimensions; joined by user_id — SR-1)
Services:  src/lib/admin/analytics/*  ← metric defs, aggregation, filtering, KPI math live ONLY here
              │  e.g. authAnalyticsService.getSignupsByProvider({from,to,platform,method})
API:       /api/admin/analytics/*     ← thin wrappers over services (RBAC, rate-limit, envelope)
              │
Consumers: Dashboards · Reporting · Export Center · Notifications · Investor/Founder views · (future) External APIs
              (presentation / delivery only — NO business logic)
```

**Rules made concrete:**
- Each metric/KPI (e.g. Login Success Rate, Signups-by-Provider, retention-by-source) is computed in **one** service function, matching its definition in KPI `25` / Business KPI `35`. Dashboards, PDF/Excel/Word/CSV reports (Reporting `08` / Export `19`), and scheduled-report notifications call **that** function — never their own SQL.
- The **API is the shared contract**; reports/exports/notifications consume the **same** `/api/admin/analytics/*` endpoints (or the same underlying service) as the dashboards. A report is a different *renderer* of identical data, per SR-3.
- **Filtering** (date, platform, method, acquisition source) is a service-level parameter set, defined once and reused by all consumers.
- **Extend-before-create:** the auth work adds `authAnalyticsService` + one endpoint; any later module (AI, reviews, revenue…) first checks whether an existing service/endpoint/rollup/dimension can be **extended** before adding new code.

**In-scope for this Phase 1 auth work:** `authAnalyticsService` (the reusable service) + its thin `/api/admin/analytics/auth` endpoint. The Authentication Dashboard **and** any auth section in Reports/Export/Investor consume this one service — no duplicated auth SQL anywhere.

---

## 6. Dashboards

**Authentication Dashboard (Stage 1 of the funnel), in User/Product Analytics (M04):**
- Signups by provider & platform; logins by provider & platform.
- **Login success vs failure rate**; failure reasons breakdown.
- First vs returning logins; new vs returning users.
- Filters: date, **platform**, **app version**, method.
- **Funnel affordance:** each acquisition segment links downstream (retention/subscription/LTV by that segment) — lit up as each downstream module ships, via the `user_acquisition` join. No re-work.

**Investor Dashboard (`15`):** acquisition row — signup mix by provider + trend (acquisition channel view).

All dashboard metrics are defined once and rendered identically regardless of platform (SR-2).

## 7. KPIs (doc 25; map to `auth_daily_rollup` + dimension)
Login Success Rate = `logins_success / (logins_success + logins_failed)`; Signups/Logins by Provider; Signup→First-Login conversion; (future) Retention/LTV/Revenue **by acquisition source** via the dimension.

---

## 8. Cross-platform aggregation (SR-2, evidence of parity)
- Web `tracker.ts`, Android tracker, iOS tracker emit identical events (Analytics §4.2–4.3).
- Rollup + snapshot crons process all platforms with one code path; `platform='all'` aggregate + per-platform rows (as `daily_snapshots` already does).
- Back Office: one metric definition; `platform` is a filter/breakdown dimension only.

---

## 9. Build scope (Phase 1) vs future-ready
- **Build now:** `auth_login_failed` + `method` vocab + `is_first_login`; `user_acquisition` dimension + population + backfill; `auth_daily_rollup` + cron extension; **`authAnalyticsService` (reusable service, SR-4)**; thin `/api/admin/analytics/auth`; Authentication Dashboard (Stage 1) + Investor acquisition row (both consuming the service); auth KPIs.
- **Future-ready (no rework):** downstream correlation panels activate by JOIN as each module ships — the dimension + `user_id` key already exist.

## 10. No-duplication & single-source guarantees
- One tracking system, one envelope, one `method` field, one aggregation path.
- Acquisition attributes stored once (`user_acquisition`); everything else joins.
- No platform-specific implementations anywhere in the Back Office (SR-2).
- **One unified analytics platform (SR-3):** shared facts + dimensions + metric definitions; Founder/Investor dashboards are curated views, not parallel pipelines. Every module is a funnel stage, not a silo.
- **Reusable services (SR-4):** KPI/aggregation/filter logic lives once in `src/lib/admin/analytics/*`; dashboards, reports, exports, notifications, and future external APIs all consume it. No duplicated SQL, KPI math, or aggregation. Extend-before-create is mandatory.

## 11. Verification plan (on implementation)
`build` / `tsc` / `lint` / `tests` green; ingestion idempotency (dup `event_id` → one row); rollup correctness (signups/logins/failures reconcile to events); dimension population + backfill correctness; a sample correlation query (e.g., D7 retention by `signup_method`) returns via JOIN with no duplicated data; dashboard renders per-platform via one code path; **SR-4 check: the dashboard and a sample report/export path both call `authAnalyticsService` (no second SQL/KPI implementation exists).**

---

**This is the final specification (v4 — incorporates SR-1, SR-2, SR-3, SR-4).** It implements v1.1 (derived dimension + join, unified pipeline, cross-platform parity, one business-oriented analytics platform, reusable single-implementation services), adds no ADR, changes no architecture, and duplicates no business logic. No genuine v1.1 conflict found.

*No code until owner approval. Phase 0 held; `8e68f42` release untouched.*
