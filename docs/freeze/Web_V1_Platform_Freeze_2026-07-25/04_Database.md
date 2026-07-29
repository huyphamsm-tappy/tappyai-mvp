# 04 — Database

**Frozen commit:** `79d05f3` · **Provider:** Supabase Postgres 17.6 · **Migrations in repo:** 52

> **Read the honesty warning in §0 before using this document to rebuild anything.**

---

## 0. ⚠ Structural warning — the repository cannot rebuild this database

This is the single most important database fact in the freeze, and it must not be softened.

**Three tables the application depends on have no `CREATE TABLE` anywhere in the repository:**

| Table | Evidence | Status |
|---|---|---|
| `reviews` | ~40 code references; ALTER-ed by 10+ migrations | **PROD ONLY — base DDL missing** |
| `favorites` | `src/app/api/favorites/route.ts`; **zero** migrations touch it | **PROD ONLY — base DDL missing** |
| `vouchers` | zero code refs, zero migrations | **PROD ONLY — legacy orphan** |

`review_saves` and `subscriptions` had the same problem until
`20260712_prod_baseline_and_review_saves_indexes.sql` added `IF NOT EXISTS` baselines.
`reviews` and `favorites` were deliberately **not** baselined — authoring them from column
introspection alone would have been fabrication.

Worse: **`reviews`' public SELECT policy (`Read visible reviews`, `USING (NOT is_hidden)`)
exists only in production.** A database rebuilt from this repository would have an
invisible, empty public feed.

### Why this happened — the operating model
Most migrations carry the annotation *"Run this migration in Supabase SQL Editor."* The
production operating model is **manual SQL-editor application**, with no
`supabase/config.toml`, no `pg_dump` baseline, and no `schema_migrations` ledger in the
repo. That is precisely how `reviews`, `favorites`, `review_saves`, `subscriptions`,
`profiles.username` and `bookings.place_id` drifted out of version control.

### Verification legend used throughout
| Marker | Meaning |
|---|---|
| **[PROD-OBSERVED]** | Present in the live PostgREST introspection of 2026-07-05 |
| **[REPO ONLY]** | Defined in a migration; live existence **NOT VERIFIED** |
| **[PROD ONLY]** | Exists in production with no DDL anywhere in the repo |

**PostgREST cannot expose policies, triggers, indexes, constraints, function bodies or
extensions.** Therefore **every RLS policy, trigger, index and constraint in this document
is `[REPO ONLY]` — NOT VERIFIED as live.** The introspection is also dated **2026-07-05**,
which predates the five newest migrations by 15–19 days.

---

## 1. Tables by domain

**26 repo-defined tables**, plus 3 prod-only.

### 1.1 Auth / profiles / billing

**`profiles`** [PROD-OBSERVED] — `id uuid PK → auth.users ON DELETE CASCADE`, `full_name`,
`avatar_url`, `created_at`, `updated_at`, `onboarded bool default false`,
`follower_count int default 0`, `following_count int default 0`, `language text`.

Drift to record:
- `email` and `stripe_customer_id` were **physically dropped in production**; both migrations
  still carry their `DROP COLUMN` as a **commented-out PART 2**. Repo and prod are out of
  sync in the *safe* direction.
- `bio` is defined by `add_profile_edit.sql` but is **absent from production** — the app
  stores bio in **auth user metadata** instead (`src/app/api/profile/route.ts`). Treat that
  migration as unapplied dead DDL.
- `username` exists in production with **no migration and zero code references**.

**`billing_customers`** [PROD-OBSERVED] — `user_id uuid PK`, `stripe_customer_id text UNIQUE`.
**[SEC]** Exists solely to keep the Stripe customer id **out of the publicly-readable
`profiles` table**. Hardened at the grant level: `REVOKE ALL … FROM anon, authenticated`
then `GRANT SELECT TO authenticated` — anon has no table privilege at all, below RLS.

**`subscriptions`** [PROD-OBSERVED] — final definition is the 2026-07-12 baseline written to
mirror production: `id`, `user_id → profiles CASCADE`, `stripe_customer_id`, `stripe_sub_id`,
`plan`, `status`, `current_period_end`, `cancel_at_period_end`, **`UNIQUE (user_id)`**.
That unique is load-bearing — both the Stripe webhook and Apple IAP do `ON CONFLICT
(user_id)` upserts. **No INSERT/UPDATE/DELETE policy exists**; all writes are service-role.

**`anon_chat_usage`** [REPO ONLY] — `(user_id, day)` composite PK, `count int`.
**[SEC][COST]** RLS on with **zero policies**; reachable only via the SECURITY DEFINER
function `anon_chat_usage_increment()`. This is the **only anonymous quota with a real
server-side guarantee** (see §4).

**`user_integrations`** [PROD-OBSERVED] — OAuth tokens for Google Calendar / Zalo,
`UNIQUE (user_id, provider)`. **[SEC] Tokens are stored in plaintext** — the migration
concedes *"encrypted at rest via Supabase Vault ideally; store here for MVP."* Carried into
`12_Open_Items.md`.

### 1.2 Chat

**`conversations`** [PROD-OBSERVED] — `messages jsonb NOT NULL DEFAULT '[]'`.
**There is no `messages` table**; a conversation is one row with a denormalized JSONB array.
**[COST]** One read/write per conversation instead of per message.

**`message_feedback`** [PROD-OBSERVED] — `UNIQUE (user_id, conversation_id, message_index, type)`,
`type IN ('like','dislike','report')`. Two definitions exist; the later one intended **no FK**
to `conversations` (so feedback can target an unsaved/anonymous conversation), but because
both used `CREATE TABLE IF NOT EXISTS`, **production has the FK version** — contradicting the
later migration's stated intent.

### 1.3 Places / bookings / favorites

**`services`** — **repo definition ≠ production.** `supabase-schema.sql` defines
`embedding vector(1536)` + `create extension vector`; production has an entirely different
column set (`category`, `price_exact`, `images text[]`, `tags text[]`, `is_active`) and
**no `embedding` column**. The schema-file block was never applied. **pgvector installation
is NOT VERIFIED.**

**`bookings`** [PROD-OBSERVED] — plus a production-only `place_id text` with no migration.

**`favorites`** [PROD ONLY] — `user_id, place_id, place_name, place_address, place_type`.
`src/app/api/favorites/route.ts` upserts `onConflict: 'user_id,place_id'`, so a
`UNIQUE(user_id, place_id)` **must** exist in production — it is nowhere in the repo.

**`place_photos`** [PROD-OBSERVED] — Google Places photo-URL cache. **Zero references in
`src/` today** — the image pipeline moved to Serper thumbnails. Effectively dead.

### 1.4 Reviews / social

**`reviews`** [PROD ONLY, base DDL missing] — 24 live columns assembled across migrations:
core (`id`, `user_id → profiles`, `place_id`, `place_name`, `place_address`, `rating`,
`body`, `is_hidden`, `photos text[]`, `created_at`) of **unknown provenance**, plus
`is_verified`, `like_count`, `comment_count`, `save_count`, `view_count`, `content_type`
(`video|photo|text`), `media_url`, `thumbnail`, `hashtags text[]`, `watch_time_avg`,
`completion_rate`, `source_type` (`upload|youtube|tiktok|facebook`), `source_url`,
`music jsonb`.

`music` payload is the canonical contract `{ version:1, trackId, startSec, volume }`
(+ `origin:'original'|'attached'`). **There is deliberately no FK to `music_tracks`** —
validation lives in `src/app/api/reviews/route.ts`. **[STAB]** Keeps the music module
boundary intact and lets a track be deactivated without breaking reviews.

Feed score is **computed, never stored**:
`(5 + watch_time_avg*0.4 + save_count*0.3 + like_count*0.2 + comment_count*0.1)
× locationBoost × recencyBoost`.

**Social satellites** (all CASCADE on `reviews`): `review_likes` (UNIQUE review+user),
`review_comments` (body 1–300 chars), `review_saves` (UNIQUE review+user — **private**,
unlike likes nobody can see who saved), `review_interactions` (watch telemetry, UNIQUE
user+review), `review_milestones` (UNIQUE review+milestone, enables
`ON CONFLICT DO NOTHING`), `user_follows` (UNIQUE pair + `CHECK follower <> following`).

**`comment_reactions`** [REPO ONLY, new] — `comment_id → review_comments CASCADE`,
`user_id → auth.users CASCADE`, `reaction text CHECK length 1–20`,
**`UNIQUE (comment_id, user_id)`**. Because it is one-per-user, **changing a reaction is an
UPDATE of the same row**, which is why this table needs an UPDATE policy where
`review_likes` does not. `reaction` is **free text with only a length check** — the six-value
vocabulary (`like/love/haha/wow/sad/angry`) is enforced **only by the API**, deliberately, so
new reactions need no schema change. **No counter trigger** — counts are a per-request
group-by.

**Reply threading** — `review_comments.parent_comment_id uuid` self-FK, `ON DELETE CASCADE`.
A **single nullable adjacency-list column**: no closure table, no path, no depth. The DB
permits arbitrary nesting; **the application enforces exactly two levels** by re-parenting
(`replyTo.parent_comment_id ?? replyTo.id`), so a thread is always root + flat replies.

> **⚠ Silent semantic change:** `trg_review_comment_count` fires on `review_comments`
> **regardless of `parent_comment_id`**, so as of `20260720` **`reviews.comment_count`
> counts comments *and* replies.** The number stays internally consistent (cascade deletes
> fire the row trigger per reply, and the backfill uses an unfiltered `COUNT(*)`), but its
> *meaning* changed with no migration acknowledging it.

### 1.5 Music

`music_providers` (seeded `internal`, `pixabay` — `internal` is a **hard dependency** of the
original-sound backfill), `music_categories` (6 seeded, i18n labels), `music_tracks`
(`is_active` licensing kill-switch, `music_type` CHECK of 5 values, `uploaded_by`,
`rights_confirmed`, `license`, `source_url` with a partial-unique index preventing duplicate
Jamendo ingestion), `music_usage` (**append-only log, deliberately no FK to feature tables** —
that is the module boundary), `music_saved` / `music_followed` (private lists),
`music_track_reports` (notice-and-takedown; **no SELECT policy**, so only service-role tooling
can read reports).

### 1.6 Deals — **`partner_deals`** [REPO ONLY, new]

Built by three strictly-ordered migrations: `20260724_partner_deals.sql` →
`_hardening.sql` → `_metadata.sql`. **Not reorderable** — the hardening backfills the seed
rows before applying `NOT NULL`/`UNIQUE` to `partner_slug`.

21 columns. **Zero foreign keys** — `partner_deals` is standalone content, not user data:
`id`, `partner_slug` (NOT NULL, unique, lowercase CHECK), `partner_name`, `partner_type`
(default `ecommerce`), `category`, `title`, `description`, `official_url`
(**CHECK `~ '^https://'`**), `banner_image`, `logo_image`, `display_order`, `is_active`,
`is_featured`, `start_at`, `end_at`, `country_code` (default `VN`), `affiliate_code`,
`click_count`, `metadata jsonb`, `created_at`, `updated_at`.

**This table replaced a hardcoded `DEAL_POOL` constant in application code.** The migration
header states it plainly: *"Deals become managed DATA, not application code."* That is the
structural fix for the Bug #14 link-rot class — link rot is now an editorial change, not a
deploy.

**Scheduling is enforced entirely inside the RLS policy.** There is no cron, no status
column, no job — a deal appears and disappears at its boundary times because `NOW()` is
evaluated on every query:

```sql
POLICY "public reads active in-window deals" FOR SELECT USING (
  is_active
  AND (start_at IS NULL OR start_at <= NOW())
  AND (end_at   IS NULL OR end_at   >= NOW())
)
```
NULL = unbounded on that side. `is_active` is an independent manual kill switch (AND-ed).
**There is no INSERT/UPDATE/DELETE policy** — all writes are service-role via the audited
admin API. Admin reads bypass RLS entirely so the manager sees inactive, future and expired
rows.

**Slug immutability — three layers**, authoritative one first:
1. **DB trigger** `partner_deals_slug_immutable()` raises on any change (`IS DISTINCT FROM`,
   so NULL↔value is caught too). Catches even a direct service-role UPDATE.
2. **API schema** — `UpdateDealSchema` omits `partnerSlug`, so PATCH cannot carry it.
3. **Column mapper** emits `partner_slug` only when present, which on update it never is.

Trigger firing order is correct: Postgres fires row triggers **alphabetically**, so
`trg_partner_deals_slug_immutable` runs before `trg_partner_deals_updated_at` — a rejected
update never stamps `updated_at`.

**Column privacy is 100 % application-layer.** RLS is row-level and cannot hide a column:

| Column | Public | Admin | Mechanism |
|---|---|---|---|
| `affiliate_code` | never | **never** | Selected by **no query in the codebase** — pure placeholder |
| `click_count` | never | yes | Admin column list only |
| `metadata` | **selected, never returned raw** | same | `readPromotion()` whitelists exactly `metadata.promotion.discountLabel` and `.voucherCode` |
| `is_active`, `start_at`, `display_order`, `country_code`, timestamps | never | yes | Two-tier column allowlist |

> **⚠ [SEC] Gap:** there is **no column-level `REVOKE`** on `partner_deals` (contrast
> `billing_customers`, which has one). Any holder of the public anon key can query PostgREST
> directly — `GET /rest/v1/partner_deals?select=affiliate_code,click_count,is_active` — and
> read those fields for every active in-window row. Today `affiliate_code` is always NULL so
> the exposure is theoretical, **but it becomes live the moment real codes are loaded.**
> This is the exact pattern already fixed twice for `profiles.email` and
> `profiles.stripe_customer_id`. → `12_Open_Items.md`.

**Seed:** 7 launch partners (Shopee, ShopeeFood, TikTok Shop, Grab, Be, Agoda, Booking.com),
official landing pages only, guarded by `WHERE NOT EXISTS (SELECT 1 FROM partner_deals)` —
inserts **only when the table is completely empty**, so re-applying never overwrites admin
edits.

### 1.7 Notifications, preferences, memory, analytics, groups, price watches

- **`notification_subscriptions`** — Web Push, `UNIQUE(user_id, provider)`, `provider`
  defaults `'webpush'` with `'fcm'` anticipated for native.
- **`user_preferences`** [PROD-OBSERVED] — **`user_id` is the PK**; the competing
  `add_preferences.sql` definition (separate `id` PK) lost the race, though its trailing
  `ADD COLUMN preferences jsonb` did apply. 15 columns total.
- **`user_memory`** — **repo definition ≠ production.** Production has `user_id **text**`
  (not uuid, not FK), plus `budget`/`history` columns with **no migration**, and lacks
  `bookmarks`/`recent_searches`/`custom_facts`. **The RLS policy `auth.uid() = user_id` is a
  uuid-vs-text comparison in production — NOT VERIFIED whether an implicit cast applies.**
- **`user_events`** — the most-mutated table. `20260713_analytics_envelope_foundation.sql`
  dropped `NOT NULL` on `user_id` (to allow anonymous events), added a 14-column analytics
  envelope, **dropped the `event_type` allowlist CHECK** (validation moved to the ingestion
  layer), and added `CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)` **NOT VALID**.
- **`user_acquisition`**, **`auth_daily_rollup`**, **`activation_daily_rollup`** [REPO ONLY] —
  deny-by-default analytics dimensions, service-role only. `user_acquisition` outlives the
  90-day `user_events` retention.
- **Back office** [REPO ONLY] — enum **`admin_role`** (`super_admin|admin|moderator|analyst`,
  the only Postgres enum in the schema), `admin_roles`, `admin_permissions`, **`audit_log`**
  (INSERT-only, **no FKs** because the actor may be deleted, **no UPDATE/DELETE path anywhere
  → immutable by construction**), `system_health_log`.
- **`groups`** / **`group_members`** — membership rows are publicly readable; only a signed-in
  user may add/remove **their own** membership. Partial-unique index exempts legacy anonymous
  rows.
- **`price_watches`** — `status` CHECK, partial index on active rows for the cron.

---

## 2. Relationship graph

```
auth.users
├─1:1─ profiles(id) CASCADE
│      ├─1:1─ billing_customers · subscriptions(UNIQUE) · user_acquisition
│      ├─1:N─ admin_roles · admin_permissions  (granted_by → profiles SET NULL)
│      └─1:N─ reviews(user_id)
├─1:N─ conversations, bookings, message_feedback*, user_events*, user_integrations,
│      notification_subscriptions, price_watches, user_memory*, user_preferences,
│      groups(creator_id), group_members(user_id), review_likes, review_comments,
│      comment_reactions, review_interactions, music_saved, music_followed,
│      music_usage(SET NULL), music_tracks(uploaded_by SET NULL),
│      music_track_reports(reporter_id SET NULL), user_follows(follower, following)

reviews(id)
├─1:N─ review_likes / review_comments / review_saves  → drive the denormalized counters
├─1:N─ review_interactions                            → drive watch_time_avg / completion_rate
└─1:N─ review_milestones
      reviews.music jsonb → music_tracks.id is a SOFT link, NO FK by design

review_comments(id) ─self─ parent_comment_id CASCADE      (one-level threads)
                    └─1:N─ comment_reactions CASCADE

music_providers ─1:N─ music_tracks ─1:N─ music_usage / music_saved / music_followed / reports
music_categories ─1:N─ music_tracks
groups ─1:N─ group_members

partner_deals   ← ISOLATED NODE, zero foreign keys
```

**Deliberately FK-free:** `user_events.place_id`/`review_id`, `anon_chat_usage.user_id`,
`audit_log.actor_id`, `system_health_log`, `place_photos`, `favorites.place_id` (external
Google id), `bookings.service_id` (external id), `user_memory.user_id` (text in prod).

---

## 3. Row Level Security

**Every table in the repo has `ENABLE ROW LEVEL SECURITY`.** "Deny-by-default" below means
RLS on with **zero policies** — only the service-role client can touch it.

### 3.1 ⚠ The most important RLS fact in the freeze

**`profiles` is world-readable in production.** The repo's intent is self-only
(`auth.uid() = id`), but production additionally carries **two permissive `qual=true` SELECT
policies for role `public`** that no migration created. They are OR'd in, so the whole table
is publicly readable.

**This is exactly why `email` and `stripe_customer_id` had to be *physically removed* rather
than policy-gated.** Consequence for anyone extending the schema: **any sensitive column
added to `profiles` is world-readable by default.**

### 3.2 Policy summary

| Table | Effective access |
|---|---|
| `profiles` | **World-readable** (prod policies); self-only update/insert |
| `conversations`, `bookings`, `price_watches`, `user_preferences`, `user_memory`, `message_feedback`, `notification_subscriptions`, `review_interactions` | Full self-scoped CRUD (`auth.uid() = user_id`) |
| `subscriptions` | Read own only. **No write policy** — Stripe/IAP write via service role |
| `billing_customers` | Read own, authenticated only; **anon has no grant at all** |
| `anon_chat_usage` | **Deny-by-default**; RPC-only |
| `user_integrations` | Self-scoped ALL — **`USING` only, no `WITH CHECK`** ⚠ see §7 |
| `reviews` | Anyone (incl. logged-out) reads non-hidden; owners always see own; owners update own. **Public SELECT policy is PROD-ONLY** |
| `review_likes`, `review_comments`, `user_follows`, `review_milestones`, `comment_reactions`, `groups`, `group_members` | Public read; self-scoped writes |
| `review_comments` | **No UPDATE policy → comments are not editable** |
| `comment_reactions` | Public read; insert/**update**/delete own (update needed because switching a reaction mutates the same row) |
| `review_saves` | **Private** — select/insert/delete own only |
| `music_categories` / `music_tracks` | Public read of **active only**; a user may publish only an `original_sound` they own with `rights_confirmed = true`; may only edit tracks they uploaded (self-takedown) |
| `music_usage` | Insert own; **no SELECT policy → unreadable except service role** |
| `music_saved` / `music_followed` | Private lists. Public aggregate counts come from SECURITY DEFINER RPCs, so **who** saved is never exposed |
| `music_track_reports` | File-and-forget: insert own, **no SELECT policy** |
| `partner_deals` | Public read of active-and-in-window only; **no write policy** |
| `place_photos` | Public read; **anon insert/update policies were DROPPED** (cache-poisoning hole) |
| `services` | Public read |
| `auth_daily_rollup`, `activation_daily_rollup`, `user_acquisition`, `admin_*`, `audit_log`, `system_health_log` | **Deny-by-default** — service-role only |
| `favorites`, `vouchers` | **Unknown — no repo DDL** |

### 3.3 Security holes that were found and closed
- `group_members` — `Anyone can join a group` INSERT `USING (true)` → replaced with an
  authenticated self-scoped INSERT + DELETE. **High-severity anonymous-injection hole.**
- `place_photos` — anon INSERT/UPDATE dropped. **Cache-poisoning vector.**
- `review_milestones` — the permissive service-role INSERT policy dropped.
- `increment_review_view` — `REVOKE FROM anon` after it was found to be an anon-callable
  trending-feed inflation vector.

---

## 4. Functions and triggers

**8 triggers, 14 SECURITY DEFINER functions.**

### Triggers
| Trigger | On | Purpose |
|---|---|---|
| `on_auth_user_created` | AFTER INSERT `auth.users` | Create the `profiles` row from `raw_user_meta_data` |
| `trg_review_like_count` / `_comment_count` / `_save_count` | AFTER INS/DEL | Maintain the denormalized counters |
| `trg_follow_counts` | AFTER INS/DEL `user_follows` | Maintain `profiles.follower_count` / `following_count` |
| `trg_notif_subs_updated_at` | BEFORE UPDATE | `updated_at = now()` |
| `trg_partner_deals_slug_immutable` | BEFORE UPDATE | Raise on slug change |
| `trg_partner_deals_updated_at` | BEFORE UPDATE | `updated_at = NOW()` |

All counter triggers decrement with `GREATEST(x - 1, 0)` and `RETURN NULL`. **[STAB]**

### The SECURITY DEFINER story — a real production bug class
Four counter trigger functions were originally `SECURITY INVOKER` and therefore **silently
counted 0 under RLS**. `20260703_fix_*_trigger.sql` and `add_counter_security_definer.sql`
converted all four to `SECURITY DEFINER SET search_path = public`. Because
`CREATE OR REPLACE FUNCTION` preserves function identity, the existing trigger bindings
survived.

### Key functions
| Function | Security | Grants | Notes |
|---|---|---|---|
| `anon_chat_usage_increment()` | DEFINER | **REVOKE FROM PUBLIC**, GRANT `authenticated` | **[SEC]** Atomic VN-day counter. Raises unless the JWT claim `is_anonymous` is true. **Clients never send or compute quota.** The only anonymous quota with a real guarantee |
| `increment_review_view()` | DEFINER | **REVOKE anon/public**, GRANT `authenticated` | Hardened after being an anon inflation vector |
| `music_increment_play()` | DEFINER | `anon, authenticated` | **Deliberately anon-callable — inflatable by design** |
| `music_saved_count()` / `music_followed_count()` | DEFINER, STABLE | `anon, authenticated` | **[SEC]** Aggregate-only exposure — "N người đã lưu" without revealing *who* |
| `increment_deal_click()` | DEFINER | **`anon, authenticated`** | ⚠ See §7 |
| `sync_review_watch_stats()` | DEFINER | `authenticated` | Recomputes watch stats; replaced a route-side UPDATE that RLS dropped |
| `fn_upsert_user_acquisition`, `fn_upsert_activation`, `fn_rollup_auth_daily`, `fn_rollup_activation_daily` | **INVOKER** | — | First-write-wins / idempotent recompute. **Depend on being called with the service-role client** — from an authenticated client they silently write nothing |
| `fn_sync_last_login()` | DEFINER, `search_path = public, auth, pg_temp` | — | The only function reading the `auth` schema; DEFINER is mandatory |

---

## 5. Realtime

`20260722_notification_realtime.sql` **creates no table, column, function or trigger.** It
adds four existing tables to the `supabase_realtime` logical replication publication:
`review_likes`, `review_comments`, `user_follows`, `review_milestones`.

**"The trigger" is the WAL, not a `CREATE TRIGGER`.** Two consequences the migration records
explicitly: INSERT events carry the full new row regardless of `REPLICA IDENTITY` (so no
`REPLICA IDENTITY FULL` change is needed), and **Realtime re-evaluates each table's existing
RLS SELECT policy per subscriber**, so no new authorization surface is created.

**[COST]** The payload is used purely as a *signal*: the client debounces 300 ms and refetches
`GET /api/notifications`, which stays the single source of truth. **This is what removed
polling from the unread bell badge.**

> **⚠ Fan-out breadth.** All four published tables have `USING (true)` SELECT policies, so
> Realtime forwards **every** insert to **every** connected client. Only `user_follows` carries
> a server-side `filter`. No data leaks beyond what is already publicly readable, but message
> volume — and the refetch storm it induces — scales with **total app activity × connected
> clients**, not with the user's own notifications. `review_likes`/`review_comments` cannot be
> filtered today because they carry `review_id`, not the review author's id.
> → `12_Open_Items.md`.

**Manual prerequisite:** Realtime must be enabled for the project in the Supabase dashboard.

---

## 6. Indexes and constraints

**Indexes** serve: chat history (`conversations` user + `updated_at DESC`), feed pagination
(`reviews(is_hidden, created_at DESC)`), trending (`reviews(like_count, save_count,
created_at)` DESC), hashtag search (**GIN** on `reviews.hashtags`), profile posts
(`reviews(user_id)` — **no index existed before the hardening migration**), analytics
(`user_events` by type/created/anon, plus **`uq_user_events_event_id` UNIQUE** for ingestion
idempotency, multiple NULLs allowed so legacy rows don't collide), music search (`lower(title)`,
`lower(artist)`), the price-check cron (partial index on `status='active'`), the moderation
queue (partial on `status='open'`), and deals (`(is_active, display_order)` + unique slug).

**Enums:** exactly one — `admin_role`.

**Known index defects (all harmless, all recorded):**
`subscriptions_user_id_idx` / `subscriptions_user_idx` duplicate each other and are both
redundant with `UNIQUE(user_id)`; `user_events_user_id_idx` / `user_events_user_created_idx`
duplicate; `comment_reactions_comment_idx` duplicates the leading column of the
`UNIQUE (comment_id, user_id)` index; `services_type_idx` is **dead** (production's column is
`category`, not `type`).

**Known missing:** `favorites(user_id)` and its `UNIQUE(user_id, place_id)` — required by the
upsert, absent from the repo.

---

## 7. Storage

**Verdict: 100 % Vercel Blob. Supabase Storage is not used at all** — Storage API
enumeration returned **0 buckets**, and a repo-wide grep for `storage.from(` finds zero calls.

| Media | Route | Mechanism | Limits |
|---|---|---|---|
| Video + thumbnail | `api/upload/video` | **Client-direct** token (`@vercel/blob/client`) — browser PUTs straight to Blob, bypassing the serverless body cap | 50 MB; mp4/quicktime/webm; thumbnail 10 MB |
| Audio + cover | `api/upload/audio` | Client-direct token | 20 MB; cover 5 MB |
| Review photos | `api/reviews/upload` | **Server-side** `put()` | 5 MB; **magic-byte sniffing** blocks SVG/HTML-as-image stored XSS; 10/user/day |
| Avatars | `api/profile` POST | Server-side `put()` | 3 MB; magic-byte sniffed |
| Deal logos/banners | `api/admin/deals/upload` | Client-direct token | 5 MB; ⚠ **allows `image/svg+xml`** |
| Demo music | — | **Static in-repo** `/public/music/*.mp3` | Repointed from `soundhelix.com`, unreachable from Vietnam |

> **⚠ [SEC] `api/admin/deals/upload` is the only upload path that accepts SVG**, while every
> other path deliberately sniffs magic bytes specifically to block SVG-as-image stored XSS.
> The URLs render as deal banners/logos. → `12_Open_Items.md`.

**[COST]** A `TODO(cost)` in `api/upload/video` proposes migrating **video** to Cloudflare
R2 + CDN while keeping avatars/thumbnails on Blob — egress is the bottleneck.

---

## 8. Migration history

**No numbering convention:** 29 files are date-prefixed, 23 are `add_*.sql` with no ordinal.
**Sorting the directory alphabetically puts every `add_*` file after every `2026*` file —
the exact opposite of the real dependency order.** There is no ledger, so **the actual applied
order in production is NOT VERIFIED.**

### Notable supersessions
| Superseded | By | Final state |
|---|---|---|
| `supabase-schema.sql` `subscriptions` | `20260712` baseline | `stripe_sub_id` + `plan` + `UNIQUE(user_id)` |
| `add_preferences.sql` `user_preferences` (id PK) | schema-file version ran first | `user_id` is PK; `id` never existed |
| INVOKER counter fns | `20260703_fix_*` + `add_counter_security_definer` | all four SECURITY DEFINER |
| `handle_new_user()` writing `email` | `add_profiles_email_isolation` | writes only name/avatar |
| `user_events_event_type_check` allowlist | `20260713_analytics_envelope_foundation` | **dropped** — validation moved to ingestion |
| `music_tracks.audio_url` → soundhelix.com | `20260706c` | `/music/*.mp3` |
| `add_original_sound_ugc` + `20260706_add_music_saved_and_type` | `20260711_music_ugc_combined` | idempotent superset + retroactive backfill |
| Hardcoded `DEAL_POOL` in code | `20260724_partner_deals*` | DB-backed admin-managed catalog |

### The three newest migrations self-declare as **meant to be applied**
Unlike the 2026-07-14 batch, `20260720`, `20260722` and the `20260724` trio all carry apply
instructions — `20260724_partner_deals.sql` explicitly says *"Apply this in Supabase SQL
Editor **BEFORE** the V1 code is served, so /api/deals has rows to return."*

---

## 9. Production assumptions and freeze blockers

### Seeded data
`music_providers` (2), `music_categories` (6), `music_tracks` (14 SoundHelix demo — the seed
first **deletes** `artist = 'SoundHelix'`, so **re-running it orphans any
`reviews.music.trackId` / `music_saved` / `music_usage` references**), `partner_deals` (7,
empty-table-guarded), `user_acquisition` (one-time backfill from `auth.users`).

### Manual dashboard steps with no automation
1. **`supabase/seed/backoffice_super_admins.sql` must be hand-edited and run.** It contains
   the literal placeholder `'REPLACE-WITH-SUPABASE-AUTH-UUID'`, which **fails as an invalid
   uuid** if run as-is. **Until at least one `super_admin` row exists, nobody can pass the
   `/admin` RBAC gate.**
2. **Supabase Anonymous Auth must be enabled** — `anon_chat_usage_increment()` hard-fails on
   the `is_anonymous` JWT claim.
3. **Realtime must be enabled** for the notification badge.
4. Uncomment PART 2 of the two column-isolation migrations (already effectively done in prod).
5. `vouchers` drop decision.
6. Cron schedules live in `vercel.json`, **not** the DB — there is no `pg_cron`.
7. `anon_chat_usage` has **no retention job** — the migration only leaves a note.

### Service-role surface **[SEC]**
`createAdminClient()` bypasses **all** RLS. Every deny-by-default table (`admin_*`,
`audit_log`, `system_health_log`, `user_acquisition`, `*_daily_rollup`, `anon_chat_usage`,
`partner_deals` writes, `music_track_reports` reads) is reachable **only** through it.
**`SUPABASE_SERVICE_ROLE_KEY` is the single most sensitive secret in the deployment.**

### Freeze-blocker shortlist (ranked)
1. **`reviews` + `favorites` have no `CREATE TABLE`, and `reviews`' public SELECT policy is
   prod-only → the repo cannot rebuild a working database.**
2. **Three 2026-07-14 migrations self-declare *"NOT APPLIED to any database — file only"*,
   yet shipped code already calls their functions** (`activationDimensionWriter.ts` calls
   `fn_upsert_activation`; `api/cron/analytics-snapshot` calls `fn_rollup_activation_daily`).
   Running that code against an unmigrated database fails at runtime.
3. `backoffice_super_admins.sql` holds an invalid placeholder UUID → `/admin` unreachable
   until an owner edits and runs it.
4. `user_memory` (uuid vs text `user_id`) and `services` (entirely different columns) in
   `supabase-schema.sql` do not describe production.
5. Prod `profiles` carries two `qual=true` public SELECT policies no migration created.
6. `partner_deals` is a **hard runtime dependency of `/api/deals`** on all three platforms.
   If the trio has not been applied, `getActiveDeals` swallows the error and returns `[]`, so
   **Deals renders empty rather than erroring — a failure mode that will not appear in logs.**
   **NOT VERIFIED whether it is live.**
7. `increment_deal_click` is granted to `anon` with no rate limit or dedupe — trivially
   inflatable, contradicting the hardening precedent set for `increment_review_view`.
8. No column-level `REVOKE` on `partner_deals` (§1.6).
9. `reviews.comment_count` silently changed meaning as of `20260720` (§1.4).
