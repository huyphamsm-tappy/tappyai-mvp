# TappyAI Back Office — Data Retention Policy

**Version:** 1.0  
**Status:** APPROVED (v1.0 — 2026-07-13)  
**Date:** 2026-07-13

---

## 1. Objective

Define the authoritative retention window, deletion mechanism, and rationale for every data category. This consolidates the retention rules previously in Database Architecture (`04` §10), Database Governance (`29` §7), and Audit Log (`13` §8) into one binding policy.

**Rule:** Where any document states a retention window, this document is authoritative. Others reference it.

---

## 2. Retention Principles

| Principle | Meaning |
|---|---|
| **Keep the source of every live metric** | A derived metric's raw source is retained at least as long as the metric needs it. |
| **Minimize raw PII lifetime** | Raw, identifying rows are the shortest-lived layer. |
| **Aggregate for the long term** | De-identified aggregates are retained for trend analysis. |
| **Immutable legal records persist** | Audit logs are retained for the compliance window regardless of other rules. |
| **Erasure overrides retention** | A valid erasure request is honored before the window ends (except audit log). |

---

## 3. Retention Schedule (Authoritative)

| Data | Class | Retention | Deletion Mechanism | Rationale |
|---|---|---|---|---|
| `track_events` (raw) | C1 (pseudonymous) | **90 days** | Monthly delete past window (or partition drop at scale) | Rolled into snapshots; raw only needed for recompute/reconcile |
| `ai_usage_log` | C1 | **90 days** | Monthly prune | Rolled into snapshots; cost detail window |
| `user_active_days` | C1 | **400 days** | Prune older | Supports 13-month retention/cohort lookback |
| `daily_snapshots` | C1 (aggregate) | **3 years** | Retained | Long-term trends; small footprint |
| `feature_usage_rollup` | C1 | **3 years** | Retained | Long-term feature trends |
| `cohort_metrics` | C1 | **3 years** | Retained | Retention history |
| `version_analytics` | C1 | **3 years** | Retained | Release history |
| `notification_deliveries` | C1/C2 | **1 year** | Prune | Campaign analysis window |
| `in_app_messages` | C1 | **1 year** | Prune (read/dismissed) | Delivery record |
| `moderation_queue` (resolved) | C1/C2 | **2 years** | Prune resolved | Safety history / repeat-offender detection |
| `moderation_actions` | C2 | **2 years** | Prune | Enforcement record |
| `report_jobs` + files | varies | **30 days** (files), 1 yr (metadata) | Blob expiry + prune | Reports are regenerable |
| `system_health_log` | C1 | **30 days** | Prune | Operational only |
| `experiment_assignments` | C1 | **1 year** after experiment end | Prune | Analysis reproducibility |
| `investor_share_grants` | C2 | **1 year** after expiry | Prune | Access audit trail |
| `audit_log` | Legal | **≥ 365 days** (configurable; **archive before delete**) | Monthly prune post-archive | Compliance; immutable |
| `user_notes` (CRM) | C1 | Life of account + 90 days | Cascade on erasure | Support context |
| `profiles` | C2 | Life of account; PII anonymized on erasure | Soft-delete anonymize | Referential integrity |

---

## 4. Deletion Mechanisms

| Mechanism | Used For | Notes |
|---|---|---|
| **Scheduled prune cron** | Time-boxed tables | Monthly `retention-cleanup` cron per table window |
| **Partition drop** | `track_events` at scale | Instant; replaces bulk delete once partitioned (`29` §8) |
| **Soft-delete anonymize** | `profiles` on erasure | PII nulled, rows kept for integrity (`10`, `33`) |
| **Cascade** | Child rows (active_days, notes, overrides) | FK `ON DELETE CASCADE` |
| **Archive-then-delete** | `audit_log` | Cold-storage archive before window prune (archive = Future Rec.) |

A single `retention-cleanup` cron (daily) enforces the schedule; each run logs what it pruned to `system_health_log`.

---

## 5. Interaction With Erasure

An erasure request (`33` §6):
- Immediately anonymizes/removes the subject's PII and identity links regardless of remaining retention window.
- Leaves de-identified aggregates intact (they contain no PII).
- Does **not** remove `audit_log` entries — retained as a legal record with a documented lawful basis.

---

## 6. Configuration & Change Control

- `audit_log` retention is configurable via Settings (`super_admin`); default 365 days. Changing it is audit-logged.
- All other windows are fixed by this policy; changing any window requires an **ADR** (post-freeze rule) plus updating this table.
- Retention windows are chosen so **no live dashboard metric loses its source** — verify this invariant whenever a window is proposed for reduction.

---

## 7. Verification

Before go-live and quarterly thereafter:
- Confirm the `retention-cleanup` cron runs and matches this table.
- Confirm every dashboard metric's source table outlives the metric's displayed range.
- Confirm erasure removes all mapped PII locations (§5, `33` §6).

---

## 8. Future Recommendations

> NOT in scope.

- Cold-storage archival of `audit_log` and old snapshots (S3/Glacier) before deletion.
- Legal-hold mechanism to suspend deletion for specific users under investigation.
- Per-jurisdiction retention overrides if TappyAI expands beyond Vietnam.

---

*End of Data Retention Policy*
