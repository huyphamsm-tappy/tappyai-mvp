# TappyAI — Canonical Database Architecture (Classification & Specification)

Date: 2026-07-05 · **Analysis only — no migrations, no SQL, no partial DDL generated.** Every classification is backed by concrete repo/API evidence. "Production" facts come from live read-only introspection; nothing is inferred.

Principle applied throughout: **the repository defines the canonical, long-term TappyAI architecture — the production database does not.** A production object is added to the canon only when supported by *both* actual code usage *and* the current product roadmap.

---

## 1. Production-Only Objects

Objects present in production but absent from the repository's `CREATE TABLE` set. **Scope note (honest limitation):** PostgREST introspection can enumerate **tables** and **RPC functions**; the Storage API enumerates **buckets**. It **cannot** enumerate production-only **views, triggers, indexes, RLS policies, or extensions** — so this list is complete for tables/RPC/buckets only.

| Object | Type | Category | Evidence | Decision |
|---|---|---|---|---|
| `reviews` | table (24 cols) | **A — Canonical** | Referenced in `api/reviews/{route,feed,saved,[id]/*}`, `notifications/route.ts`, `admin/analytics`, frontend `reviews/*`; ALTER-ed by 10+ migrations (counter triggers, music, update policy, backfill) | **Must exist in repo** (base DDL missing) |
| `review_saves` | table (4 cols) | **A — Canonical** | `api/reviews/{feed,saved,[id]/save}`, `reviews/page.tsx`, `reviews/[id]/page.tsx`, `signalCollector.ts`; ALTER-ed by save-count trigger fix + backfill + explore_upgrade | **Must exist in repo** (base DDL missing) |
| `favorites` | table (7 cols) | **A — Canonical** | `api/favorites/route.ts` (GET/POST/DELETE), `ChatInterface` FavoriteToggle, `profile/favorites`; roadmap lists **Favorites** | **Must exist in repo** (base DDL missing — *zero* migrations touch it) |
| `vouchers` | table (12 cols) | **C — Legacy / Experimental** | **Zero** references in `src/` (frontend, backend, API), **zero** migrations. Roadmap: Shopping = **Affiliate only** (no voucher/coupon/marketplace) | **Exclude — do NOT recreate** |
| `get_interaction_avgs`, `increment_review_view`, `sync_review_watch_stats` | RPC functions | (already canonical) | All three defined in repo migrations (`add_phase4*`, `add_counter_security_definer.sql`) | Already in repo — no action |
| (storage buckets) | storage | n/a | Storage API → **0 buckets**. App uploads use **Vercel Blob** (`@vercel/blob`), not Supabase Storage | Nothing to canonicalize |

**Not enumerable via API (must be reconciled from a real dump — see §5):** production-only views, triggers, indexes, RLS policies, extensions.

---

## 2. Canonical Database Specification (design only — no SQL)

For each Category-A object: what the long-term architecture requires. Column facts are from live introspection; security/constraint *expectations* are derived from **code evidence** (e.g. an `onConflict` proves a unique constraint exists) and are stated as expectations to be confirmed against the dump — **not** invented DDL.

### 2.1 `reviews` — core social content
- **Purpose:** user-generated place reviews / short-video posts powering the Reviews feed (TikTok-style), Explore, and personalization signals.
- **Ownership:** `user_id → profiles(id)` (author). Rows are public unless `is_hidden`.
- **Columns (live):** id, user_id, place_id, place_name, place_address, rating, body, is_hidden, created_at, photos[], is_verified, like_count, comment_count, content_type, media_url, thumbnail, hashtags[], watch_time_avg, completion_rate, save_count, source_type, source_url, view_count, music(jsonb).
- **Relationships:** parent of `review_likes`, `review_comments`, `review_saves`, `review_interactions`, `review_milestones` (all `review_id → reviews(id)`).
- **APIs:** `api/reviews/route.ts` (create/list), `feed`, `saved`, `[id]/{like,save,comments,interact,route}`; read in `notifications`, `admin/analytics`.
- **Frontend:** `reviews/page.tsx` (feed), `reviews/[id]`, `reviews/new`, `reviews/creator/[id]`, `profile/posts`.
- **Backend/services:** `signalCollector.ts`, `explore/*`, counter triggers.
- **Business rules:** one review per (user, place) for verified reviews (route enforces 409); denormalized counters (`like_count/comment_count/save_count/view_count`) maintained by triggers; `feed_score`/trending computed from counters + recency.
- **Security expectation (from code):** anon/public **SELECT of non-hidden rows** (feed works logged-out — confirmed live: `reviews?select=id` returns rows to anon); INSERT/UPDATE/DELETE restricted to the author (`is_hidden` moderation is author-scoped today). *Repo has the UPDATE policy (`20260703_add_reviews_update_policy.sql`) but references a "Read visible reviews" SELECT policy that lives only in prod.*
- **Expected indexes (from query patterns):** created_at, feed/trending score, hashtags (GIN), view_count, content_type, **user_id** (missing — added by `add_gatea_db_hardening.sql`).
- **Expected constraints:** `rating` range, `content_type`/`source_type` allowlists (referenced by code), FK `user_id → profiles`.
- **Migration dependencies:** base table must precede `add_review_social`, `add_social_week2`, `add_explore_upgrade`, `add_phase4*`, the 20260703 trigger fixes, `add_reviews_music_column`, `add_counter_security_definer`.

### 2.2 `review_saves` — bookmarks
- **Purpose:** a user saving/bookmarking a review (distinct from `favorites`, which saves *places*).
- **Ownership:** `(review_id → reviews, user_id → auth.users)`.
- **Columns (live):** id, review_id, user_id, created_at.
- **APIs:** `api/reviews/[id]/save` (toggle), `feed` (merges `saved_by_me`), `reviews/saved` (list).
- **Frontend:** `reviews/page.tsx`, `reviews/[id]/page.tsx` save button.
- **Business rules:** toggle semantics; save-count denormalized onto `reviews.save_count` via trigger (`20260703_fix_save_count_trigger.sql`).
- **Security expectation (from code):** public or self SELECT for `saved_by_me` merge; INSERT/DELETE self-scoped (`.eq('user_id', user.id)`).
- **Expected constraints:** **unique(review_id, user_id)** — evidence: toggle logic relies on a single row per pair.
- **Expected indexes:** (user_id, review_id) for feed merge.
- **Migration dependencies:** base table must precede `20260703_fix_save_count_trigger.sql`, `add_explore_upgrade`, `20260704_backfill_review_counters`.

### 2.3 `favorites` — saved places
- **Purpose:** user saving a *place* (from AI chat CTAs or Explore) for later.
- **Ownership:** `user_id → auth.users`.
- **Columns (live):** id, user_id, place_id(text), place_name, place_address, place_type, created_at.
- **APIs:** `api/favorites/route.ts` (GET list / POST upsert / DELETE).
- **Frontend:** `ChatInterface` FavoriteToggle + SavePlaceButton, `profile/favorites`.
- **Business rules:** upsert keyed on `(user_id, place_id)` — evidence: route uses `onConflict: 'user_id,place_id'`.
- **Security expectation (from code):** fully self-scoped (SELECT/INSERT/DELETE `.eq('user_id', user.id)`), no public read.
- **Expected constraints:** **unique(user_id, place_id)** — evidence: the `onConflict` upsert *requires* this constraint to exist in prod.
- **Expected indexes:** (user_id) for list.
- **Migration dependencies:** none in repo currently ALTER it — it must simply exist as a base table.

---

## 3. Future-Planned Objects (document, no migration)

None currently identified as *planned*. `vouchers` is treated as Legacy (§4) rather than Future, because there is no roadmap entry, no code, and no design doc referencing a voucher feature. If a Vouchers/Promotions feature is ever green-lit, it would be designed fresh — the existing prod table should not be assumed to match a future design.

---

## 4. Legacy / Experimental Objects (excluded from canon)

### `vouchers`
- **Why it exists (likely):** an early commerce/marketplace experiment or a leftover from a Supabase starter template. It carries `original_price, sale_price, discount_pct, quantity_total, quantity_sold, expires_at` and a FK `service_id → services` — a coupon/promotion shape.
- **Why excluded:** (a) **zero** references anywhere in `src/` or `supabase/migrations/` (verified by grep); (b) the current roadmap's Shopping domain is **Affiliate links only** — explicitly *not* marketplace/checkout/voucher/order/discount-engine; (c) no UI, no API, no service consumes it.
- **Why it must NOT enter the canonical baseline today:** adding it would encode an unbuilt, off-roadmap commerce subsystem into the source of truth, misleading future engineers into thinking a voucher system is part of TappyAI. It should remain out of the repo and be flagged to the owner for a **drop decision** in production (it is currently dead weight, and — like `place_photos` — an unused table with unknown policies is a latent surface).

*(For completeness, `services` and `bookings` are **not** production-only — they exist in the repo. They are "Partial/Experimental" at the product level per earlier audits, but that is a feature-maturity question, not a schema-canon question; they remain in the repo.)*

---

## 5. Remaining Requirements to Close Blocker B

### 5.1 Already Verified (proven — no dump needed)
- **Canonical table set decided:** `reviews`, `review_saves`, `favorites` belong in the repo; `vouchers` does not (evidence in §1–§4).
- **Live column/type/PK/FK structure** for all 29 prod tables captured (`supabase/_prod_schema_partial_introspection.md`).
- **Security posture verified live:** no anonymous exposure of email (column dropped), billing, OAuth tokens, or PII; RLS enforced on every sensitive table (probed with the anon key).
- **Repo↔prod column drift mapped:** prod `profiles` has no `email`/`stripe_customer_id`; prod `user_events` lacks `place_id`/`review_id` (hardening ALTER validated).
- **Storage:** 0 Supabase buckets — nothing to canonicalize (uploads use Vercel Blob).
- **Build/type/lint/tests** green with gates enforced.

### 5.2 Still Requires a Real PostgreSQL Schema Dump (`pg_dump --schema-only`) — and precisely why API introspection is insufficient

| Item | Why PostgREST/Storage API cannot provide it |
|---|---|
| **RLS policies** (per-table `USING`/`WITH CHECK`, roles) | PostgREST enforces policies but exposes **no endpoint** listing `pg_policies`. The API only reveals *effects* (e.g. anon gets 0 rows), never the *policy text/qual* needed to recreate it. The canonical `reviews` "Read visible reviews" SELECT policy lives only in prod and cannot be read back via API. |
| **Trigger definitions** (name, timing, `EXECUTE FUNCTION`) | Not exposed by PostgREST at all. Counters are maintained by triggers whose exact `BEFORE/AFTER INSERT/DELETE` wiring is invisible to the REST layer — only their *effect* on `like_count` etc. is observable. |
| **Function bodies** | The OpenAPI lists RPC **names + params** only. The `LANGUAGE plpgsql … $$ … $$` body, `SECURITY DEFINER`, and `search_path` are not retrievable — recreating a function from its signature would be guessing. |
| **Indexes** | No API surface. Query performance/uniqueness (e.g. GIN on `hashtags`, the trending composite) cannot be observed; only `pg_dump`/`pg_indexes` reveals them. |
| **Constraints** (CHECK, precise UNIQUE, defaults) | The API hints at PK/FK via the OpenAPI description field, but **CHECK** constraints (`rating` range, `content_type` allowlist), **column defaults**, and the exact **UNIQUE** definitions (e.g. `favorites(user_id, place_id)`) are not exposed. Code evidence *implies* some exist; the authoritative definitions require the dump. |
| **Extensions** (`pgcrypto`, `pg_trgm`, `vector`, …) | `CREATE EXTENSION` state is a catalog fact with no REST endpoint. `services.embedding vector(1536)` implies `pgvector`, but confirmation needs the dump. |
| **Storage policies** | (0 buckets today, so none — but if buckets are added later, their RLS is likewise dump-only.) |

**Why a dump, specifically:** every item above is stored in `pg_catalog`/`information_schema` and emitted by `pg_dump --schema-only`, but **none** is projected through PostgREST (which is a data API, not a DDL/DBA API). Observing runtime *effects* through the API can *validate* a policy but can never *reconstruct* its definition — reconstruction from effects would be inference, which is prohibited.

### 5.3 Also required (infrastructure)
- A **Docker-capable environment** (or CI) to run `supabase db reset` and prove the reconciled baseline rebuilds an empty database — impossible in this sandbox (Docker absent).

---

## 6. Final Recommendation

**1． Is the repository already aligned with the intended long-term TappyAI architecture?**
**Partially.** The *code* and *feature set* are aligned and the canonical *table set* is now decided with evidence. But the repo is **not yet a complete canonical schema**: three canonical tables (`reviews`, `review_saves`, `favorites`) have no base DDL, and the security-critical objects (RLS/triggers/indexes/constraints/extensions) for them are not repo-represented. So: architecturally aligned in intent, **not yet reproducible**.

**2． Which production-only objects should NEVER be added to the repository?**
**`vouchers`** (Category C — zero usage, off-roadmap commerce artifact). Recommend a production **drop decision** by the owner. Any other production-only *view/trigger/index/policy/extension* that a future dump reveals to belong solely to `vouchers` or other dead objects should likewise be excluded.

**3． Which production-only objects MUST eventually become part of the repository?**
**`reviews`, `review_saves`, `favorites`** — as complete, canonical base migrations (table + RLS + triggers + indexes + constraints), authored **from the dump**, not from column introspection.

**4． What exact evidence is still missing before Blocker B can be permanently closed?**
The **`pg_dump --schema-only` output** (to obtain RLS policies, trigger definitions, function bodies, indexes, CHECK/UNIQUE/default constraints, and extensions for the three canonical tables — and to diff every other object), **plus a Docker/CI environment** to validate `supabase db reset` rebuilds an empty DB. Precise per-item justification in §5.2.

---

### Final Baseline Status

**The repository does NOT yet represent the canonical database architecture of TappyAI.** What remains, exactly:
1. Obtain `pg_dump --schema-only` from prod (needs the DB password).
2. From it, author **complete** base migrations for `reviews`, `review_saves`, `favorites` (never from the API-only column list).
3. **Exclude** `vouchers` (and confirm a prod drop).
4. Reconcile any dump-revealed policy/trigger/index/constraint/extension drift for existing tables.
5. Validate with `supabase db reset` in a Docker-capable environment.

Until steps 1–5 are done, the canonical architecture is **specified and classified** (this document) but **not yet materialized** in migrations — deliberately, to avoid a fabricated or insecure baseline.
