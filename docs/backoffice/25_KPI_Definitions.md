# TappyAI Back Office — KPI Definitions

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define every Key Performance Indicator with an exact, unambiguous formula, its source, and its refresh cadence. This is the single source of truth for what each metric *means*. Dashboards and reports must compute metrics exactly as defined here.

All day boundaries are **Asia/Ho_Chi_Minh (UTC+7)**. All active-user counts derive from `user_active_days`.

---

## 2. Growth KPIs

| KPI | Formula | Source | Cadence |
|---|---|---|---|
| **Total Users** | `COUNT(*)` of registered profiles as of day D | `profiles` | Daily |
| **New Users** | `COUNT(profiles WHERE created_at ∈ period)` (VN time) | `profiles` | Daily |
| **Returning Users** | Users active in period P who were also active in period P−1 | `user_active_days` | Daily |
| **User Growth Rate** | `(new_users_period / total_users_start_of_period) × 100` | derived | Daily |
| **Churned Users (Nd)** | Users active in prior N-day window but 0 activity in current N-day window | `user_active_days` | Daily |
| **Churn Rate (Nd)** | `churned_users / active_users_prior_window × 100` | derived | Daily |

---

## 3. Engagement KPIs

| KPI | Formula | Source |
|---|---|---|
| **DAU** | `COUNT(DISTINCT user_id) WHERE active_date = D` | `user_active_days` |
| **WAU** | `COUNT(DISTINCT user_id) WHERE active_date ∈ [D−6, D]` | `user_active_days` |
| **MAU** | `COUNT(DISTINCT user_id) WHERE active_date ∈ [D−27, D]` | `user_active_days` |
| **Stickiness** | `DAU / MAU` (report as %) | derived |
| **Sessions/User/Day** | `total_sessions_D / DAU_D` | `daily_snapshots` |
| **Avg Session Duration** | `SUM(session_duration) / COUNT(sessions)` | `daily_snapshots` |
| **App Opens** | `COUNT(app_session_started)` | `track_events` |

> **MAU window note:** 28 days (4×7) is chosen over 30 to keep the window a whole number of weeks, removing day-of-week bias. This is a deliberate convention; report labels say "MAU (28d)".

---

## 4. Retention & Cohort KPIs

| KPI | Formula | Source |
|---|---|---|
| **D1 Retention** | Of a cohort registered on day C, % active on day C+1 | `cohort_metrics` |
| **D7 Retention** | % of cohort C active on day C+7 | `cohort_metrics` |
| **D30 Retention** | % of cohort C active on day C+30 | `cohort_metrics` |
| **Rolling Retention (optional)** | % of cohort active on **any** day ≥ C+N | `user_active_days` |

Retention uses **classic (bracket) retention** for D1/D7/D30 (active on exactly that day). Rolling retention is offered as a secondary view. Always label which is shown.

---

## 5. AI KPIs

| KPI | Formula | Source |
|---|---|---|
| **AI Conversations** | `COUNT(chat_conversation_started)` | `track_events` |
| **AI Messages** | `COUNT(chat_message_sent)` | `track_events` |
| **Messages/Conversation** | `ai_messages / ai_conversations` | derived |
| **Input/Output Tokens** | `SUM(input_tokens)`, `SUM(output_tokens)` | `ai_usage_log` |
| **AI Cost** | `SUM(cost_usd)` | `ai_usage_log` |
| **AI Cost/User** | `ai_cost / DAU` (or per MAU — label which) | derived |
| **AI Cost/Conversation** | `ai_cost / ai_conversations` | derived |
| **Response Latency p50/p95/p99** | percentiles of `latency_ms` | `ai_usage_log` |
| **AI Error Rate** | `COUNT(error IS NOT NULL) / COUNT(*)` | `ai_usage_log` |
| **Regeneration Rate** | `COUNT(chat_message_regenerated) / ai_messages` | `track_events` |
| **Free Quota Exhausted Users** | `COUNT(DISTINCT user_id WHERE chat_quota_reached)` | `track_events` |

---

## 6. Business / Revenue KPIs

| KPI | Formula | Source |
|---|---|---|
| **MRR** | `SUM(active subscription monthly price)` normalized to monthly | `subscriptions` + Stripe |
| **ARR** | `MRR × 12` | derived |
| **New MRR** | MRR added by new subscriptions in period | derived |
| **Churned MRR** | MRR lost from cancellations in period | derived |
| **Net New MRR** | `New MRR − Churned MRR` | derived |
| **Active Subscriptions** | `COUNT(subscriptions WHERE status = active)` | `subscriptions` |
| **Free→Pro Conversion** | `new_pro_subs / active_free_users × 100` (period) | derived |
| **ARPU** | `MRR / MAU` | derived |
| **AI Gross Margin (est.)** | `(Revenue − AI Cost) / Revenue × 100` | derived |

> **Margin caveat:** "AI Gross Margin" accounts only for AI cost, not infra/payment fees/staff. It is labeled "(est.)" everywhere and must never be presented to investors as true gross margin.

---

## 7. Funnel KPIs (Core Product Funnel)

Funnel: **App Open → AI Chat → Search → Recommendation → Affiliate Click → External Redirect**

| Step Conversion | Formula |
|---|---|
| Open→Chat | `users(chat_conversation_started) / users(app_session_started)` |
| Chat→Search | `users(search_performed) / users(chat_conversation_started)` |
| Search→Recommendation | `users(recommendation_shown) / users(search_performed)` |
| Recommendation→Affiliate | `users(affiliate_link_clicked) / users(recommendation_shown)` |
| Affiliate→Redirect | `users(external_redirect_completed) / users(affiliate_link_clicked)` |

Funnels are computed on distinct users within a chosen window, and (via PostHog) also as time-ordered sequences. Signup-boundary funnels use `anon_identity_map` to stitch anonymous → registered.

---

## 8. Notification KPIs

| KPI | Formula | Source |
|---|---|---|
| **Sent** | `COUNT(notification_deliveries WHERE status ≥ sent)` | `notification_deliveries` |
| **Delivered** | `COUNT(status ≥ delivered)` (best-effort; web push unreliable) | `notification_deliveries` |
| **Open Rate** | `opened / delivered × 100` | derived |
| **Click Rate (CTR)** | `clicked / delivered × 100` | derived |
| **Conversion** | `users who did target action after click / clicked` | derived + `track_events` |

---

## 9. Release / Quality KPIs

| KPI | Formula | Source |
|---|---|---|
| **Version Adoption** | `active_users_on_version / total_active_users × 100` | `version_analytics` |
| **Crash Rate** | `crash_count / sessions × 100` (per version) | `version_analytics` |
| **Error Rate** | `error_count / sessions` (per version) | `version_analytics` |
| **Startup Time** | p50/p95 of `app_startup_ms` property on `app_session_started` | `track_events` |

---

## 10. KPI Governance

- Every KPI shown on any dashboard MUST map to a row in this document.
- Changing a formula requires an ADR (`22_Architecture_Decision_Records.md`) because it breaks historical comparability.
- Each KPI card in the UI links to its definition here (tooltip or "?" affordance).
- Estimated/proxy metrics MUST be labeled "(est.)".

---

*End of KPI Definitions*
