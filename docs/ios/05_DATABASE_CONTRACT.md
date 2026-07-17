# TappyAI — Database Contract (Schema · RLS · Triggers · RPC · Storage)

> **Part of the `docs/ios/` design dossier** — canonical reference for the iOS build.
> **Source of truth:** the current production **Web + Backend** codebase. Android is an implementation being brought to parity, **not** authoritative. Where Android lags Web, iOS matches **Web** and the backend APIs.
> Generated 2026-07-10 from a direct read of production code; `file:line` citations retained inline.

---

# TappyAI — Canonical Product Spec §09: Data Model, RLS/Security Posture & Backend Infrastructure

**Scope:** The complete Supabase/Postgres data model, Row-Level-Security posture, trigger/counter logic, storage, and external-service inventory that the iOS app must match 100%. Source of truth = current code: `supabase/migrations/*.sql` (37 files), `supabase-schema.sql` (base bootstrap), `src/lib/supabase/{client,server,admin}.ts`, and live production introspection (`supabase/_prod_schema_partial_introspection.md`). Migrations are authoritative; the introspection doc is corroborating fact; `TAPPYAI_CANONICAL_SCHEMA_2026-07-05.md` is secondary analysis.

> **Critical repo caveat (iOS must know this):** three canonical tables — `reviews`, `review_saves`, `favorites` — have **NO base `CREATE TABLE` DDL anywhere in the repo** (verified: zero matches). They exist only in production and are known solely through `ALTER TABLE` migrations + live introspection. Their exact CHECK/UNIQUE/default constraints and the base `reviews` SELECT policy ("Read visible reviews") live only in prod and can only be reconstructed from a real `pg_dump`. iOS must treat their column list (from introspection) as accurate but their base constraints/policies as prod-authoritative.

---

## 0. Supabase client architecture (how the app talks to the DB)

| Client | File | Key used | RLS | Use |
|---|---|---|---|---|
| Browser | `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enforced | Client components, direct reads/writes under RLS |
| Server (SSR) | `src/lib/supabase/server.ts` | anon key + cookie session | Enforced (as logged-in user) | Server components / route handlers acting as the user |
| Admin | `src/lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **Bypassed** | Server-only privileged writes (webhooks, crons, counter backfills, moderation). `autoRefreshToken:false, persistSession:false`. Never imported client-side. |
| Music module | `src/modules/music/repository/musicRepository.ts` | anon key | Enforced | Isolated music module reads |

**iOS parity:** iOS will hold only the **anon key** (the public URL + anon key are already shipped to browsers). It is therefore RLS-bound exactly like the web browser client. Any operation the web app routes through the service-role admin client (Stripe writes, cron jobs, moderation, counter backfills) is **NOT** available to iOS directly — iOS must call the corresponding Next.js API route.

---

## 1. Auth / Profiles domain

### `profiles`  (base: `supabase-schema.sql`)
User public/social profile, 1:1 with `auth.users`.
- **Columns (live):** `id uuid PK →auth.users`, `username text`, `full_name text`, `avatar_url text`, `bio text` (`add_profile_edit.sql`), `created_at`, `updated_at timestamptz` (`add_profile_edit.sql`), `onboarded boolean default false` (`supabase-schema.sql` migration block), `follower_count integer default 0` + `following_count integer default 0` (`add_social_week2.sql`), `language text` (`add_user_language_preference.sql`, nullable = not-set → device-locale fallback).
- **Dropped/isolated columns:** `email` — **removed** from prod (`add_profiles_email_isolation.sql`); `stripe_customer_id` — **moved out** to `billing_customers` (`add_billing_customers_isolation.sql`). Neither exists in prod introspection. See §7.
- **RLS (base):** `Users can view own profile` SELECT `auth.uid()=id`; `Users can update own profile` UPDATE; `Users can insert own profile` INSERT. **Plus** two permissive prod-only public-read policies (`Public profiles are viewable by everyone`, `profiles_select`, both `qual=true` for role `public`) that make non-sensitive columns world-readable — documented as the root cause in the two isolation migrations. Net effect: **anyone (anon) can read username/full_name/avatar_url/counts/language/onboarded; email/stripe are gone.**
- **Trigger:** `handle_new_user()` (SECURITY DEFINER, `search_path=public`) fires `AFTER INSERT ON auth.users`; inserts `(id, full_name, avatar_url)` with `ON CONFLICT (id) DO UPDATE`. Post-`add_profiles_email_isolation.sql` it **no longer writes email**.
- **iOS:** reads any user's public profile columns directly; writes only own row. New-user profile row is auto-created by the DB trigger on signup — iOS need not insert it.

### `auth.users` (Supabase-managed)
Canonical identity + `email`. iOS reads its own email from the session (`user.email`), never from `profiles`.

---

## 2. Reviews / Social domain (the TikTok-style feed)

### `reviews`  ⚠️ **no base DDL in repo — prod-only base table**
Core UGC: place reviews / short-video posts powering the Reviews feed, Explore, personalization.
- **Columns (live, 24):** `id uuid PK`, `user_id uuid →profiles`, `place_id text`, `place_name text`, `place_address text`, `rating smallint`, `body text`, `is_hidden boolean`, `created_at`, `photos text[]`, `is_verified boolean default false` (`add_review_social.sql`), `like_count integer default 0` (ibid), `comment_count integer default 0` (`add_social_week2.sql`), `content_type text default 'photo'` CHECK ∈ {video,photo,text} (`add_explore_upgrade.sql`), `media_url text`, `thumbnail text`, `hashtags text[]`, `watch_time_avg float default 0`, `completion_rate float default 0`, `save_count integer default 0`, `source_type text default 'upload'` CHECK ∈ {upload,youtube,tiktok,facebook} (`add_explore_upgrade.sql`), `source_url text`, `view_count integer default 0` (`add_phase4.sql`), `music jsonb default null` (`20260704_add_reviews_music_column.sql`).
- **`music` payload shape:** `{ "version":1, "trackId":"…", "startSec":12, "volume":0.8, "origin":"original"|"attached" }` — `origin:'original'` = the clip's own auto-registered sound; `origin:'attached'` = borrowed/library sound. No FK; validated in the API layer, not the DB.
- **Feed score:** NOT stored; computed dynamically: `(5 + watch_time_avg*0.4 + save_count*0.3 + like_count*0.2 + comment_count*0.1) * locationBoost * recencyBoost`.
- **Indexes:** `created_at DESC`, `hashtags` GIN, `(is_hidden, created_at DESC)`, `content_type`, `(like_count DESC, save_count DESC, created_at DESC)`, `view_count`, `user_id` (added late by `add_gatea_db_hardening.sql`).
- **RLS:** base "Read visible reviews" SELECT `USING (NOT is_hidden)` **lives only in prod**. Repo adds (`20260703_add_reviews_update_policy.sql`): `Users can update own reviews` UPDATE `USING auth.uid()=user_id`; `Owners can see own reviews` SELECT `USING auth.uid()=user_id` (so owners see their own hidden rows; permissive SELECTs OR together → `(NOT is_hidden) OR own`). No public INSERT/DELETE policy in repo — creation goes through API routes.
- **iOS:** may read the public feed directly (non-hidden rows visible to anon — confirmed live). Creating a review should go through `POST /api/reviews` (the route validates the `music` payload via the Music module and enforces one-verified-review-per-(user,place) with a 409). Hide/unhide via `PATCH /api/reviews/[id]`.

### `review_likes`  (`add_review_social.sql`)
- `id PK`, `review_id →reviews ON DELETE CASCADE`, `user_id →auth.users CASCADE`, `created_at`, **UNIQUE(review_id,user_id)**.
- **RLS:** `Anyone can read likes` SELECT true; `Users can like` INSERT `auth.uid()=user_id`; `Users can unlike` DELETE `auth.uid()=user_id`.
- Indexes: `review_id`, `user_id`.

### `review_comments`  (`add_social_week2.sql`)
- `id PK`, `review_id →reviews CASCADE`, `user_id →auth.users CASCADE`, `body text CHECK(char_length 1..300)`, `created_at`.
- **RLS:** `Anyone can read comments` SELECT true; `Users can comment` INSERT self; `Users can delete own comment` DELETE self.
- Index: `(review_id, created_at)`.

### `review_saves`  ⚠️ **no base DDL in repo — prod-only base table**
Bookmarks a *review* (distinct from `favorites` which saves *places*).
- **Columns (live):** `id PK`, `review_id →reviews`, `user_id`, `created_at`. Expected **UNIQUE(review_id,user_id)** (toggle logic relies on it) — prod-authoritative.
- **RLS:** prod-only (not in repo). Save-count kept via trigger on this table (below).
- **iOS:** toggle via `POST /api/reviews/[id]/save`; feed merges `saved_by_me`.

### `review_interactions`  (`add_explore_upgrade.sql`, hardened in `add_phase4_hardening.sql`)
Per-user watch analytics.
- `id PK`, `user_id →auth.users CASCADE`, `review_id →reviews CASCADE`, `watch_seconds float`, `completion_rate float`, `created_at`, **UNIQUE(user_id,review_id)**.
- **RLS:** `Users manage own interactions` FOR ALL `USING auth.uid()=user_id WITH CHECK auth.uid()=user_id` (recreated idempotently in hardening).
- Feeds `sync_review_watch_stats()` + `get_interaction_avgs()` (§4).

### `review_milestones`  (`add_phase4.sql`, hardened in `add_phase4_hardening.sql`)
View-count milestone dedupe for notifications.
- `id PK`, `review_id →reviews CASCADE`, `milestone integer`, `created_at`, **UNIQUE(review_id,milestone)** (enables `ON CONFLICT DO NOTHING`).
- **RLS:** `Anyone can read milestones` SELECT true. The original permissive `Service role can insert milestones` INSERT policy was **DROPPED** by `add_phase4_hardening.sql` (W-04): service_role bypasses RLS, so no INSERT policy is needed and none should exist. **iOS cannot insert milestones** — server-side only.

### `user_follows`  (`add_social_week2.sql`)
- `id PK`, `follower_id →auth.users CASCADE`, `following_id →auth.users CASCADE`, `created_at`, **UNIQUE(follower_id,following_id)**, **CHECK(follower_id<>following_id)**.
- **RLS:** `Anyone can read follows` SELECT true; `Users can follow` INSERT `auth.uid()=follower_id`; `Users can unfollow` DELETE `auth.uid()=follower_id`.
- Indexes: `follower_id`, `following_id`. Drives `profiles.follower_count/following_count` via trigger.

---

## 3. Music domain (self-contained module — `src/modules/music`)

Design rule: Music is feature-agnostic. `music_usage.entity_type/entity_id` are **opaque** (never FKs into `reviews`). Consuming features store their own selection (e.g. `reviews.music` jsonb).

### `music_providers`  (`20260704_add_music_module.sql`)
- `id PK`, `slug UNIQUE`, `name`, `created_at`. Seeded: `internal`, `pixabay`.
- **RLS:** `Anyone can read music providers` SELECT true.

### `music_categories`  (`20260704_add_music_module.sql`)
- `id PK`, `slug UNIQUE`, `label_i18n jsonb` (`{vi,en,ja}`), `sort_order int`, `is_active bool default true`, `created_at`.
- **RLS:** `Anyone can read active music categories` SELECT `USING (is_active)`.
- Seeded (`20260705_seed_music_demo_catalog.sql`): trending, chill, upbeat, acoustic, electronic, cinematic.

### `music_tracks`  (`20260704_add_music_module.sql`; extended repeatedly)
The catalog.
- **Base cols:** `id PK`, `title`, `artist`, `duration_sec int` (CHECK `>0`, `20260704_tighten_music_constraints.sql`), `audio_url`, `preview_url`, `cover_url`, `category_id →music_categories`, `provider_id →music_providers` **NOT NULL** (tightened), `is_active bool default true` (licensing kill-switch), `created_at`.
- **Added:** `music_type text NOT NULL default 'royalty_free'` CHECK ∈ {royalty_free,licensed,original_sound,ai_generated,external} (`20260706_add_music_saved_and_type.sql`); `play_count int default 0` (ibid); `uploaded_by uuid →auth.users ON DELETE SET NULL` + `rights_confirmed bool default false` (`add_original_sound_ugc.sql`); `license text` + `source_url text` (`add_music_attribution.sql`, **UNIQUE(source_url) WHERE NOT NULL** to block dup ingestion).
- **RLS:** `Anyone can read active music tracks` SELECT `USING (is_active)`. **UGC insert** (`add_original_sound_ugc.sql`): `Users publish own original sound` INSERT `WITH CHECK (auth.uid()=uploaded_by AND music_type='original_sound' AND rights_confirmed=true)`; `Uploader can deactivate own track` UPDATE self (soft-delete via `is_active`). Curated/admin catalog inserts use service role (bypass RLS).
- Indexes: category, provider, `(is_active,created_at DESC)`, `lower(title)`, `lower(artist)`, `uploaded_by`, `source_url` unique-partial.
- **Demo catalog** repointed from soundhelix.com → self-hosted `/music/*.mp3` (`20260706c_repoint_music_audio_local.sql`, VN reachability fix).
- **iOS parity:** reads active tracks directly. Uploading Original Sound: iOS gets a Vercel Blob token via `POST /api/upload/audio`, then inserts the track row under RLS with `music_type='original_sound' AND rights_confirmed=true AND uploaded_by=self` — OR (recommended) via the reviews/music API. The RLS CHECK is strict and iOS must satisfy all three predicates.

### `music_usage`  (`20260704_add_music_module.sql`)
Append-only "track X used by entity Y" log.
- `id PK`, `track_id →music_tracks CASCADE` **NOT NULL** (tightened), `entity_type text`, `entity_id uuid`, `user_id →auth.users ON DELETE SET NULL`, `created_at`.
- **RLS:** `Users can record their own music usage` INSERT `WITH CHECK auth.uid()=user_id`. **No SELECT policy** → not publicly readable (analytics via service role).
- Indexes: `track_id`, `(entity_type, entity_id)`.

### `music_saved`  (`20260706_add_music_saved_and_type.sql`)
- `id PK`, `user_id →auth.users CASCADE`, `track_id →music_tracks CASCADE`, `created_at`, **UNIQUE(user_id,track_id)**.
- **RLS:** own-row SELECT/INSERT/DELETE (`auth.uid()=user_id`). Indexes: track, user.

### `music_followed`  (`20260706_add_music_saved_and_type.sql`)
- Same shape/RLS as `music_saved` — user follows a track for "new videos using this sound" notifications (delivery deferred).

### `music_track_reports`  (`add_original_sound_ugc.sql`)
Notice-and-takedown copyright/abuse reports.
- `id PK`, `track_id →music_tracks CASCADE`, `reporter_id →auth.users ON DELETE SET NULL`, `reason text CHECK ∈ {copyright,inappropriate,spam,other}`, `details text`, `status text default 'open' CHECK ∈ {open,reviewing,actioned,dismissed}`, `created_at`.
- **RLS:** `Users can file a report` INSERT `WITH CHECK auth.uid()=reporter_id`. **No SELECT policy** → only the copyright agent's service-role tooling reads reports.
- Index: track, partial `status WHERE status='open'`.

**Music public-count SECURITY DEFINER RPCs** (`20260706b_add_music_count_fns.sql`): `music_saved_count(uuid)`, `music_followed_count(uuid)` — return aggregate counts to anon **without** exposing who saved/followed (no public row SELECT). `music_increment_play(uuid)` (`20260706_...`) SECURITY DEFINER, granted to `anon,authenticated`, bumps `play_count` despite tracks being read-only under RLS. See §4.

---

## 4. Counter / trigger / RPC logic (and the bug fixes)

**The central bug class (fixed across `20260703_*` + `add_counter_security_definer.sql`):** the counter-sync trigger functions originally ran **without `SECURITY DEFINER`**, i.e. as the invoking user. Because `reviews`/`profiles` have RLS with **no UPDATE policy for other users' rows**, the triggers' internal `UPDATE ... SET <counter>` silently affected **0 rows** (RLS filters, doesn't error). Result: like/save/comment/follow counts and watch stats never moved for ordinary authenticated users. **Fix:** recreate every counter function with `SECURITY DEFINER SET search_path=public` so it runs as the owner (`postgres`, `BYPASSRLS=true`). `CREATE OR REPLACE FUNCTION` preserves the existing trigger binding.

| Function | Trigger / caller | Table effect | Definer? | Origin → fix |
|---|---|---|---|---|
| `update_review_like_count()` | `trg_review_like_count` AFTER INS/DEL on `review_likes` | `reviews.like_count ±1` (GREATEST 0) | ✅ (`20260703_fix_like_count_trigger.sql`) | `add_review_social.sql` |
| `update_review_save_count()` | `trg_review_save_count` on `review_saves` | `reviews.save_count ±1` | ✅ (`20260703_fix_save_count_trigger.sql`) | `add_explore_upgrade.sql` |
| `update_review_comment_count()` | `trg_review_comment_count` on `review_comments` | `reviews.comment_count ±1` | ✅ (`20260703_fix_comment_count_trigger.sql` + re-asserted in `add_counter_security_definer.sql`) | `add_social_week2.sql` |
| `update_follow_counts()` | `trg_follow_counts` on `user_follows` | `profiles.follower_count/following_count ±1` | ✅ (`add_counter_security_definer.sql`, Bug #3) | `add_social_week2.sql` |
| `sync_review_watch_stats(uuid)` | called by watch-interact route | recompute `reviews.watch_time_avg`(round 1dp)/`completion_rate`(round 3dp) from `review_interactions` | ✅ (`add_counter_security_definer.sql`, Bug #4); `GRANT EXECUTE ... TO authenticated` | replaced RLS-dropped route UPDATE |
| `get_interaction_avgs(uuid)` | called after upsert | returns `avg_watch, avg_completion` | ✅ (`add_phase4_hardening.sql`, W-02 perf) | new |
| `increment_review_view(uuid)` | RPC on view | `reviews.view_count +1` | ✅ (`add_phase4.sql`); **EXECUTE revoked from anon/public, granted authenticated** (`add_gatea_db_hardening.sql`) to stop anon trending inflation | new |
| `music_increment_play(uuid)` | RPC | `music_tracks.play_count +1` | ✅; granted `anon,authenticated` | `20260706_...` |
| `music_saved_count/ music_followed_count(uuid)` | RPC | aggregate only | ✅ STABLE; granted `anon,authenticated` | `20260706b_...` |
| `update_notification_subscriptions_updated_at()` | `trg_notif_subs_updated_at` BEFORE UPDATE | sets `updated_at=now()` | n/a | `20260621_...` |

**Backfills (one-time, idempotent):** `20260704_backfill_review_counters.sql` recomputes like/save/comment counts from junction tables (rows created pre-fix were undercounted). `add_counter_security_definer.sql` §4 additionally backfills comment_count, follow counts, and watch stats.

**iOS parity:** iOS must **never** write denormalized counters directly (RLS blocks it, and it would corrupt state). Counters are DB-maintained. iOS only inserts/deletes junction rows (`review_likes`, `review_saves`, `review_comments`, `user_follows`, `music_saved`, `music_followed`) and calls the RPCs (`increment_review_view` requires auth; `music_increment_play` allows anon).

---

## 5. Preferences / Memory / Personalization domain

### `user_preferences`  (base `supabase-schema.sql`; extended by 4 migrations)
Typed + inferred personalization. **PK = `user_id`** (1:1). Note repo history shows two shapes reconciled in prod.
- **Cols (live):** `user_id uuid PK →auth.users`, `budget_level text CHECK ∈{cheap,mid,high}`, `cuisine_likes text[]`, `dietary_restrictions text`, `inferred_preferences jsonb`, `updated_at`, `budget_min int`, `budget_max int`, `preferred_style text[]`, `dietary_tags text[]`, `disliked_tags text[]`, `usual_party_size int` (`20260627_user_memory.sql`), `preference_profile jsonb` + `profile_updated_at timestamptz` (`add_user_preference_profile.sql`, cache), `preferences jsonb default '[]'` (`add_preferences.sql`, freeform).
- **RLS:** `Users can manage own preferences` FOR ALL self (idempotent guard against duplicate).
- Index: `(user_id, profile_updated_at DESC)`.

### `user_memory`  (base `supabase-schema.sql`; extended)
AI long-term memory. **Note `user_id` is `text` in prod** (not uuid) and `updated_at` is `timestamp without time zone`.
- **Cols (live):** `id PK`, `user_id text` (UNIQUE per base), `location_base text`, `preferences jsonb`, `budget jsonb`, `history jsonb`, `updated_at`, `companions text` + `timing text` + `personality text` (`add_memory_columns.sql`), `behavior_summary text` (`add_tracking_integrations.sql`). Base also declares `bookmarks/recent_searches/custom_facts jsonb`.
- **RLS:** `Users can manage own memory` FOR ALL `auth.uid()=user_id`.
- Index: `user_id` (morning-brief cron lookup).

### `user_events`  (⚠️ two conflicting `CREATE TABLE IF NOT EXISTS` — reconciled)
Append-only behavioral log. Defined in **both** `add_tracking_integrations.sql` (no place_id/review_id) and `20260627_user_memory.sql` (with place_id/review_id uuid). Whichever applied first wins → `add_gatea_db_hardening.sql` **guarantees `place_id uuid` + `review_id uuid` exist** regardless of order.
- **Cols (live, 5 in introspection):** `id PK`, `user_id uuid →auth.users CASCADE`, `event_type text`, `metadata jsonb`, `created_at` (+ `place_id`,`review_id` via hardening).
- **`event_type` CHECK allowlist** (`add_event_type_check.sql`, `NOT VALID` = new rows only): page_view, page_time, chat_search, category_click, place_save, place_click, review_view, deal_click, feature_use, review_search, review_like, review_share, review_post, hide, not_interested, report, like, skip_suggestion, checkin, view_review, open_app.
- **RLS:** self-scoped — `Users read own events` SELECT + `Users insert own events` INSERT (tracking version) / `Users manage own events` FOR ALL (memory version). Net: users read+write only their own events.
- Indexes: `(user_id, created_at DESC)`, `event_type`.

### `user_integrations`  (`add_tracking_integrations.sql`)
OAuth tokens for third-party services (google_calendar, zalo).
- `id PK`, `user_id →auth.users CASCADE`, `provider text`, `access_token text`, `refresh_token text`, `expires_at`, `scope text`, `provider_user_id text`, `metadata jsonb`, `connected_at`, `updated_at`, **UNIQUE(user_id,provider)**.
- **RLS:** `Users manage own integrations` FOR ALL self. (Tokens plaintext for MVP — noted as "Vault ideally".) **iOS should never read another user's tokens; treat this as server-brokered — OAuth flows run through Next.js routes.**

---

## 6. Notifications / Price-watch / Groups / Places / Billing / Chat / Commerce

### `notification_subscriptions`  (`20260621_notification_subscriptions.sql`)
Web-push (and future FCM) subscriptions.
- `id PK`, `user_id →auth.users CASCADE`, `provider text default 'webpush'` (future `'fcm'`), `subscription_data jsonb` (webpush `{endpoint,keys:{p256dh,auth}}`; fcm `{token}`), `enabled bool default true`, `created_at`, `updated_at`, **UNIQUE(user_id,provider)**.
- **RLS:** `users_manage_own_subscriptions` FOR ALL self. Trigger `trg_notif_subs_updated_at` bumps `updated_at`.
- **iOS parity note:** the schema already anticipates native push — iOS registers an FCM/APNs token as a row with `provider='fcm'` (or a new APNs provider). Same `UNIQUE(user_id,provider)` upsert semantics.

### `price_watches`  (`add_price_watches.sql`)
Target-price alerts, checked by cron.
- `id PK`, `user_id →auth.users CASCADE NOT NULL`, `product_name text`, `target_price bigint` (VND), `current_price bigint`, `search_query text`, `status text default 'active' CHECK ∈{active,triggered,cancelled}`, `notified_at`, `last_checked`, `created_at`.
- **RLS:** `Users manage own price watches` FOR ALL self. Partial index on `status WHERE status='active'` (cron scan).

### `groups`  (`add_groups.sql`)
Group-dining decision helper.
- `id PK`, `creator_id →auth.users CASCADE`, `name text`, `status text default 'open' CHECK ∈{open,closed}`, `suggestion text`, `created_at`.
- **RLS:** `Anyone can read groups` SELECT true; `Creators manage own groups` FOR ALL `auth.uid()=creator_id`.

### `group_members`  (`add_groups.sql`; hardened `add_group_members_auth.sql`)
- **Cols (live):** `id PK`, `group_id →groups CASCADE NOT NULL`, `name`, `budget text`, `food_preferences text`, `dietary_restrictions text`, `area text`, `created_at`, **`user_id uuid →auth.users CASCADE`** (added by hardening, nullable for legacy rows).
- **Security fix (`add_group_members_auth.sql`, High):** original `Anyone can join a group` INSERT `WITH CHECK(true)` let **anyone inject member rows into any group anonymously**. Replaced with `group_members_insert_self` INSERT `TO authenticated WITH CHECK auth.uid()=user_id` + new `group_members_delete_self` DELETE self. Partial **UNIQUE(group_id,user_id) WHERE user_id IS NOT NULL** (one membership per user). `Anyone can read group members` SELECT true remains.
- **iOS parity:** joining a group requires auth and self-attribution (`user_id=self`).

### `place_photos`  (`20260620_place_photos.sql`; hardened `add_gatea_db_hardening.sql`)
Legacy Google-Places photo cache.
- `place_id text PK`, `photo_url text`, `created_at`.
- **RLS:** `anon_read` SELECT true remains; the permissive `anon_insert`/`anon_update` (cache-poisoning vector) were **DROPPED** by gatea hardening — writes now service-role only. **Table is no longer read by app code** (image pipeline moved to Serper gstatic thumbnails). Treat as dead/legacy; iOS should not use it.

### `billing_customers`  (`add_billing_customers_isolation.sql`)
Isolated Stripe customer mapping (moved out of `profiles`).
- `user_id uuid PK →auth.users CASCADE`, `stripe_customer_id text UNIQUE`, `created_at`, `updated_at`.
- **RLS:** `REVOKE ALL FROM anon, authenticated; GRANT SELECT TO authenticated`; `billing_customers_select_own` SELECT `TO authenticated USING auth.uid()=user_id`. **No INSERT/UPDATE/DELETE policy → default deny; only service_role (webhooks) writes.** No anon access at all.

### `subscriptions`  (base `supabase-schema.sql`)
Stripe subscription state.
- **Cols (live):** `id PK`, `user_id →auth.users NOT NULL UNIQUE`, `stripe_customer_id text`, `stripe_sub_id text` (base names it `stripe_subscription_id`/`price_id`; live introspection shows `stripe_sub_id`, `plan`, `cancel_at_period_end` — prod drift), `status text default 'inactive'`, `current_period_end`, `created_at`, `updated_at`.
- **RLS:** `Users can view own subscription` SELECT self. **Writes = service_role only** (Stripe webhook; no write policy). Indexes: user_id, status.
- **iOS parity:** iOS **reads** own subscription/plan status directly (to gate Pro features); it must **never write** — all subscription mutations flow through Stripe webhooks → `/api/webhooks/stripe` (service role). Checkout/portal via `/api/stripe/checkout` + `/api/stripe/portal`.

### `conversations`  (base `supabase-schema.sql`)
Saved chat history.
- `id PK`, `user_id →auth.users NOT NULL`, `title text default 'Cuộc trò chuyện mới'`, `category text default 'general'`, `messages jsonb default '[]' NOT NULL`, `created_at`, `updated_at`.
- **RLS:** `Users can manage own conversations` FOR ALL self. Indexes: user_id, updated_at DESC.

### `message_feedback`  (base `supabase-schema.sql`; re-asserted `add_message_feedback.sql`)
Per-message 👍/👎/report on chat replies.
- `id PK`, `user_id →auth.users CASCADE`, `conversation_id uuid` (**no FK** in the migration version — feedback allowed on unsaved/anon convos; base version DOES FK to conversations — drift), `message_index int`, `type text CHECK ∈{like,dislike,report}`, `reason text`, `created_at`, **UNIQUE(user_id,conversation_id,message_index,type)**.
- **RLS:** `users_manage_own_feedback` / `Users can manage own message feedback` FOR ALL self.

### `bookings`  (base `supabase-schema.sql`)
Reservation records.
- `id PK`, `user_id →auth.users NOT NULL`, `service_id text`, `service_name text NOT NULL`, `service_type text default 'food'`, `date date NOT NULL`, `time text`, `guests int default 1`, `customer_name text NOT NULL`, `customer_phone text NOT NULL`, `notes text`, `status text default 'pending' CHECK` (pending/confirmed/cancelled), `created_at`, `updated_at`, `place_id text` (prod). 
- **RLS:** `Users can manage own bookings` FOR ALL self. Indexes: user_id, service_id, date. (Feature maturity: partial/experimental.)

### `services`  (base `supabase-schema.sql`)
Curated services directory + vector search.
- **Base cols:** `id PK`, `name`, `type text default 'food'`, `address`, `phone`, `price`, `rating`, `hours`, `maps_link`, `note`, **`embedding vector(1536)`** (requires **pgvector**, `create extension vector`), `created_at`. Live introspection shows a richer prod shape (category, city, price_exact, price_unit, booking_url, images[], tags[], is_active) — prod drift.
- **RLS:** `Services are public` SELECT true. Index: type.

### `favorites`  ⚠️ **no base DDL in repo — prod-only base table**
Saved *places* (distinct from `review_saves`).
- **Cols (live):** `id PK`, `user_id uuid`, `place_id text`, `place_name text`, `place_address text`, `place_type text`, `created_at`. Expected **UNIQUE(user_id,place_id)** (route uses `onConflict:'user_id,place_id'` upsert) — prod-authoritative.
- **API:** `/api/favorites` (GET/POST/DELETE), fully self-scoped. **iOS:** save/list/remove places; should go via API (or direct self-scoped once base RLS confirmed).

### `vouchers`  (prod-only, **LEGACY — exclude**)
12-col coupon table (`service_id →services`, original_price, sale_price, discount_pct, quantity_total/sold, expires_at). **Zero references** in `src/` or migrations. Off-roadmap (Shopping = affiliate links only). iOS must **NOT** use it; flagged for a prod drop decision.

---

## 7. Security hardening summary (what each migration enforces)

| Migration | Enforces |
|---|---|
| `add_profiles_email_isolation.sql` | **Critical** — `profiles.email` was world-readable via anon key (duplicate of `auth.users.email`). PART 1: `REVOKE SELECT(email) FROM anon` + stop `handle_new_user()` writing email. PART 2 (commented, run post-deploy): `DROP COLUMN email`. **Prod: email already dropped.** |
| `add_billing_customers_isolation.sql` | **Critical** — moves `stripe_customer_id` out of publicly-readable `profiles` into locked `billing_customers` (no anon, authenticated SELECT-own-only, service-role writes). PART 2 (commented): drop `profiles.stripe_customer_id`. **Prod: column already gone.** |
| `add_group_members_auth.sql` | **High** — closes anonymous `WITH CHECK(true)` group-join; INSERT now `authenticated` + self-attributed; adds self-DELETE + per-user uniqueness. |
| `add_gatea_db_hardening.sql` | Bundle: (1) `increment_review_view` EXECUTE revoked from anon (anti view-inflation); (2) drop anon write on `place_photos` (anti cache-poison); (3) reconcile `user_events` place_id/review_id column drift; (4) add `reviews(user_id)` index. |
| `add_phase4_hardening.sql` | Idempotent `review_interactions` self-isolation; **drop** permissive `review_milestones` INSERT policy (service-role-only); add `get_interaction_avgs` DB-side AVG (perf). |
| `20260703_*` + `add_counter_security_definer.sql` | Counter-integrity: SECURITY DEFINER on all counter functions so RLS no longer silently zeroes counter UPDATEs (§4). |
| `add_event_type_check.sql` | `user_events.event_type` allowlist CHECK (`NOT VALID`). |
| `20260704_tighten_music_constraints.sql` | `music_tracks.provider_id`/`music_usage.track_id` NOT NULL; `duration_sec>0`. |
| `add_original_sound_ugc.sql` | UGC upload RLS gated on `rights_confirmed=true AND music_type='original_sound' AND uploaded_by=self`; reports table with no public SELECT. |

**Cross-cutting posture:** every user-owned table has RLS enabled with `auth.uid()`-scoped policies; public/social tables (`reviews` visible rows, likes, comments, follows, groups, music catalog, services, profiles-public-columns) allow anon SELECT; sensitive tables (`billing_customers`, `subscriptions`, `user_integrations`, `music_usage`, `music_track_reports`, `user_events`, `user_memory`, `user_preferences`, `favorites`, `bookings`, `conversations`, `message_feedback`, `price_watches`, `notification_subscriptions`) are self-scoped or service-role-only. No anon exposure of email/PII/tokens/billing (verified live).

---

## 8. Storage buckets

**There are ZERO Supabase Storage buckets.** All binary assets use **Vercel Blob** (`@vercel/blob`), gated by `BLOB_READ_WRITE_TOKEN`:

| Asset | Route | Method | Path prefix | Allowed types | Max size |
|---|---|---|---|---|---|
| Video (+ optional images) | `POST /api/upload/video` | client-direct token (`handleUpload`) | Blob random | `video/mp4, video/quicktime, video/webm` (+ image types); thumbnail payload → images only | 50 MB video / 10 MB thumbnail |
| Original-sound audio (+ cover) | `POST /api/upload/audio` | client-direct token | Blob random | `audio/mpeg,mp3,mp4,aac,wav,x-wav,ogg,webm`; cover → images | 20 MB audio / 5 MB cover |
| Review images | `POST /api/reviews/upload` | server `put()` | `reviews/{userId}/{ts}.{ext}` | `image/jpeg,png,webp` | — |
| Profile/avatar images | `/api/profile` (uses `@vercel/blob`) | server put | — | images | — |

- **Access:** all Blob objects are `access:'public'` (public URL). Upload requires auth (`getRequestUser`); Vercel Blob enforces content-type + size against the signed token. `tokenPayload=user.id`.
- **Cost note (in code):** TODO to migrate video to Cloudflare R2 to cut egress; keep Blob for small/infrequent assets.
- **iOS parity:** iOS must obtain a Blob upload token from the same `/api/upload/{video,audio}` routes (client-direct upload) or POST multipart to `/api/reviews/upload`. It cannot use Supabase Storage (none exists). Same auth + type/size limits apply.

---

## 9. Environment variables / external-service inventory (names only)

**Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only).
**AI provider adapters:** `ANTHROPIC_API_KEY` — one provider adapter's credential, held inside the provider layer (`src/lib/ai/llm/providers/`; see `docs/architecture/AI_PLATFORM.md`). Backs the AI capability layer used by chat, tools, OCR `/api/scan`, viet-content, translate, crons.
**Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`.
**Search / Places:** `SERPER_API_KEY` (Serper — images + price-check), `GOOGLE_PLACES_API_KEY` (noted EMPTY in prod; OSM/Overpass is the live substrate).
**Travel:** `TRAVELPAYOUTS_TOKEN` (Aviasales flight prices).
**Music ingest:** `JAMENDO_CLIENT_ID` (CC-BY track ingest, `scripts/ingest-jamendo.mjs`).
**Web Push (VAPID):** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`.
**Analytics:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
**Zalo (VN social login/integration):** `ZALO_APP_ID`, `ZALO_APP_SECRET`.
**Google (Calendar OAuth):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
**Vercel Blob storage:** `BLOB_READ_WRITE_TOKEN`.
**Games (SuperTux WASM assets):** `NEXT_PUBLIC_SUPERTUX_DATA_URL`, `NEXT_PUBLIC_SUPERTUX_WASM_URL`.
**Cron auth:** `CRON_SECRET` (guards all `/api/cron/*`: morning-brief, lunch-reminder, travel-reminder, weekly-recap, price-check, deal-notifications, behavior-rollup; also gates debug/test endpoints).
**App / misc:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `ADMIN_IDS` (comma-list of admin user IDs for moderation/report actions), `NODE_ENV`, `PORT`.

*(No secret values were read or printed — names only, gathered from `process.env.*` references in `src/` and `scripts/` plus `.env.local.example`.)*

---

## 10. iOS parity notes — direct-Supabase vs Next.js-API matrix

The iOS app shares the same Supabase project and holds only the **anon key** → RLS-bound identically to the web browser.

**iOS reads/writes DIRECTLY under RLS (same as web client):**
- Read: public profiles (non-sensitive cols), `reviews` (non-hidden), `review_likes`, `review_comments`, `user_follows`, `music_categories/tracks/providers` (active), `services`, `groups`, `group_members`, own `subscriptions`/`billing_customers` (read-only), own `conversations`, `user_memory`, `user_preferences`, `user_events`, `favorites`, `bookings`, `price_watches`, `notification_subscriptions`, `music_saved`/`music_followed`.
- Write: own row on all self-scoped tables; junction inserts/deletes (`review_likes`, `review_saves`, `review_comments`, `user_follows`, `music_saved`, `music_followed`, `music_usage`); own `music_track_reports` insert; group join (authenticated + self); Original-Sound `music_tracks` insert (must satisfy the strict UGC CHECK).
- RPCs: `increment_review_view` (auth), `music_increment_play` (anon ok), `music_saved_count`/`music_followed_count`.

**iOS MUST go through Next.js API routes (service-role or server-brokered logic):**
- **Billing:** `/api/stripe/checkout`, `/api/stripe/portal`, `/api/webhooks/stripe` — never write `subscriptions`/`billing_customers` directly.
- **Review create + music validation:** `POST /api/reviews` (validates `reviews.music` payload, enforces one-verified-review-per-place 409).
- **Uploads:** `/api/upload/video`, `/api/upload/audio` (Blob token), `/api/reviews/upload` — no Supabase Storage exists.
- **OAuth token exchange:** Google Calendar + Zalo callbacks (`user_integrations` tokens are server-brokered, plaintext, self-RLS but written server-side).
- **AI:** all chat/tools/OCR/translate go to AI-capability-layer-backed routes; provider keys are held only inside the provider layer (server-side).
- **Milestones / view-inflation-sensitive counters:** `review_milestones` inserts are service-role only.
- **Push:** register token in `notification_subscriptions` (schema is FCM-ready via `provider='fcm'`), but delivery is server/cron side.
- **Crons/broadcasts:** all `/api/cron/*` + `/api/notifications/broadcast` require `CRON_SECRET` — server only, not callable by iOS.

**Watch-outs for iOS:**
1. `reviews`, `review_saves`, `favorites` base DDL is prod-only — trust live column shapes, verify constraints against prod, don't assume repo migrations define them.
2. Denormalized counters are DB-trigger-maintained; iOS must never write them.
3. `user_memory.user_id` is `text` (not uuid) and `updated_at` is timestamp-without-tz — bind types accordingly.
4. `place_photos` and `vouchers` are legacy/dead — do not integrate.
5. Prod drift exists on `subscriptions`/`services`/`message_feedback`/`bookings` vs repo base DDL — trust introspection column lists.

---

## Summary (5 lines)

1. **~30 tables across 9 domains** (auth/profiles, reviews-social, music, preferences/memory/tracking, notifications, price-watch, groups, places, billing/chat/commerce); `reviews`/`review_saves`/`favorites` have prod-only base DDL, `vouchers` is dead/legacy.
2. **RLS is uniform and strict:** public-read on social/catalog tables, `auth.uid()`-self-scoped on all user-owned tables, service-role-only writes on billing/subscriptions/milestones/reports — iOS holds only the anon key and is bound identically to the web browser.
3. **The dominant fixed bug** was RLS silently zeroing denormalized counters; every counter/watch-stat function was re-created `SECURITY DEFINER SET search_path=public`, plus one-time backfills — iOS must never write counters, only junction rows + RPCs.
4. **Security hardening** removed public email/stripe exposure (isolated into `billing_customers`; email dropped), closed anonymous group-join, revoked anon view-count inflation and place-photo cache-poisoning, and gated Original-Sound UGC uploads on explicit rights-confirmation.
5. **No Supabase Storage buckets** — all media is Vercel Blob (`BLOB_READ_WRITE_TOKEN`, client-direct tokens, public access, 50 MB video / 20 MB audio caps); external services = Supabase, AI provider adapters (credentials inside the provider layer only), Stripe, Serper, Jamendo, VAPID web-push, PostHog, Zalo, Google, Vercel Blob, Travelpayouts, plus `CRON_SECRET`/`ADMIN_IDS`.

