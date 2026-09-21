# TappyAI — Production Deploy Checklist

Prepared 2026-09-21. Migrations are **hand-applied** to production in the Supabase SQL editor and
there is **no migration-tracking table**, so this checklist is the only guard against schema drift.
Work top to bottom. Every check query is **read-only** — run it *first* and only apply when it says
the migration is missing. Never assume state.

**Ground truth for "already on prod":** `docs/audit/schema-baseline/prod-schema-only.sql`, a
schema-only export dated **2026-09-17**. Everything below was diffed against it.

> 🚫 **Do not trust in-file banners.** Several migrations carry stale
> "NOT APPLIED TO PRODUCTION" / "GATE NOT AUTHORIZED" comments even though their objects are already
> live on prod (`20260817_content_safety_gate`, `20260820_m01`, `20260820_m04`, `20260821_m08`,
> `20260821_m09`). The check queries — not the banners — decide.

> 🍏 **iOS is NOT in this release.** The iOS app still ships the music-reuse UI (its `Features/Music`
> module still calls the now-410 `/api/music/*`, `/api/sound/*`, `/api/upload/audio`). iOS must **not**
> be released until that UI is removed.

---

## 1. The release delta — migrations to apply, in this exact order

Only **eight** migrations are missing from the 2026-09-17 prod snapshot. Apply them in the order below
(chronological filename order, which also satisfies every dependency). Each prerequisite for the
CREATE-OR-REPLACE / policy migrations (#4–#6) is already on prod, so all apply cleanly.

### 1) `supabase/migrations/20260913_plan_shares.sql`  — creates the `plan_shares` table
Backs plan sharing (`/api/plans/share`, incl. the F-029 fix). The 2026-09-17 export lacked it.
- **Check first (expect `applied = f`):**
  ```sql
  SELECT to_regclass('public.plan_shares') IS NOT NULL AS applied;
  ```
- **Apply** the file, then **verify (expect table true + 3 policies + the function):**
  ```sql
  SELECT to_regclass('public.plan_shares') IS NOT NULL AS table_ok,
         (SELECT count(*) FROM pg_policies WHERE tablename='plan_shares') AS policies,
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='plan_share_public') AS fn_ok;
  ```
- **Rollback:** `supabase/migrations/rollback/20260913_plan_shares_rollback.sql`

### 2) `supabase/migrations/20260920100000_commerce_providers.sql`  — creates `commerce_providers`
- **Check first (expect `f`):** `SELECT to_regclass('public.commerce_providers') IS NOT NULL AS applied;`
- **Verify after:** `SELECT to_regclass('public.commerce_providers') IS NOT NULL AS ok;`  (expect `t`)
- **Rollback: none needed — purely additive.** It only CREATEs a new table, a new trigger function
  (`commerce_providers_touch`, not a replacement of anything existing), a trigger, RLS + revoke **on
  that new table**, and seed rows. It ALTERs no existing table and replaces no existing function, so
  there is nothing to unwind. To revert: `DROP TABLE public.commerce_providers CASCADE;`
  `DROP FUNCTION IF EXISTS public.commerce_providers_touch();`

### 3) `supabase/migrations/20260920110000_commerce_feed_items.sql`  — creates `commerce_feed_items` + `commerce_feed_runs`
**Must run after #2** (feed rows key on a `provider_id`).
- **Check first (expect `f`):** `SELECT to_regclass('public.commerce_feed_items') IS NOT NULL AS applied;`
- **Verify after:**
  ```sql
  SELECT to_regclass('public.commerce_feed_items') IS NOT NULL AS items_ok,
         to_regclass('public.commerce_feed_runs')  IS NOT NULL AS runs_ok;   -- both t
  ```
- **Rollback: none needed — purely additive** (two new tables + an index + RLS/revoke on them; no
  existing object touched). To revert: `DROP TABLE public.commerce_feed_items, public.commerce_feed_runs;`

### 4) `supabase/migrations/20260920_f028_dob_self_correct_while_ineligible.sql`  — CREATE OR REPLACE `set_user_date_of_birth`
The base function is already on prod; this replaces the body so an ineligible user can keep
self-correcting their DOB (F-028). Presence of the function name is **not** enough — check the body.
- **Check first (expect `f028_applied = f`):**
  ```sql
  SELECT prosrc ILIKE '%age(CURRENT_DATE, v_existing%' AS f028_applied
  FROM pg_proc WHERE proname='set_user_date_of_birth';
  ```
- **Verify after:** re-run the same query → expect `t`.
- **Rollback:** `supabase/migrations/rollback/20260920_f028_dob_self_correct_while_ineligible_rollback.sql`

### 5) `supabase/migrations/20260921_f032_admin_role_actor_from_authuid.sql`  — CREATE OR REPLACE `fn_grant_admin_role` / `fn_revoke_admin_role`
Security hardening: the admin-role RPCs now authorize on the verified `auth.uid()` instead of a
caller-supplied `p_actor_id`, and re-assert the EXECUTE revoke (F-032). Prereqs (`20260803_platform_owner`,
`20260807_platform_owner_revoke_public_execute`) are on prod.
- **Check first (expect `f032_applied = f`):**
  ```sql
  SELECT prosrc ILIKE '%v_jwt_role%' AS f032_applied
  FROM pg_proc WHERE proname='fn_grant_admin_role';
  ```
- **Verify after (body replaced AND still service_role-only):**
  ```sql
  SELECT (SELECT prosrc ILIKE '%v_jwt_role%' FROM pg_proc WHERE proname='fn_grant_admin_role') AS body_ok,
         has_function_privilege('authenticated',
           (SELECT oid FROM pg_proc WHERE proname='fn_grant_admin_role'), 'EXECUTE') AS auth_can_exec;
  -- expect body_ok = t, auth_can_exec = f
  ```
- **Rollback:** `supabase/migrations/rollback/20260921_f032_admin_role_actor_from_authuid_rollback.sql`

### 6) `supabase/migrations/20260921_music_tracks_lockdown.sql`  — close `music_tracks` to ordinary roles
Drops the four ordinary-role policies and revokes anon/authenticated grants (music reuse retired;
data kept; service_role keeps access). Prereqs (`20260704_add_music_module`, `add_original_sound_ugc`,
`20260818b_music_tracks_publication_boundary`) are on prod.
- **Check first (expect policies = 4, anon_read = t):**
  ```sql
  SELECT (SELECT count(*) FROM pg_policies WHERE tablename='music_tracks') AS policies,
         has_table_privilege('anon','public.music_tracks','SELECT') AS anon_read;
  ```
- **Verify after (expect policies = 0, anon_read = f, and the data survived):**
  ```sql
  SELECT (SELECT count(*) FROM pg_policies WHERE tablename='music_tracks') AS policies,
         has_table_privilege('anon','public.music_tracks','SELECT') AS anon_read,
         has_table_privilege('service_role','public.music_tracks','SELECT') AS svc_read,
         (SELECT count(*) FROM public.music_tracks) AS rows_kept;
  -- expect policies=0, anon_read=f, svc_read=t, rows_kept unchanged
  ```
- **Rollback:** `supabase/migrations/rollback/20260921_music_tracks_lockdown_rollback.sql`

### 7) `supabase/migrations/20260921_user_events_ga4_event_types.sql`  — allow the new GA4 funnel event types on `user_events`
Adds `recommendation_click`, `scam_check`, `chat_opened` to the `user_events_event_type_check`
allowlist so `/api/track` does not silently drop those rows (the F-027 lesson). `report_submitted`
reuses the existing `report` type, and `affiliate_click` is GA-only (no `user_events` row), so neither
needs an entry.

> 🔑 **This migration is deliberately conditional and additive.** PROD (2026-09-17 baseline) has **no**
> `user_events_event_type_check` at all — the forward-compatible envelope migration dropped it and the
> security re-add was never applied to prod. So **on prod this migration is a NO-OP**: it does not create
> a constraint (that would introduce a new restrictive gate and could start dropping event types prod
> currently accepts freely). It only acts where the constraint already exists (the audit/nonprod DB,
> where the G1 growth branch expanded it), and there it rebuilds the constraint as *(current allowed set
> ∪ the three new types)* — never narrowing, so another branch's growth events (`share_out`,
> `action_started`, …) are preserved. Idempotent and `NOT VALID` (new rows only; never fails on history).

- **Check first (is there a constraint to widen?):**
  ```sql
  SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid='public.user_events'::regclass AND conname='user_events_event_type_check';
  -- prod: 0 rows (no-op expected). audit/nonprod: the ANY(ARRAY[...]) allowlist.
  ```
- **Verify after (only meaningful where a constraint exists):**
  ```sql
  SELECT pg_get_constraintdef(oid) LIKE '%recommendation_click%'
     AND pg_get_constraintdef(oid) LIKE '%scam_check%'
     AND pg_get_constraintdef(oid) LIKE '%chat_opened%' AS has_new_types
  FROM pg_constraint
  WHERE conrelid='public.user_events'::regclass AND conname='user_events_event_type_check';
  ```
- **Rollback:** `supabase/migrations/rollback/20260921_user_events_ga4_event_types_rollback.sql`
  (removes only the three added values; also a no-op when no constraint exists).

### 8) `supabase/migrations/20260921_user_events_shopping_search_event.sql`  — allow `shopping_search_click`
Adds one more type, `shopping_search_click` (the shopping "Tìm trên …" search-redirect demand signal),
using the **exact same** conditional dynamic-union pattern as #7 — kept separate because #7 is already
applied (editing it in place would drift). NO-OP on prod (no constraint); union on the audit/nonprod DB.
- **Verify after (only where a constraint exists):**
  ```sql
  SELECT pg_get_constraintdef(oid) LIKE '%shopping_search_click%' AS has_it
  FROM pg_constraint
  WHERE conrelid='public.user_events'::regclass AND conname='user_events_event_type_check';
  ```
- **Rollback:** `supabase/migrations/rollback/20260921_user_events_shopping_search_event_rollback.sql`
  (removes only `shopping_search_click`; no-op when no constraint exists).

- **⚠️ Cross-branch reconciliation:** the G1 growth branch owns the migration that CREATES the big
  `user_events_event_type_check` on prod. Whichever migration ends up creating/replacing that constraint
  on prod **must include `recommendation_click`, `scam_check`, `chat_opened`, `shopping_search_click`**, or these three funnel
  events will be dropped on prod once the constraint lands. This migration protects every environment
  that already has the constraint; it cannot retro-fit a constraint another branch introduces later.

### 🚫 Do NOT apply to prod (demo/seed data)
- `supabase/migrations/20260705_seed_music_demo_catalog.sql` — replaceable demo catalog.
- `supabase/migrations/20260706c_repoint_music_audio_local.sql` — only repoints that demo data.

---

## 2. Order relative to the web / Android deploy

Apply **before** the code deploy (new code depends on the schema, or the migration is a safe no-risk
security change to land early):
- **#1 plan_shares** — REQUIRED before deploy. `/api/plans/share` inserts into it; without the table
  every share 500s.
- **#2 + #3 commerce** — before deploy **if** this release's code reads the commerce feed; otherwise
  any time. Safe to apply before regardless.
- **#4 F-028** — before deploy, so the client's age-correction flow matches the new RPC behaviour.
- **#5 F-032** — any time; the `/api/admin/rbac/roles` route works with the old or new body (it calls
  via the service-role client, which both bodies accept). Recommended **before** deploy since it is a
  security hardening.

Safe **with or after** the deploy:
- **#6 music_tracks_lockdown** — the NEW web/Android code never reads `music_tracks`; the OLD web code
  read it only best-effort (a denied read → the clip plays its own audio), so this degrades
  gracefully whichever side lands first. Recommended **with or just after** the deploy.

- **#7 user_events GA4 event types** and **#8 user_events shopping_search_click** — before OR with the
  deploy where the constraint exists (so the new client `track()` rows are not dropped once the new code
  ships). Both are NO-OPs on prod (no constraint), so on prod their ordering does not matter.

Nothing in this delta must come strictly *after* the deploy.

---

## 3. Rollback order (if you must revert)

Roll back in the **reverse** of the apply order, and only what you applied:
`#8 user_events shopping_search_click` → `#7 user_events GA4 event types` → `#6 music_tracks_lockdown` → `#5 F-032` → `#4 F-028` → `#3 commerce_feed_items` → `#2 commerce_providers` → `#1 plan_shares`.
- #4, #5 rollbacks restore the previous function bodies (F-028/F-032 base). #6 restores the music_tracks
  policies + grants. #1 drops `plan_shares`.
- **#2 and #3 (commerce) have no rollback scripts by design — they are purely additive** (only new
  tables/index/trigger/policies + seed data; no existing object is altered or replaced). Reverting is a
  plain drop of the new tables: `DROP TABLE public.commerce_feed_items, public.commerce_feed_runs;`
  then `DROP TABLE public.commerce_providers CASCADE; DROP FUNCTION IF EXISTS public.commerce_providers_touch();`
  (feed tables before the provider table).

---

## 4. Environment variables & dashboard settings

Confirm these on the **production** project/host (they were unset in the audit env, so re-verify prod):

**Must be set for the core product**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — the prod project.
- `ANTHROPIC_API_KEY` — the only AI provider used.
- `SERPER_API_KEY` — the live place/discovery provider (the five domains depend on it).
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — the rate-limit + AI-question-quota store.

**Feature-gated — set or consciously accept the feature is off**
| Var / setting | Gates | If unset |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` (+ create a Vercel Blob store) | review photo / clip / avatar uploads | uploads fail — **set this** |
| **Supabase Auth → "Allow anonymous sign-ins"** (prod) | guest / anonymous flow | guests can't use the app (enable it on prod as was done on audit) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` (+ create a GA property) | analytics (F-001) | no GA |
| `RESEND_API_KEY` | outbound email / OTP sign-in | email flows off (email+password still works) |
| `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth sign-in | OAuth off |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Pro purchase / upgrade | purchase flow off |
| `ACCESSTRADE_PUBLISHER_ID` | affiliate deal-link wrapping (F-020) | wrapping off — **pending provider approval** |
| `CJ_API_KEY` | CJ affiliate network | off |

---

## 5. Post-deploy smoke test (run on production immediately after)

1. **Home** loads (200); no console errors on first paint.
2. **Sign in** with an email+password account.
3. **Five domains:** ask a Vietnamese food/travel query → real, relevant places come back (Serper live).
4. **Post a text review** → succeeds and appears on your profile.
5. **F-029:** create a large Vietnamese plan and **share** it → returns a link + the `/plan/<id>` page
   renders (no 500).
6. **F-031:** open someone else's clip/review → **⋮ Report** → pick a reason → "report sent".
7. **Copyright policy:** open `/<origin>/copyright` → renders in EN and VI; Android Settings → Legal →
   Copyright Policy opens the same page.
8. **F-034 lockdown:** `GET /rest/v1/music_tracks?select=id` with the **anon** key → empty / permission
   denied (not the catalogue). With the **service** key it still returns rows.
9. **F-032:** confirm the back office loads for an `@tappyai.com` admin; (optional) a plain user's own
   JWT calling `rpc/fn_grant_admin_role` returns `42501`.
10. Watch server logs for 500s during the above.
11. **Buy buttons (revenue path):** after step 12 below has run, ask a shopping query → at least one
    product row shows a "Mua trên …" commerce action. **Before** the feed job runs this will be
    **empty by design** (see §6) — a shopping answer with no buy button is expected until then, not a bug.

---

## 6. Post-deploy data job — populate the commerce feed (buy buttons)

🚨 **Buy buttons do not appear until this runs.** A shopping row gets a commerce CTA only from a
**product-depth** link (A3.3, 2026-09-20: search-page fallbacks are intentionally discarded). Offline,
the only deterministic source of those links is the **`commerce_feed_items`** table, which ships
**empty** (its migration is DDL-only, no seed). Until it is filled, essentially every shopping query
shows **no buy button** — including on production right after deploy.

**What fills it:** the daily cron `GET /api/cron/feed-ingest` (Vercel cron `30 19 * * *`, see
`vercel.json`). It calls `feedMerchants()` → `ingestMerchantFeed()` and upserts into
`commerce_feed_items` (journaled in `commerce_feed_runs`). It needs, as env:
- `CRON_SECRET` (the route requires `Authorization: Bearer $CRON_SECRET`),
- `ACCESSTRADE_API_KEY` **and** `ACCESSTRADE_FEED_ENDPOINT` (missing either → `blocked_no_credentials`,
  nothing written),
- `SUPABASE_SERVICE_ROLE_KEY` (the admin write client).
- `commerce_providers` seeded (its migration seeds shopee/tiktokshop/lazada/etc.) and the provider
  active with an approved campaign.

**Run it once, right after deploy** (do not wait for 19:30 UTC):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<prod-host>/api/cron/feed-ingest
```
Success = `outcome:"ok"` with `written > 0` per merchant, and rows in `commerce_feed_runs`. If it
reports `blocked_no_credentials`, the Accesstrade env is missing — buy buttons will stay absent until
it is set and the job re-run. (This is the same reason the audit env shows zero buy buttons: no feed +
no Accesstrade key. Not a resolver bug.)

---

## 7. Branch skew — cross-branch migration hazard (READ before merging with g1-growth)

**Fact (audit DB, 2026-09-21):** the shared audit/nonprod DB carries schema objects that exist in
**neither** this branch's migrations **nor** the prod snapshot — they were applied from other branches.
App-level (excluding the `vector`/pgvector extension's ~91 functions, which are environment setup):
- **Tables:** `chat_reports`, `contact_identity_index`, `contact_matches`, `contact_sync_state`,
  `governed_events`, `query_texts`.
- **Views:** `analytics_ai_misses`, `analytics_funnel_daily`, `analytics_vertical_mix_daily`.
- **Function:** `contact_sync_touch_updated_at` (trigger for `contact_sync_state`).

None of these ship from this branch; do not assume the audit DB == prod. Prod (2026-09-17 baseline) has
**none** of them, and — critically — **no `user_events_event_type_check` constraint at all**.

**The `user_events` CHECK hazard.** The 52-value `user_events_event_type_check` on the audit DB is **not
reproduced by any committed migration** in either branch (it was applied ad-hoc). g1-growth's only CHECK
migration, `add_event_type_check.sql`, is an `IF NOT EXISTS`-guarded **21-value** list that contains
neither the growth events (`share_out`, `action_started`, …) nor this branch's three new types
(`recommendation_click`, `scam_check`, `chat_opened`). It is currently orphaned (not in any release
delta). **If that migration — or any migration that CREATES an enumerated `user_events_event_type_check`
from a single branch's list — is applied to prod, every event_type not in that list is dropped silently
(the F-027 failure), including these three funnel events and all growth events.**

**Safe merge order & what must change:**
1. This branch (uat/release-audit) merges first. Its migration **#7** is a conditional dynamic **union**
   and a **no-op on prod** (no constraint there), so it never narrows anything and never introduces a gate.
2. When merging **g1-growth**: do **NOT** ship `add_event_type_check.sql` (or any narrowing enumerated
   CHECK) to prod. Either
   - **keep prod forward-compatible** (no event_type CHECK — the envelope-foundation design), i.e. exclude
     that orphan migration from the prod apply path on both branches; **or**
   - if a CHECK is wanted as a security control, replace the enumerated list with the **dynamic-union**
     pattern of migration #7 (add values, never DROP-and-narrow), authored as the single source and
     ordered to run **after** every branch's event-type additions, and its list must include
     `recommendation_click`, `scam_check`, `chat_opened`, `shopping_search_click` **and** the growth events.
3. Whichever approach, the reconciliation is a documentation duty here: migration #7 protects every
   environment that already has the constraint, but it cannot retro-fit a constraint another branch
   creates later.

### 🔒 Privacy review REQUIRED before g1-growth merges — contacts & stored query text

Four of the g1-growth objects above process personal / sensitive data and **must not ship without a
privacy sign-off**, independent of the schema reconciliation:

- **Contact sync** — `contact_identity_index`, `contact_matches`, `contact_sync_state`. Reading a
  user's contacts is a **Play sensitive-permission** surface. Before merge, confirm:
  1. **Runtime consent + disclosure** — an in-context prompt explaining why contacts are accessed
     *before* the `READ_CONTACTS` request, and a prominent in-app disclosure (Play's Prominent
     Disclosure & Consent requirement). Contacts access without it is a policy-strike risk.
  2. **Play Data Safety** — declare **Contacts** collected, the purpose, whether it is shared, whether
     it is linked to identity, and the deletion path. (This is separate from the analytics declaration;
     do not fold it in.)
  3. **Privacy policy** — a clause naming contact collection, what is derived (`contact_matches` /
     `contact_identity_index` — hashed identifiers? plaintext?), and how a user deletes it. Verify
     whether identifiers are **hashed at rest**; if plaintext, that is its own finding.
  4. **Minimum-necessary + retention** — a stated retention/purge for `contact_sync_state` and the
     match tables, and deletion on account deletion / permission revocation.
- **Stored query text** — `query_texts`. This persists **raw user query strings**, which the analytics
  layer deliberately never stores (GA4/`user_events` strip query text). Before merge, confirm:
  1. a **defined retention period** (with an automated purge) — raw queries are free-text PII by
     content and cannot be kept indefinitely;
  2. **Data Safety** + **privacy-policy** coverage of "search/query content" as collected data;
  3. access controls (RLS) so a user's stored queries are not readable by others, and deletion on
     account deletion.

Owner action: route contact sync and query-text storage through a privacy review (consent, Data
Safety, privacy policy, retention) **before** the g1-growth merge lands them on prod.

---

*Migration inventory diffed against `docs/audit/schema-baseline/prod-schema-only.sql` (2026-09-17).
Eight migrations (§1 #1–#8) are the release delta; everything else is already applied. §7 records the
audit-DB objects that belong to neither this branch nor prod.*
