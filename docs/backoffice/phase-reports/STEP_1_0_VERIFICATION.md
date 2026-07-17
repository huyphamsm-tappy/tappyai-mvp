# Step 1.0 — Verification Report (Backward Compatibility · Migration Safety · Performance)

**Purpose:** objective evidence requested before Step 1.0 approval. Evidence = repo greps, live-DB reads (project `fwznnobrdctuskgrvuik`), static checks, and measured/calculated numbers.

---

## 1. Backward Compatibility

### 1.1 Complete list of consumers of `tracker.ts` / `/api/track` / `user_events`

**A. Client tracker (via `track()` / `useTrack`) — payload path changed, signature unchanged:**
| Consumer | Events | Status |
|---|---|---|
| `components/TrackingProvider.tsx` → `hooks/useTrack.ts` | `page_view`, `page_time` (auto) | ✅ unmodified |
| `app/reviews/page.tsx` | `review_search`, `review_like`×2, `place_save`, `review_share` | ✅ unmodified |

**B. Server-side DIRECT `user_events` writers (separate path — NOT via the tracker; untouched by Step 1.0):**
| Consumer | Op | Status |
|---|---|---|
| `lib/userMemory.ts:43` | `insert` | ✅ unaffected |
| `app/api/reviews/[id]/like/route.ts:41` | `insert` (sets `review_id`/`place_id`) | ✅ unaffected |

**C. Server-side `user_events` readers:**
| Consumer | Op | Status |
|---|---|---|
| `lib/preferences/signalCollector.ts:51` | `select` | ✅ unaffected |
| `app/api/cron/behavior-rollup/route.ts:63,74` | `select` (7-day) | ✅ unaffected (new `created_at` index helps) |
| `lib/userMemory.ts:60` | `select` | ✅ unaffected |
| `app/api/reviews/[id]/like/route.ts:52` | `select` | ✅ unaffected |

### 1.2 Evidence per required property
- **Still works without modification:** the public API `track(event_type, metadata)` signature is **unchanged**; the envelope is attached internally. Grep confirms no caller used the removed object form. Direct writers/readers (B, C) use their own SQL and are untouched by the tracker/envelope change. **`tsc`, `lint`, `build`, `24 tests`, `architecture:check` all pass** → no consumer broke at compile/test time.
- **No event lost:** tracker batching/flush (`10 events / 10s / sendBeacon`) is unchanged. Ingestion is now **more** permissive: batch cap **100** (was 20) and unknown event types are **accepted+tagged** (the old `ALLOWED_TYPES` filter silently **dropped** non-allowlisted events). → strictly **≤** prior loss.
- **No payload changed unexpectedly:** the stored `event_type`, `metadata`, and `user_id` hold the **same values** as before; the envelope only **adds** new columns. No existing field's value changes.
- **No preference-profiling regression:** rebuild trigger set is **identical** — old `needsRebuild` = `{chat_search, review_search, hide, not_interested, report}`; new `REBUILD_SIGNALS` = the same set, still authenticated-users-only. Evidence: `route.ts` diff.

---

## 2. Database Migration Safety

**Before-state (live-DB read, objective):**
`cols=[id, user_id, event_type, metadata, created_at, place_id, review_id]` · `rows=2011` · `event_type CHECK present=1` · `identity_check=0` · `event_id UNIQUE=0` · `user_id is NOT NULL`.

| Requirement | Evidence / reasoning | Verdict |
|---|---|---|
| **Existing rows untouched** | All statements are `ADD COLUMN` (constant defaults → **no table rewrite** on PG 11+/Supabase PG 15), `DROP NOT NULL` (no rewrite), `DROP CONSTRAINT` (no row change), `ADD CONSTRAINT … NOT VALID` (**no scan/rewrite**), `CREATE INDEX` (builds index, doesn't modify rows). **Zero `UPDATE`/`DELETE`.** The 2011 rows' data is unchanged. | ✅ |
| **Fully additive** | Before-state shows the envelope columns are **absent** → migration only **adds**. Nothing dropped except a CHECK *constraint* (not data, not a column). | ✅ |
| **Idempotent** | `ADD COLUMN IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `DROP … IF EXISTS`, the new constraint guarded by `DO $$ IF NOT EXISTS`, and `DROP NOT NULL` is a safe no-op on re-run. Re-running = no-op. | ✅ |
| **APIs work before & after** | Old code writes `{user_id, event_type, metadata}` → valid against **both** the old and migrated schema (extra columns default/null; dropped CHECK doesn't restrict it). New code requires the migration. Only unsafe window = **new code before migration** → documented **apply-migration-first** order. | ✅ |
| **Rollback** | **No DB rollback required:** the additive columns are harmless to old code — revert the code (Vercel **Instant Rollback**) and old code runs against the migrated schema unchanged. *(Full DB revert, if ever wanted: drop the added columns/indexes/constraint + re-add the `event_type` CHECK; re-adding `user_id NOT NULL` is only safe once any anon rows are removed.)* | ✅ |
| **No downtime** | On a **2011-row** table, every operation is metadata-only or a trivial index build (milliseconds); no table rewrite, no long lock. | ✅ |

---

## 3. Performance Impact

| Metric | Value | Basis |
|---|---|---|
| **Payload delta (network)** | **+359 bytes/event** (126 → 485 JSON); ≈ **3.5 KB per 10-event batch** | **Measured** (Node `Buffer.byteLength` on representative old vs new event) |
| **DB storage/event** | **≈ 130–160 bytes/row** added | Calculated: 2× uuid (32B) + smallint (2B) + timestamptz (8B) + bool (1B) + ~9 short text fields (~80B) + varlena headers. e.g. at 100k events/day ≈ **13–16 MB/day** (before the 90-day retention prune, doc 34) |
| **Write overhead** | Negligible | `upsert` = `INSERT … ON CONFLICT (event_id) DO NOTHING` → one unique-index probe per insert; + maintain 4 indexes (small) |
| **Index overhead** | 4 new indexes (`uq event_id`, `created_at`, `(event_type, created_at)`, partial `anon_id`) | Trivial at 2011 rows; scales linearly; required for rollup performance (Performance §3.1). Partial `anon_id` index only covers anon rows. |
| **Impact on existing queries** | **Neutral-to-positive** | Existing readers `SELECT` by `user_id`/`created_at`; added columns don't change their plans. New `created_at` / `(event_type, created_at)` indexes **benefit** the `behavior-rollup` 7-day scan. |

---

## Summary
- **Backward compatibility:** all 8 consumers verified compatible; identical preference-rebuild behavior; no event loss (strictly improved); no existing field value changed. Static suite green.
- **Migration safety:** additive, idempotent, zero row mutation, no downtime on a 2011-row table, code-only rollback.
- **Performance:** +359 B/event network, ~130–160 B/row storage, negligible write cost, index cost trivial now and query-positive for rollups.

*No code beyond Step 1.0 scope. Migration not applied; Phase 0 held; `8e68f42` untouched. Awaiting Step 1.0 approval.*
