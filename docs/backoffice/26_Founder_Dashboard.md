# TappyAI Back Office — Founder Dashboard

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the Founder Dashboard: the single operational + strategic view for founders. It differs from the Home Dashboard (which is a shared operational glance) and the Investor Dashboard (a curated, read-only external view).

| Dashboard | Audience | Purpose |
|---|---|---|
| Home | All admin roles | Quick operational glance |
| **Founder** | Founders only | Deep strategic + operational control room |
| Investor | External (shared link) | Curated, fixed, read-only |

The Founder Dashboard is gated to `super_admin` (founders) and `admin`.

---

## 2. Design Principle

The founder needs three things in one place: **is the business growing, is the product healthy, is anything on fire.** The dashboard is organized top-to-bottom in that priority.

---

## 3. Layout

### Band 1 — North-Star & Growth (top)

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│    MAU    │ │    MRR    │ │ D30 Reten.│ │ Net New   │
│  42,300   │ │  $8,450   │ │    28%    │ │   MRR     │
│ +18% MoM  │ │ +16% MoM  │ │  ▲ +2pp   │ │  +$1,200  │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
[Combined chart: MAU (bars) + MRR (line), 12 months]
```

North-star metric: **MAU** (until monetization matures, then revisit). Displayed largest.

### Band 2 — Product Health

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ DAU/MAU   │ │ AI Cost/  │ │ Free→Pro  │ │ Avg Sess. │
│ Stickiness│ │   MAU     │ │ Conversion│ │ Duration  │
│   29%     │ │  $0.08    │ │   3.2%    │ │  8m 30s   │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
[Feature usage ranking — horizontal bars]
[Core funnel: Open→Chat→Search→Rec→Affiliate→Redirect]
```

### Band 3 — Operations & Risk (bottom)

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ Moderation│ │  System   │ │ AI Cost   │ │  Crash    │
│  Queue: 12│ │  Health   │ │  Today    │ │  Rate     │
│  ⚠ 2 urgent│ │   🟢 OK   │ │  $12.45   │ │  0.1%     │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
[Recent significant audit events — last 10]
[AI cost trend — 30 days, with budget threshold line]
```

---

## 4. Data Sources

| Band | Sources |
|---|---|
| Growth | `daily_snapshots`, `cohort_metrics`, `subscriptions` |
| Product Health | `daily_snapshots`, `feature_usage_rollup`, PostHog funnels, `ai_usage_log` |
| Operations | `moderation_queue`, `system_health_log`, `ai_usage_log`, `version_analytics`, `audit_log` |

All from pre-computed tables — no raw event scans (Performance §3.1).

---

## 5. Interactions

- **Global date range** applies to Bands 1 & 2 (Band 3 is always "now / today").
- **Platform filter** (All / Web / Android / iOS).
- **Drill-down:** clicking any KPI opens the corresponding full analytics module.
- **Alerts strip:** if AI cost exceeds daily budget, or moderation has urgent items, or system health is degraded, a colored alert bar appears at the very top.

---

## 6. Founder-Only Capabilities

- One-click "Generate Founder Report" (PDF+Excel) for the selected date range.
- One-click "Generate Investor Report".
- Toggle "include anonymous" on active-user metrics.
- Set/adjust the AI daily budget threshold (writes to Settings; audit logged).

---

## 7. Refresh & Performance

- Bands 1 & 2: served from `daily_snapshots`, cached 60s (Performance §4.1).
- Band 3 operational tiles: 30s cache.
- Target full load < 1s (server-rendered KPI tiles, client-hydrated charts).

---

## 8. Access Control

| Role | Access |
|---|---|
| `analyst`, `moderator` | ❌ No access (use Home + their modules) |
| `admin` | ✅ View, drill-down, generate reports |
| `super_admin` | ✅ Full + budget threshold control |

---

*End of Founder Dashboard*
