# TappyAI Back Office — Performance Architecture

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define performance architecture for the Back Office Platform ensuring fast dashboards, efficient queries, and responsive user interfaces without over-engineering for premature scale.

---

## 2. Performance Targets

| Page | Target Load Time | Strategy |
|---|---|---|
| Home Dashboard | < 1s | Server-rendered from `daily_snapshots` |
| Analytics pages | < 2s | Pre-computed aggregates + client-side charts |
| User list (page 1) | < 1s | Indexed query + cursor pagination |
| User 360 | < 2s | Parallel queries (profile + activity + stats) |
| Moderation queue | < 1s | Indexed by status + priority |
| Report generation | Async (< 30s) | Background worker + polling |
| Export generation | Async (< 60s for large exports) | Background worker |

---

## 3. Query Strategy

### 3.1 Dashboard Queries — Never Hit Raw Tables

The Home Dashboard and Analytics pages **must never query raw `track_events`** for aggregations.

All aggregate queries go against `daily_snapshots`, `feature_usage_rollup`, `cohort_metrics`, `version_analytics`.

These tables are pre-computed by cron jobs and serve sub-millisecond queries for date-range sums.

**Bad pattern (never do this):**
```sql
-- Never in dashboard queries
SELECT COUNT(DISTINCT user_id) FROM track_events 
WHERE created_at >= NOW() - INTERVAL '30 days'
```

**Good pattern:**
```sql
-- Fast — pre-computed
SELECT SUM(dau) / COUNT(*) as avg_dau 
FROM daily_snapshots 
WHERE snapshot_date >= CURRENT_DATE - 30 AND platform = 'all'
```

### 3.2 User List — Indexed Search

User search queries must use indexed columns:

```sql
-- Indexed columns: full_name (text search), created_at, is_suspended, is_banned
SELECT id, full_name, created_at, is_suspended, is_banned
FROM profiles
WHERE full_name ILIKE $1  -- only if len > 2 to avoid full scan
ORDER BY created_at DESC
LIMIT 50 OFFSET $cursor
```

For full-text email search: use `profiles.email` only at `admin` role. Add `pg_trgm` index for fast ILIKE on full_name.

### 3.3 Cursor-Based Pagination

All list endpoints use cursor-based pagination (not offset) to avoid the N+1 query problem at large offsets.

```typescript
// Cursor encodes last seen ID + sort field value
const cursor = btoa(JSON.stringify({ id: lastId, created_at: lastCreatedAt }))
```

---

## 4. Caching

### 4.1 Server-Side Cache (In-Memory)

For extremely hot queries (Home Dashboard), use a 1-minute in-memory cache in the Vercel function:

```typescript
// src/lib/admin/cache.ts
const cache = new Map<string, { data: unknown; expires: number }>()

function getCached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>
```

**Cache keys:**
- `dashboard:home` — 60 seconds
- `analytics:daily:${date}:${platform}` — 5 minutes (historical data doesn't change)
- `moderation:queue:count` — 30 seconds

### 4.2 No Redis at MVP

Redis / Upstash is not needed at MVP scale. The in-memory cache per Vercel function instance is sufficient.

**Limitation:** Each Vercel function instance has its own cache — cache misses across instances are acceptable for a back office tool with low concurrent users.

---

## 5. Chart Performance

### 5.1 Data Volume

Charts in the back office display at most:
- 365 data points (1 per day for 12-month view)
- 12 series (one per platform or feature)

This is trivially handled by Recharts client-side with no performance concern.

### 5.2 Loading Strategy

- Page is server-rendered with KPI cards (initial data)
- Charts are client-side hydrated after page load
- Charts show a skeleton loader while their data endpoint is fetched
- No chart blocks the initial page render

---

## 6. Large Export Performance

Exports of large datasets (e.g. all users, full event log) are handled asynchronously:

```
Admin triggers export
→ API inserts job record (status=pending)
→ Returns job_id immediately
→ Vercel background function picks up job
→ Streams query results to Vercel Blob
→ Updates job status=complete with download URL
→ Admin polls for status or receives notification
```

This avoids Vercel function timeout (10s on Hobby, 300s on Pro).

For very large exports (> 100K rows), use streaming CSV:
```
→ Open Vercel Blob writable stream
→ Write CSV header
→ Paginate query in batches of 1000 rows
→ Write each batch to stream
→ Finalize stream
```

---

## 7. Background Job Queue

The analytics cron jobs must be efficient:

### `analytics-snapshot` Cron Budget

For 1M MAU scale:
- `track_events` will have ~5M rows per day
- Aggregation query must complete in < 5 minutes

Strategy:
1. Use PostgreSQL window functions for efficient aggregation
2. Process by platform in parallel if needed
3. Use a single INSERT...SELECT with aggregations
4. Run just after the VN day closes — 00:05 VN (Asia/Ho_Chi_Minh, UTC+7 = 17:05 UTC) — which is off-peak (past midnight VN), per ADR-008

---

## 8. Index Strategy

Critical indexes for back office performance (additions to existing):

```sql
-- User search
CREATE INDEX CONCURRENTLY idx_profiles_full_name_trgm 
    ON profiles USING gin(full_name gin_trgm_ops);

-- User list filters  
CREATE INDEX CONCURRENTLY idx_profiles_status 
    ON profiles(is_suspended, is_banned, created_at DESC);

-- Moderation queue
CREATE INDEX CONCURRENTLY idx_modq_status_priority 
    ON moderation_queue(status, priority DESC, created_at ASC) 
    WHERE status IN ('pending', 'in_review');

-- Track events aggregation (CRITICAL for cron performance)
CREATE INDEX CONCURRENTLY idx_track_events_date_platform 
    ON track_events(DATE(created_at), platform);
```

---

## 9. Connection Pooling

Back office queries use Supabase's existing PgBouncer connection pooler.

The admin Supabase client (`supabaseAdmin`) must use the pooled connection URL (not direct).

Back office has at most 5–10 concurrent admin users — no connection pool pressure at MVP.

---

*End of Performance Architecture*
