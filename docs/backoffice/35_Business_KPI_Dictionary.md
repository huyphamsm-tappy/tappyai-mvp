# TappyAI Back Office — Business KPI Dictionary

**Version:** 1.0  
**Status:** APPROVED (v1.0 — 2026-07-13)  
**Date:** 2026-07-13

---

## 1. Objective

Provide a **business-stakeholder-facing** glossary of the KPIs that describe TappyAI as a business — for founders, investors, and the board. Each entry gives a plain-language definition, why it matters, and how it is derived.

This complements `25_KPI_Definitions.md` (the engineering formula reference). Where a formula is needed, this document points to `25`. If the two ever conflict, `25` is authoritative for computation; this document is authoritative for business meaning and framing.

Metrics that require data TappyAI does not yet capture (e.g. acquisition spend) are marked **FUTURE** — defined now for consistency, populated when the inputs exist.

---

## 2. Growth Metrics

| KPI | Plain Definition | Why It Matters | Derivation |
|---|---|---|---|
| **Total Users** | Everyone who has ever registered. | Top-line reach. | `25` §2 |
| **New Users** | First-time registrations in the period. | Acquisition velocity. | `25` §2 |
| **MAU (28d)** | Distinct registered users active in the last 28 days. | The north-star reach metric. | `25` §3 |
| **DAU** | Distinct registered users active today (VN time). | Daily habit strength. | `25` §3 |
| **Growth Rate (MoM)** | % change in MAU vs last month. | Momentum; investor headline. | `25` §2 |
| **Stickiness** | DAU ÷ MAU. | How habitual the product is (higher = more daily). | `25` §3 |

---

## 3. Retention & Churn

| KPI | Plain Definition | Why It Matters | Derivation |
|---|---|---|---|
| **D1 / D7 / D30 Retention** | % of a signup cohort still active 1 / 7 / 30 days later. | Product-market-fit signal; the engine of compounding growth. | `25` §4 |
| **User Churn (30d)** | % of active users who went silent over 30 days. | Leak in the bucket. | `25` §2 |
| **Resurrection Rate** | % of dormant users who return. | Effectiveness of win-back. | `27` §2 |

---

## 4. Monetization Metrics

| KPI | Plain Definition | Why It Matters | Derivation |
|---|---|---|---|
| **MRR** | Monthly recurring revenue from active subscriptions. | The core revenue heartbeat. | `25` §6 |
| **ARR** | MRR × 12. | Annualized run-rate; standard investor figure. | `25` §6 |
| **New MRR** | MRR added by new subscribers this period. | Growth of revenue. | `25` §6 |
| **Churned MRR** | MRR lost to cancellations this period. | Revenue leakage. | `25` §6 |
| **Net New MRR** | New MRR − Churned MRR. | Net revenue momentum. | `25` §6 |
| **Net Revenue Retention (NRR)** | Revenue this period from last period's cohort ÷ their prior revenue. **FUTURE** (needs expansion/contraction tracking). | Whether existing customers grow in value. | expansion − contraction + retained |
| **Active Subscriptions** | Count of paying subscriptions. | Paying customer base. | `25` §6 |
| **Free→Pro Conversion** | % of free users who become paying. | Monetization efficiency of the funnel. | `25` §6 |
| **Revenue Churn Rate** | Churned MRR ÷ starting MRR. | Revenue stickiness. | `25` §6 |

---

## 5. Unit Economics

| KPI | Plain Definition | Why It Matters | Derivation |
|---|---|---|---|
| **ARPU** | Average revenue per monthly active user (MRR ÷ MAU). | Monetization density across all users. | `25` §6 |
| **ARPPU** | Average revenue per *paying* user (MRR ÷ active subs). | Price realization. | MRR ÷ active_subscriptions |
| **AI Cost / MAU** | Anthropic spend ÷ MAU. | Largest variable cost per user. | `25` §5 |
| **AI Gross Margin (est.)** | (Revenue − AI cost) ÷ Revenue. **Labeled (est.)** — AI cost only. | Rough contribution before infra/staff. | `25` §6 |
| **LTV** | Lifetime value of a customer. **FUTURE** (needs stable churn + margin). | Ceiling on acquisition spend. | ARPPU × gross margin ÷ churn |
| **CAC** | Customer acquisition cost. **FUTURE** (needs marketing spend input). | Cost to buy a customer. | acquisition spend ÷ new customers |
| **LTV:CAC** | LTV ÷ CAC. **FUTURE**. | Efficiency of growth spend (>3 healthy). | derived |
| **CAC Payback** | Months to recover CAC. **FUTURE**. | Cash-flow risk of growth. | CAC ÷ (ARPPU × margin) |

**Honesty rules (mandatory):**
- Estimated metrics carry "(est.)" everywhere they appear.
- FUTURE metrics are shown as "not yet available" — never fabricated or back-filled with guesses.
- "Gross margin (est.)" is never presented to investors as true gross margin (`25` §6 caveat).

---

## 6. Engagement→Revenue Bridge

| KPI | Plain Definition | Why It Matters | Derivation |
|---|---|---|---|
| **Quota-Exhausted Users** | Free users who hit the daily AI limit. | The paywall pressure pool → conversion target. | `25` §5 |
| **Affiliate Click-Through** | Users reaching an external affiliate redirect. | The non-subscription monetization path. | `25` §7 |
| **Activation Rate** | % of new users reaching the "aha" moment. | Leading indicator of retention & revenue. | `27` §2 |

---

## 7. Investor Headline Set

The metrics an investor sees first (Investor Dashboard `15`, Founder Dashboard `26`):

1. **MAU** + MoM growth
2. **MRR** + ARR
3. **D30 Retention**
4. **Net New MRR**
5. **Stickiness (DAU/MAU)**
6. **Free→Pro Conversion**

These six are the agreed executive summary. All are actuals (no FUTURE metric in the headline set), keeping investor reporting fully substantiated.

---

## 8. Governance

- Every business KPI shown to stakeholders maps to an entry here and a formula in `25`.
- Changing a business definition (even wording that implies a different calc) requires an ADR post-freeze.
- FUTURE metrics move to active status via an ADR once their input data is captured.

---

*End of Business KPI Dictionary*
