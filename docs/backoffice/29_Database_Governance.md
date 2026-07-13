# TappyAI Back Office — Database Governance

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the rules for evolving the database safely: migration process, naming conventions, RLS discipline, enum changes, indexing, retention, and partitioning. `04_Database_Architecture.md` defines *what* the schema is; this document defines *how it changes and stays healthy*.

---

## 2. Migration Process

TappyAI uses Supabase migrations (`supabase/migrations/`, timestamped SQL files — existing convention).

| Rule | Requirement |
|---|---|
| **Forward-only** | Migrations are additive and forward-only. No destructive migration without an ADR. |
| **Reversible intent** | Every migration documents how to reverse it (even if reversal is manual). |
| **Idempotent DDL** | Use `IF NOT EXISTS` / `IF EXISTS` so re-runs are safe. |
| **No data loss by default** | Dropping a column requires a two-step deploy: (1) stop writing, ship; (2) drop later, after verification. |
| **Applied by owner** | Migrations are applied to prod by the owner via Supabase (existing practice — Claude never applies prod migrations). |
| **Reviewed** | Every migration is reviewed against this governance doc before apply. |

### Expand–Contract Pattern (for breaking schema changes)

1. **Expand:** add the new column/table; write to both old and new.
2. **Migrate:** backfill; switch reads to new.
3. **Contract:** stop writing old; drop old in a later release.

This keeps deploys zero-downtime and safe for native apps still reading the old shape.

---

## 3. Naming Conventions

| Object | Convention | Example |
|---|---|---|
| Table | plural snake_case | `daily_snapshots` |
| Column | snake_case | `snapshot_date` |
| Primary key | `id` (UUID) | `id UUID PRIMARY KEY` |
| Foreign key | `<entity>_id` | `user_id` |
| Boolean | `is_` / `has_` | `is_final` |
| Timestamp | `_at` | `created_at` |
| Date | `_date` | `active_date` |
| Index | `idx_<table>_<cols>` | `idx_audit_log_actor` |
| Unique index | `uq_<table>_<cols>` | `uq_track_events_event_id` |
| Enum type | singular snake_case | `admin_role` |

Timestamps are `TIMESTAMPTZ` stored in UTC. Money columns carry an explicit currency suffix.

---

## 4. RLS Discipline

| Rule | Requirement |
|---|---|
| **RLS on by default** | Every new table has RLS enabled at creation. |
| **Admin writes via service role** | Back office mutations use `supabaseAdmin`; authorization is enforced in the API layer (Security §4). |
| **Deny-by-default** | No table is world-readable. Analytics tables deny all direct user access. |
| **Audit log immutability** | `audit_log` has INSERT-only access and NO update/delete policy (ADR-007). |
| **Policy tests** | Each RLS policy has a documented expected-access matrix (who can read/write). |

---

## 5. Enum Change Procedure

Postgres enums cannot easily remove values. Therefore:

- **Adding** a value: `ALTER TYPE ... ADD VALUE` (safe, forward-only). Update `24_Data_Dictionary.md` §5.
- **Removing** a value: not done in place. Either (a) leave it unused, or (b) migrate to a new type via expand–contract.
- Any enum change updates the Data Dictionary controlled-vocabulary table in the same PR.

Prefer enums for small, stable sets (roles, statuses). Use `TEXT` + application validation for sets that may churn (e.g. `feature_key`, provider names) to avoid enum-migration pain.

---

## 6. Indexing Strategy

| Rule | Requirement |
|---|---|
| Index every FK used in joins/filters | Yes |
| Index every column used in dashboard WHERE/ORDER | Yes |
| Create indexes `CONCURRENTLY` in prod | Avoids table locks (Performance §8) |
| Partial indexes for hot filtered queries | e.g. moderation queue `WHERE status IN (...)` |
| Review index bloat quarterly | Drop unused indexes |
| No index on high-write low-read columns without cause | Write-cost awareness |

---

## 7. Data Retention & Archival

Retention is enforced by scheduled cleanup crons (Database Architecture §10, Audit §8).

| Table | Retention | Mechanism |
|---|---|---|
| `track_events` | 90 days raw | Monthly delete past window; aggregates already in snapshots |
| `daily_snapshots` | 3 years | Kept (small) |
| `user_active_days` | 400 days | Enough for 13-month retention; older pruned |
| `audit_log` | ≥365 days (configurable) | Monthly prune; **archive before delete** (Future: cold storage) |
| `ai_usage_log` | 90 days | Rolled to snapshots then pruned |
| `notification_deliveries` | 1 year | Pruned |
| `system_health_log` | 30 days | Pruned |

Retention windows are chosen so every derived metric that needs a source still has it (e.g. `user_active_days` outlives the raw events that produced it).

---

## 8. Partitioning (Scale Trigger)

`track_events` is the highest-volume table. **Not partitioned at MVP.**

**Trigger:** when `track_events` exceeds ~50M rows or inserts/deletes slow measurably, convert to monthly range partitioning on `created_at`. This makes retention a partition-drop (instant) instead of a bulk delete, and keeps queries pruned. Documented as the migration path; not built prematurely (ADR-002 philosophy).

---

## 9. Backup & Recovery

- Supabase automated daily backups + point-in-time recovery (Pro) — Security §11.
- Derived tables (`daily_snapshots`, `user_active_days`, etc.) are **recomputable** from `track_events` within the retention window — they are a cache, not primary data. Primary data = `profiles`, `subscriptions`, `reviews`, `audit_log`, raw `track_events`.
- Recovery drills: verify snapshot recomputation from raw events at least once before go-live.

---

## 10. Change Process

| Change | Required |
|---|---|
| New table | PR updating `04_Database_Architecture.md` + RLS + access matrix |
| New column | PR (additive) |
| Drop column/table | ADR + expand–contract two-step |
| Enum value add | PR + Data Dictionary update |
| Retention change | Update this doc + cron |
| Partitioning | ADR (scale trigger reached) |

---

*End of Database Governance*
