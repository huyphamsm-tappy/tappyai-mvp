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

> 🎵 **Music — HIDDEN BY DEFAULT, reconciled with the code (owner decision 2026-09-24).**
> Music is out — not launching, no licensing review. The state below is what the code actually does at
> `uat/phase7-regressions` HEAD, so this checklist and the code now MATCH:
> - **Two separate things.** The *reuse* path ("use this sound" — borrow another user's clip audio) was
>   retired for good by F-024/F-034 and stays gone. Session A (`9f85cde`) then RESTORED the *library*
>   half — the `/music` browser + the composer soundtrack picker, reading a curated `royalty_free`/
>   `licensed` catalogue. That restore is real and is in HEAD; the earlier "music removed" write-ups
>   were about the reuse path, not the library.
> - **The hide.** A single hardcoded flag `SHOW_MUSIC = false` (`src/lib/config/product.ts`, same shape
>   as `SHOW_MARKETPLACE`/`SHOW_WALLET`) now gates every WEB entry point: Smart Tools card, the sidebar
>   row, the Explore and public-profile top-bar links, the composer picker, the feed/detail soundtrack
>   credit + playback, and `/music` itself (404s via `notFound()`). It is a code default, NOT an env
>   read: if the flag were unset Music would still be hidden. Flip it to `true` to restore everything.
> - **Backend untouched.** `/api/music/*` GET still serves the library via the **service-role** client;
>   POST/upload and `/api/sound/*` stay **410**. Nothing in the UI calls these while `SHOW_MUSIC=false`,
>   and no cron touches music.
> - **Android:** already clean — no reachable music surface exists (nothing to gate).
> - **iOS is NOT in this release.** iOS carries the full music UI *including* the retired reuse SoundPage.
>   A mirror flag `FeatureFlags.showMusic = false` (`ios/TappyAI/Core/Config/FeatureFlags.swift`) now
>   gates the iOS composer section and the feed music disc, but **this has NOT been compiled** (no macOS
>   in this environment). iOS must not be released until it is built and the gate is verified.

---

## 1. The release delta — migrations to apply, in this exact order

> **Rewritten 2026-09-24 (PRELAUNCH Part 3).** The 2026-09-21 version said "only eight". That was true
> for the branch it was written on (`33d9147`); the shipping branch has since absorbed Phase 7 Session A
> (`9f85cde`, 3 migrations) and G1 growth (`47f2d5e`/`8a01877`, 2 migrations). Of the **16** migration files
> on the shipping branch that `origin/main` (`842379b`) lacks, **3 are already on production** (applied by
> hand on 2026-09-15; present in the 09-17 snapshot), **12 must be applied**, and **1 must be skipped**.
> Evidence: object-by-object diff against `docs/audit/schema-baseline/prod-schema-only.sql`; all 16 verified
> present on the AUDIT database 2026-09-24 (`docs/uat/evidence/migrations-2026-09-24.txt`).

**Authoritative order** (chronological filename order; every dependency is satisfied by it). "Blocker" =
code on the shipping branch fails for users if the migration is missing when the code deploys.

| Step | File | What it does | Additive? | Rollback | Blocker if missing |
|---|---|---|---|---|---|
| — | `20260905_chat_messaging_phase1` | chat tables/RPCs | — | file | **Already on prod** — verify only (§1-V) |
| — | `20260906_phase6_messenger_reachability` | chat blocks/settings | — | file | **Already on prod** — verify only |
| — | `20260915_review_shares` | `review_shares` | — | file | **Already on prod** — verify only |
| G1 | `20260913_g1_growth_foundation` | `shared_results`, `anon_identity_map`, `fn_shared_result_bump` | yes (new tables/fn) | file | **YES** — "Public link" share (web + Android) 500s: *Could not find the table 'public.shared_results'* (measured on audit before applying) |
| 1 | `20260913_plan_shares` | `plan_shares` + `plan_share_public()` | yes | file | **YES** — every plan share 500s |
| P1 | `20260915_profile_public_presentation` | `profiles.bio`, `profiles.cover_url` | yes (2 columns) | file | no — `/api/profile` has a 42703 fallback; the cover control stays hidden until applied |
| G2 | `20260918_g1b_share_ancestry` | `shared_results.parent_id`, `owner_is_anonymous` + indexes | yes | file | **YES** (with G1) — share creation writes these columns |
| 2 | `20260920100000_commerce_providers` | `commerce_providers` | yes | none needed | only if the commerce feed is read |
| 3 | `20260920110000_commerce_feed_items` | `commerce_feed_items`, `commerce_feed_runs` | yes | none needed | as #2 |
| 4 | `20260920_f028_dob_self_correct_while_ineligible` | replaces `set_user_date_of_birth` body | no (REPLACE) | file | age-correction flow mismatch |
| 5 | `20260921_f032_admin_role_actor_from_authuid` | replaces admin-role RPC bodies (security) | no (REPLACE) | file | no (security hardening) |
| 6 | `20260921_music_tracks_lockdown` | drops 4 policies, revokes anon/auth | no (revokes) | file | no |
| 7 | `20260921_user_events_ga4_event_types` | widens a constraint **if present** | conditional | file | no — **no-op on prod** |
| 8 | `20260921_user_events_shopping_search_event` | same pattern | conditional | file | no — **no-op on prod** |
| GR | `20260922_groups_avatar_url` | `groups.avatar_url` | yes (1 column) | file | **YES** — `GET /api/group` selects `avatar_url`; without it every group answers 404 `group_not_found` |
| **L1** | `20260915b_review_likes_private` (**added 2026-09-25, merge-loss recovery**) | `review_likes` SELECT becomes owner-only; `review_likers(review)` + `hot_places_24h()` SECURITY DEFINER reads (anon-executable) | no (replaces 1 policy) | §1-L1 | **PRIVACY** — without it anyone with the anon key lists any user's whole like history (`?user_id=eq.<id>`, measured on audit 2026-09-25). ⚠️ Apply **immediately BEFORE** the web deploy (§2) |
| **S1** | `20260904_group_read_boundary` (**added 2026-09-25, F-065 P0**) | drops `"Anyone can read groups"` / `"Anyone can read group members"` (`USING (true)` to `public`); participant-only SELECT `TO authenticated` via `fn_group_participant()` | no (replaces 2 policies) | §1-S1 | **SECURITY** — without it anyone holding the public anon key reads every group and every member's name/area/budget/dietary restrictions (measured on audit 2026-09-25). ⚠️ **Apply AFTER the web deploy** (§2) |
| **D1** | `20260911b_user_memory_auth_fk` (**added 2026-09-25, F-093 P1**) | `user_memory.user_id` text → uuid, FK → `auth.users` **ON DELETE CASCADE**; policy recreated as `auth.uid() = user_id`; removes orphan rows first, fingerprints them in `user_memory_fk_cleanup_log` | no (type change + FK) | rollback/ file | **DELETION PROMISE** — without it, deleting an account leaves its AI memory behind (`/delete-account` promises it is removed). ⚠️ **Owner authorization required** (migration header). Independent of the web deploy |
| **D2** | `20260925_account_deletion_cascade_gaps` (**added 2026-09-25, F-093 P1**) | FK → `auth.users` **ON DELETE CASCADE** on `decision_evidence.owner_id` and `anon_chat_usage.user_id` (added `NOT VALID`, validated only when no orphan exists; deletes nothing) | no (2 FKs) | rollback/ file | same promise, the two other stores. After D1. ⚠️ **Owner authorization required** |
| **D3** | `20260925b_decision_evidence_sweep` (**added 2026-09-25, F-097**) | function `decision_evidence_sweep(p_limit)` — deletes `decision_evidence` rows past `expires_at`, service_role only; called daily by `/api/cron/decision-evidence-sweep` (`vercel.json` 18:15 UTC) | no (1 function) | rollback/ file | **RETENTION** — without it expired shopping/place evidence of users who never return is kept forever. ✅ **Owner APPROVED 2026-09-25**; the cron ships with the code and answers 500 until this is applied |
| **D4** | `20260925c_account_deletion_f096` (**added 2026-09-25, F-096**) | `shared_results.owner_id` and `notifications.actor_id` SET NULL → **CASCADE**; table `account_deletion_jobs` + BEFORE DELETE trigger on `auth.users` that queues the deleted user's group ids and Google Calendar token; cron `/api/cron/account-deletion-jobs` deletes their uploads from the bucket and revokes the grant | no (2 FKs, 1 table, 1 trigger) | rollback/ file | **DELETION PROMISE** — public share pages, notifications carrying the user's name, and uploaded files outlive the account without it. ⚠️ **Owner authorization required.** Apply BEFORE publishing the new /delete-account copy |
| **D5** | `20260925d_audit_log_pii_retention` (**added 2026-09-25, F-096**) | new audit rows store **no email**; IP + user-agent → `audit_log_client` (90 days) with a salted digest in the chained row; sensitive before/after/metadata keys masked; 12-month prune behind a verified anchor (`audit_log_anchor`, anchor-aware `fn_verify_audit_chain`); cron `/api/cron/audit-retention` | no (column made nullable, trigger, 2 tables, verifier replaced) | rollback/ file | **RETENTION** — without it every admin action keeps email, IP and user-agent forever. ⚠️ **Owner authorization required.** Independent of the deploy |
| ✗ | `20260922_music_soundhelix_attribution` | data UPDATE on `music_tracks` | — | none | **SKIP on prod.** It requires `license`/`source_url` from `add_music_attribution.sql`, which prod does NOT have (09-17 snapshot) → it would fail. Music is hidden and not launching. |

The detailed check / apply / verify blocks for #1–#8 follow unchanged; the new steps (G1, P1, G2, GR,
the verify-only three and the skip) are at the end of this section (§1-G1 … §1-V).

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

### §1-G1) `supabase/migrations/20260913_g1_growth_foundation.sql` — public shared results (G1)
- **Check first (expect `f`):** `SELECT to_regclass('public.shared_results') IS NOT NULL AS applied;`
- **Apply** the file (it has no BEGIN/COMMIT of its own — run it inside one).
- **Verify after (expect t, t, t, RLS t on both, 2 policies on shared_results, 0 on anon_identity_map):**
  ```sql
  SELECT to_regclass('public.shared_results') IS NOT NULL AS sr,
         to_regclass('public.anon_identity_map') IS NOT NULL AS aim,
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_shared_result_bump') AS fn,
         (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.shared_results')) AS sr_rls,
         (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.anon_identity_map')) AS aim_rls,
         (SELECT count(*) FROM pg_policies WHERE tablename='shared_results') AS sr_policies,
         (SELECT count(*) FROM pg_policies WHERE tablename='anon_identity_map') AS aim_policies;
  ```
- **Rollback:** `supabase/migrations/rollback/20260913_g1_growth_foundation_rollback.sql`
- Audit result 2026-09-24: before `f/f/f`; after `t/t/t`, RLS `t/t`, policies `2/0`; `POST /api/shared-results`
  went from **500** to **201**, `/r/<slug>`, its OG image, oEmbed, feed and sitemap all 200.

### §1-P1) `supabase/migrations/20260915_profile_public_presentation.sql` — `profiles.bio`, `profiles.cover_url`
- **Check first (expect `f`):** `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='bio') AS applied;`
- **Verify after:** same query → `t`, and the same for `cover_url`.
- **Rollback:** `supabase/migrations/rollback/20260915_profile_public_presentation_rollback.sql`
- Not a blocker (the profile API has a schema bridge), but until applied, users cannot set a cover.

### §1-G2) `supabase/migrations/20260918_g1b_share_ancestry.sql` — share ancestry (after §1-G1)
- **Check first (expect `f`):** `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_results' AND column_name='parent_id') AS applied;`
- **Verify after:** same → `t`; also `owner_is_anonymous` → `t`.
- **Rollback:** `supabase/migrations/rollback/20260918_g1b_share_ancestry_rollback.sql`

### §1-GR) `supabase/migrations/20260922_groups_avatar_url.sql` — `groups.avatar_url`
- **Check first (expect `f`):** `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='avatar_url') AS applied;`
- **Verify after:** same → `t`. Then `GET /api/group?id=<a real group>` must answer 200, not 404.
- **Rollback:** `supabase/migrations/rollback/20260922_groups_avatar_url_rollback.sql`

### §1-L1) `supabase/migrations/20260915b_review_likes_private.sql` — a person's liked collection is private
- Written 2026-09-15 (cool-vaughan snapshot 3fe8c12), parked by merge 1e7b77e together with the profile-v2
  UI ("NOT merged … Parked verbatim under docs/audit/overnight/stepC/profile-v2-notmerged/ — OPEN"); the
  privacy half is restored on its own (2026-09-25). Prod 09-17 snapshot: `"Anyone can read likes" … TO public USING (true)`.
- **Check first (expect 1 row = still open):** `SELECT policyname FROM pg_policies WHERE tablename='review_likes' AND cmd='SELECT';` → `Anyone can read likes`.
- **Apply immediately BEFORE the web deploy** — the new like-list route and both "hot places" panels call
  `review_likers()` / `hot_places_24h()`; without them the like list 500s. The OLD code keeps working
  degraded for the minutes in between (it then sees only the caller's own likes).
- **Verify after:** the query above → `review_likes_select_own`; `SELECT has_function_privilege('anon','public.review_likers(uuid,integer,timestamptz)','EXECUTE'), has_function_privilege('anon','public.hot_places_24h(integer)','EXECUTE');` → `t, t`;
  with ONLY the anon key `curl "$SUPABASE_URL/rest/v1/review_likes?select=user_id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` → `[]`.
- **Rollback (re-opens the leak):** re-create `"Anyone can read likes" FOR SELECT USING (true)` from `add_review_social.sql`.

### §1-S1) `supabase/migrations/20260904_group_read_boundary.sql` — groups / members readable only by participants (F-065)
- Recovered 2026-09-25 from `integration/v3-foundation` (`558ba49`), which never reached the shipping branch.
- **Check first (expect 2 rows = still open):** `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND policyname IN ('Anyone can read groups','Anyone can read group members');`
- **Apply AFTER the web deploy** — the new `GET /api/group` (link holder) and the join-cap count read through the
  service role keyed by the group id; the OLD code reads as the caller and would 404 a link holder / lose the
  10-member cap once the policies are gone.
- **Verify after:** the query above → 0 rows; `SELECT policyname FROM pg_policies WHERE tablename IN ('groups','group_members') AND cmd='SELECT';`
  → `groups_select_participant`, `group_members_select_participant`. Then, with ONLY the anon key:
  `curl "$SUPABASE_URL/rest/v1/group_members?select=group_id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` → `[]`.
- **Rollback (re-opens the leak — only if group sharing breaks):** re-create the two `USING (true)` policies from `add_groups.sql`.

### §1-D1) `supabase/migrations/20260911b_user_memory_auth_fk.sql` — account deletion removes AI memory (F-093)
- Recovered 2026-09-25 from `origin/claude/user-memory-auth-fk-f1z5nf` (`6964bfb`), found by branch-containment.
- **Check first:** `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id';` → `text` = not applied;
  `SELECT count(*) FROM public.user_memory m WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = m.user_id);` = the orphans it will remove (logged to `user_memory_fk_cleanup_log`).
- **Apply:** any time; the app reads/writes `user_memory` by `user.id` either way (verified on audit after the change: GET/PATCH /api/memory 200, upsert landed, RLS returns only the caller's row).
  It aborts and changes nothing on a non-UUID `user_id` or an unrecognised policy.
- **Verify after:** column `uuid`; `user_memory_user_id_fkey` ON DELETE CASCADE; policy `Users can manage own memory` present.
- **Rollback:** `supabase/migrations/rollback/20260911b_user_memory_auth_fk_rollback.sql`.

### §1-D2) `supabase/migrations/20260925_account_deletion_cascade_gaps.sql` — the two other stores (F-093)
- **Check first:** `SELECT conname FROM pg_constraint WHERE conname IN ('decision_evidence_owner_id_fkey','anon_chat_usage_user_id_fkey');` → 0 rows = not applied;
  orphans: `SELECT count(*) FROM public.decision_evidence d WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.owner_id);` (same for `anon_chat_usage.user_id`).
- **Apply after D1.** It deletes nothing. A WARNING naming a count means orphans exist: the cascade is already active for every future
  deletion, the constraint stays `NOT VALID`, and the Owner-run purge + VALIDATE in the migration header completes it (audit: 9 orphan rows of 5 deleted accounts).
- **Verify after (the end-to-end check used on audit, rolled back):** in one transaction insert a test `auth.users` row, give it a `user_memory` row, `decision_evidence_save()`, an `anon_chat_usage` row;
  `DELETE FROM auth.users` for it; count rows carrying its id in every table → 0; `ROLLBACK`. Script: `docs/uat/evidence/f093-2026-09-25/`.
- **Rollback:** `supabase/migrations/rollback/20260925_account_deletion_cascade_gaps_rollback.sql` (drops the two FKs only).

### §1-D3) `supabase/migrations/20260925b_decision_evidence_sweep.sql` — the TTL sweep (F-097) — ✅ OWNER APPROVED 2026-09-25
- **Check first:** `SELECT count(*) FILTER (WHERE expires_at < now()) AS expired, count(*) AS total FROM public.decision_evidence;`
  and `SELECT proname FROM pg_proc WHERE proname = 'decision_evidence_sweep';` → 0 rows = not applied.
- **Apply** (any time after D2): the file. Then **the one-off cleanup**, same session: `SELECT public.decision_evidence_sweep();`
  (returns the number deleted; bounded at 5000 per call — repeat while it returns 5000). It deletes only rows whose `expires_at` has passed.
- **If D2 left `decision_evidence_owner_id_fkey` NOT VALID** (orphans existed): after the sweep re-count orphans
  (`… WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.owner_id)`); at 0,
  `ALTER TABLE public.decision_evidence VALIDATE CONSTRAINT decision_evidence_owner_id_fkey;` (deletes nothing). On audit the sweep removed all 9 orphans (they were expired) and the constraint validated.
- **The daily job:** `/api/cron/decision-evidence-sweep` is in `vercel.json` (`15 18 * * *` = 01:15 VN) and needs `CRON_SECRET`
  (same as every cron). Verify once after deploy: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod-host>/api/cron/decision-evidence-sweep`
  → `{"ok":true,"deleted":N,"more":false}`. Without the secret → 401. Before D3 is applied → 500 `sweep_failed` (harmless; nothing deleted).
- **Verify after:** `SELECT has_function_privilege('authenticated','public.decision_evidence_sweep(integer)','EXECUTE');` → `f`; expired count → 0.
- **Rollback:** `supabase/migrations/rollback/20260925b_decision_evidence_sweep_rollback.sql` (drops the function; the cron then answers 500).
- Audit evidence: `docs/uat/evidence/f097-2026-09-25/audit-apply-and-one-off-sweep.log` (26 rows → 23 expired deleted, 3 live kept, orphans 9 → 0, FK validated).

### §1-D4) `supabase/migrations/20260925c_account_deletion_f096.sql` — what deleting an account takes with it (F-096) — ⚠️ OWNER APPROVES
- **Check first:** `SELECT conrelid::regclass, confdeltype FROM pg_constraint WHERE contype='f' AND confrelid='auth.users'::regclass AND conrelid IN ('public.shared_results'::regclass,'public.notifications'::regclass);` → `n` = not applied; `SELECT tgname FROM pg_trigger WHERE tgname='trg_enqueue_account_deletion';` → 0 rows.
- **Apply:** the file (any time after D1/D2). Nothing is deleted by applying it; it changes what the NEXT account deletion does.
- **Needs in production:** `CRON_SECRET` (as every cron) and the deployment's Workload Identity for the bucket — already what uploads use; the bridge account holds `roles/storage.objectUser` (list + delete).
- **Verify after:** both `confdeltype` = `c`; trigger present; `SELECT has_table_privilege('authenticated','public.account_deletion_jobs','SELECT')` → `f`. Then, with a synthetic test account (never a real one): upload an avatar, delete the account in the dashboard, run
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod-host>/api/cron/account-deletion-jobs` → `completed ≥ 1`, and the avatar URL answers 404/403.
- **Operator runbook:** `docs/ops/ACCOUNT-DELETION.md`; staff accounts: `docs/ops/STAFF-LEAVER-RUNBOOK.md`.
- **Rollback:** `supabase/migrations/rollback/20260925c_account_deletion_f096_rollback.sql` — drain the queue first (pending jobs are lost with the table).
- Audit evidence: `docs/uat/evidence/f096-2026-09-26/` (apply log; rolled-back E2E with synthetic users).

### §1-D5) `supabase/migrations/20260925d_audit_log_pii_retention.sql` — audit log without email; IP/UA 90 days; 12-month chain (F-096) — ⚠️ OWNER APPROVES
- **Check first:** `SELECT count(*) FROM fn_verify_audit_chain();` → must be 0 **before** applying (a chain that does not verify now would be reported by the prune later, not caused by it). `SELECT tgname FROM pg_trigger WHERE tgname='aaa_audit_log_pii';` → 0 rows = not applied.
- **Apply:** the file. Existing rows are NOT rewritten (rewriting a chained row is indistinguishable from tampering); they keep their email/IP/UA until they age out at 12 months.
- **Verify after:** `fn_verify_audit_chain()` still 0 rows; one admin action in the back office → its row has `actor_email` NULL, `ip_address` NULL, `metadata.client_digest` set, and one `audit_log_client` row.
- **Cron:** `/api/cron/audit-retention` (daily 19:00 UTC) — sweeps IP/UA at 90 days, prunes the chain at 12 months; a prefix that does not verify is refused (the cron answers 500 with `pruneError: 55000`) — investigate, never force.
- **Admin screens:** the recent-activity list and the audit API show "—" for the email of rows written after D5 (the actor id is still there).
- **Rollback:** `supabase/migrations/rollback/20260925d_audit_log_pii_retention_rollback.sql` — 🚨 not after a prune without exporting `audit_log_anchor` first (the restored verifier would report the pruned head).
- Audit evidence: `docs/uat/evidence/f096-2026-09-26/` (applied; chain 0 problems before and after, 28 rows untouched).

### §1-V) Already on prod — verify, do NOT re-apply
```sql
SELECT to_regclass('public.chat_messages') IS NOT NULL AS chat_phase1,
       to_regclass('public.chat_blocks')   IS NOT NULL AS chat_phase6,
       to_regclass('public.review_shares') IS NOT NULL AS review_shares;   -- expect t, t, t
```
If any is `f`, stop: the 09-17 snapshot no longer describes prod and this checklist must be re-derived.

### §1-✗) `20260922_music_soundhelix_attribution.sql` — SKIP on prod
It updates `music_tracks.license`/`source_url`, columns added by `add_music_attribution.sql`, which the
09-17 prod snapshot does not contain — the migration would error. Music is hidden and not launching (owner
decision 2026-09-24); leave both out of this release. (It is applied on the audit DB only.)

### 🚫 Do NOT apply to prod (demo/seed data)
- `supabase/migrations/20260705_seed_music_demo_catalog.sql` — replaceable demo catalog.
- `supabase/migrations/20260706c_repoint_music_audio_local.sql` — only repoints that demo data.

### 🎵 Music migrations — whose intent changed after Session A (reconciled 2026-09-24)
None of these change what to APPLY (the DB objects are the same); what changed is the *narrative*: they
back a **hidden but present** library, not a removed feature. The lockdown's mechanic is unaffected.
- `20260921_music_tracks_lockdown.sql` — **intent narrative changed.** Its own header still says "the web
  + Android UIs are removed." That is now stale for web: Session A restored the LIBRARY UI (the reuse UI
  stays removed). The mechanic is unchanged and still correct — it revokes anon/authenticated only, and
  the restored library reads via `service_role`, so the lockdown does not break it. Do NOT roll it back
  to "re-open" the library; the library never needed ordinary-role grants.
- `20260922_music_soundhelix_attribution.sql` — **NEW, added with the Session A restore** (post-lockdown).
  It adds attribution for the demo library tracks. Intent: support the (now hidden) library. Demo/seed
  adjacent — treat like the seed rows above unless the library is ever launched.
- `20260704_add_music_module.sql`, `20260706_add_music_saved_and_type.sql`, `20260711_music_ugc_combined.sql`,
  `20260818b_music_tracks_publication_boundary.sql`, `add_original_sound_ugc` — schema unchanged; they now
  back a hidden library rather than a "removed" feature. No action.

---

## 2. Order relative to the web / Android deploy

Apply **before** the code deploy (new code depends on the schema, or the migration is a safe no-risk
security change to land early):
- **§1-G1 + §1-G2 G1 shared results** — REQUIRED before deploy. `POST /api/shared-results` (the "Public
  link" share on web and Android) inserts into `shared_results` with the ancestry columns; without them every
  public-link share 500s (measured on audit 2026-09-24).
- **#1 plan_shares** — REQUIRED before deploy. `/api/plans/share` inserts into it; without the table
  every share 500s.
- **§1-GR groups.avatar_url** — REQUIRED before deploy. `GET /api/group` selects the column; without it every
  group page answers 404.
- **§1-P1 profile presentation** — before deploy (recommended); the code degrades without it.
- **§1-L1 review_likes private** — immediately before deploy (added 2026-09-25): the new like-list route
  and hot-places panels call its two functions.
- **#2 + #3 commerce** — before deploy **if** this release's code reads the commerce feed; otherwise
  any time. Safe to apply before regardless.
- **#4 F-028** — before deploy, so the client's age-correction flow matches the new RPC behaviour.
- **#5 F-032** — any time; the `/api/admin/rbac/roles` route works with the old or new body (it calls
  via the service-role client, which both bodies accept). Recommended **before** deploy since it is a
  security hardening.

Safe **with or after** the deploy:
- **#6 music_tracks_lockdown** — the lockdown revokes ONLY anon/authenticated (ordinary-role) grants on
  `music_tracks`; it leaves `service_role` untouched. Reconciled with Session A (2026-09-24): the
  restored web library reads `music_tracks` **through the service-role client** (`musicRepository`,
  server-side, behind `/api/music/*` GET), so the lockdown does not break it — and with `SHOW_MUSIC=false`
  no UI reaches that path anyway. No client-side (anon/authenticated) code reads the table any more, and
  Android has no music code, so this degrades gracefully whichever side lands first. Recommended **with
  or just after** the deploy. (Earlier drafts said "the NEW code never reads `music_tracks`" — that was
  true only while the library was removed; Session A restored the service-role read.)

- **#7 user_events GA4 event types** and **#8 user_events shopping_search_click** — before OR with the
  deploy where the constraint exists (so the new client `track()` rows are not dropped once the new code
  ships). Both are NO-OPs on prod (no constraint), so on prod their ordering does not matter.

Strictly **after** the deploy (added 2026-09-25):
- **§1-S1 group read boundary** — right after the web deploy is live (minutes, not days: until it lands
  the group tables stay readable with the public anon key). Before the deploy it would break the OLD
  `GET /api/group` for link holders and remove the join cap.

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

### 4a. Behaviour flags — production must match what Session C tested (2026-09-22)

Everything below changes what the AI or the product DOES. The whole Phase 7 / Session C golden set
was replayed with the **"UAT value"** column; production must resolve to the **"Prod must be"**
column or it is running an untested combination. "Code default" is what the flag resolves to when
the variable is unset in the environment. Read sites: `src/lib/config/product.ts`,
`src/lib/ai/llm/registry.ts`, `src/lib/ai/tools/placesProvider.ts`.

| Flag | Kind | Code default | UAT value | Prod must be | What it gates |
|---|---|---|---|---|---|
| `LLM_PROVIDER` | env | `claude` | unset (claude) | **unset** | The only adapter tested. |
| `LLM_FAST_MODEL` / `LLM_SMART_MODEL` / `LLM_PLANNING_MODEL` / `LLM_VISION_MODEL` | env | all four → `claude-haiku-4-5-20251001` (one model on purpose: shared prompt cache) | unset | **unset** — every Session C measurement is Haiku 4.5; setting a different model per role changes tool behaviour, planning compliance and cost, and voids the golden results | Model per role |
| `PLACES_PROVIDER` | env | `serper` (→ OSM fallback) | unset (serper) | **unset / `serper`**. `osm` = no-paid-provider emergency mode (no photos, no bands); `google` was removed 2026-09-21 (not available for Vietnam) and now falls back to serper | Place/discovery provider for all five domains |
| `PLACE_GUARD_ATTRIBUTION_V2` | env | **ON since 184738b** (`0`/`false` rolls back) | replayed both ways; final decision = ON (`golden/final2-v2`) | **unset (ON)** | Identity-first attribution in the place-claim guard, L5 number identity, coherence pass, the G1b evidence-only fallback sentence |
| `CONSULTATIVE_V1` | env | OFF | OFF | **unset (OFF)** — V1 was never part of this UAT; turning it on switches the pipeline (situation frame, presearch, shortlist prompt, prose-shape guard, memory scoping) to a path the golden set has not measured | Consultative V1 |
| `SNIPPET_PRICE_GUARD_V2` | env | OFF | OFF | **unset (OFF)** to match the test; see the caveat row below before choosing ON | Snippet-price guard reads the row's own price band as evidence |
| `MEDIA_PLACEMENT_V2` | env | OFF | OFF (web only tested; web is unaffected either way) | **unset (OFF)** | Where inline photo/link blocks land on Android/iOS replies (web cards own enrichment) |
| `CCP_ENABLED` | code const | `true` | true | (const) | Commerce links / actions on cards |
| `CCP_MERCHANT_PAGE_READ_ENABLED` | code const | `false` | false | (const) | Fetching merchant pages |
| `CCP_FEED_DISPLAY_ENABLED` / `CCP_FEED_INGEST_ENABLED` / `CCP_AFFILIATE_WRAPPING_ENABLED` | code const | `false` / `true` / `true` | same | (const) | Commerce feed display / ingest / affiliate wrapping (wrapping is a no-op without `ACCESSTRADE_PUBLISHER_ID`) |
| `EMIT_PLACES_ANNOTATION` / `EMIT_TAPPY_PLACES` / `SERVER_AUTHORED_CTA` | code const | `true` / `false` / `false` | same | (const) | Place card as a stream annotation (web); durable `[TAPPY_PLACES]` marker (off); server-authored CTA block (off — model writes CTA_BUTTONS) |
| `SHOW_SCAM_SHIELD` / `SHOW_PRO_UPGRADE` / `SHOW_MARKETPLACE` / `SHOW_WALLET` / `SHOW_APP_CONNECTIONS` | code const | `true` / `false` / `false` / `false` / `false` | same | (const) | Navigation surfaces |
| `FREE_DAILY_LIMIT` / `ANON_LIFETIME_LIMIT` (product.ts) / `PRO_DAILY_CHAT_CAP` (security/chatCaps.ts) | code const | 15 / 5 / 300 | same (golden ran on the Pro account) | (const) | AI question quotas |
| `SERPER_DAILY_CREDIT_CEILING` (**REQUIRED — set explicitly**) / `SERPER_OUTAGE_INSTANCE_CEILING` | env | 15,000 credits per VN day (≈ 3,750 food place turns — **measured 4 credits per food turn** (`/maps` 3 + `/search` 1, the `credits` field Serper returns), 9/9 turns, 2026-09-24, `docs/uat/evidence/serper-credits-per-turn-2026-09-24.json`; the old "≈ 2,500" assumed 6 per turn. Turns that also call `/images` or `/shopping` cost more — not measured) / 1,500 per instance while the KV store is down | unset (defaults) | **set the daily ceiling to the spend you accept** (e.g. `15000`); keep the outage ceiling default. Needs `KV_REST_API_URL` for the count to be global — without KV it is per instance and NOT a real cap (`serperClient.ts`) | Serper credit breakers — see §4c for what the user sees when it trips |
| `BACKOFFICE_ENABLED` | config (`adminConfig`) | `true` | unset (true) | true | Back office |
| `CONTENT_SAFETY_GATE_ENABLED` / `CONTENT_SAFETY_SCHEMA_MIGRATED` | env | `false` / `false` | unset | **unset** until the safety schema is applied to prod (a `true` without the migration fails publication reads) | Content-safety gate |
| `MESSAGE_NOTIFICATIONS_ENABLED`, `MARKETING_SENDING_ENABLED`, `CONTROLLER_ORG_MEMBERSHIP_ENABLED`, `GCP_LOGGING_ENABLED` | env | all `false` | unset | conscious choice each; none affects AI answers | Notifications / marketing sends / org membership / cloud logging |
| `TAPPY_MEASURE`, `TAPPY_FENCE_PROBE`, `AUDIT_*`, `CCP_UAT`, `CCP_VERIFY`, `CCP_EVENT_LOG`, `C9B_*`, `MEASURE_OUT` | env | off | unset | **must be unset** — measurement / audit harness switches only | Harness |

**Guards and features that are silently inactive under a flag combination** (found while
auditing; each is either fixed or must be consciously accepted):

| Path | Active only when | State after Session C |
|---|---|---|
| `guardBudgetFitInText` ("vừa vặn ngân sách" overclaim cut) | read its budget from `collector.consultativeV1.budget` → **inert whenever `CONSULTATIVE_V1` is off**, i.e. on every server so far | **FIXED (1b7bd67)**: reads the thread's stated budget when V1 is off; also cuts a fit phrase about an unpriced row |
| Search-now directive / presearch (`deriveSearchNow`, `planPresearch`) — the deterministic "call the tool with THIS query now" | `CONSULTATIVE_V1=1` | Inactive in prod (V1 off). Compensated by the prompt (refinement rule, planning defaults) — the prompt-only paths are the ones that regress ~1 run in 4 (F-043) |
| `consultative_v1_pick_backstop` / `shopping_none` backstop (re-insert an evidence-only pick sentence when guards emptied the reply) | `CONSULTATIVE_V1=1` | Inactive in prod. The v2 attribution default + review-count trim (e9fe302) reduce how often a pick sentence is lost; a fully emptied reply still has no backstop with V1 off |
| Memory scoping by decision-frame domain (`buildMemoryBlock … domains`) | `CONSULTATIVE_V1=1` | Inactive in prod — the unscoped memory block is what was tested |
| G1b evidence-only fallback, L5 number identity, coherence pass in the place-claim guard | `PLACE_GUARD_ATTRIBUTION_V2` on | **Active** (default ON since 184738b) |
| Snippet-price guard reading the venue's OWN band as evidence | `SNIPPET_PRICE_GUARD_V2=1` | **Inactive** (OFF, as tested). Caveat: with v1 the guard can delete a price sentence the model copied from the card band (measured 13/17 on the 2026-09-17 capture); the card still shows the band. Turning it ON was not replayed — do not flip without a golden pass |
| Inline media placement fix (`MEDIA_PLACEMENT_V2`) | flag on, native surfaces only | Inactive; web unaffected (card owns enrichment). Android/iOS were not part of Session C |
| Place cards (`tappy.places.v1` annotation) | `EMIT_PLACES_ANNOTATION` only — emitted to EVERY client, no header needed (verified 2026-09-22: same 8-item annotation with `x-tappy-surface: android` and with no header at all, `docs/uat/evidence/android-chat-probe-*.txt`) | **Android renders them** (Pixel_8_uat, `android-place-cards-2026-09-22.png`) and a card action fires `recommendation_click` (`android-recommendation-click-logcat.txt`, app log + Firebase `FA-SVC`). The earlier "Android sends no header" note was stale: `RealChatRepository.kt` sends `android` since 2026-09-12 |
| Prose that does not repeat the card (`buildRenderedDecisionBlock`), no inline photo/link block, no batch TikTok line, `google_maps_search` trimmed from the model copy | `x-tappy-surface` ∈ {`web`, `android`} (`decisionSurface.ts`) | Web + Android get it. **iOS sends no header** (0 hits in `ios/`) and older builds/scripts too → they get the prose WITH the injected photo/link block (their only channel for it) and a prose that may repeat card facts; the annotation still arrives, so an iOS build that parses it (`PlacesModels.swift` does) shows the card AND the inline media |
| Commerce platform tag (`commercePlatform`) | header ∈ {web, android, ios} | Telemetry only in the CCP request (`ccp/index.ts`); links are the same for every platform |
| Risk-first backstop for second-hand purchase advice (`riskBackstop.ts`) | `RISK_BACKSTOP` (see 4b) | **Active by default (live mode)** since the owner approved the block text 2026-09-22; `RISK_BACKSTOP=0` disables |

### 4b. `RISK_BACKSTOP` — the F-043 deterministic backstop (block text approved by the owner 2026-09-22; **default ON, live mode**)

`src/lib/ai/riskBackstop.ts`. On a high-value second-hand purchase question (thread mentions a
second-hand / marketplace cue + a purchase + a high-value category + "what to check / should I / risks"),
it reads the FINAL reply and, for each of the four risk topics the reply does not cover (ownership /
lock-and-liens / transaction fraud / safe payment), appends the fixed line for that topic; it appends
the fixed scam-checker pointer when the reply has none; it removes a parenthetical carrying an
unsourced numeric threshold and hedges an inline one. No model call; nothing generated; the pointer
names a **message, link or QR code only** (never a phone number or bank account — `riskBackstop.test.ts`
pins this).

| Value | Behaviour | Measured |
|---|---|---|
| `0` / `false` / `off` | OFF | — |
| **unset** / `1` / `true` / `live` | **code default.** append-only: the model text streams live, the block (+ hedge) arrives as the last frame; an inline threshold can only be hedged | 5 × (T4 + G5a–d) = 25 replies: prompt alone complete 22/25, backstop fired 12/25 (3 topic/pointer appends, 9 hedges), final complete **25/25**, unhedged thresholds after **0/25** (`docs/uat/evidence/golden/rb1..rb5`, `scripts/audit/riskBackstopReport.mjs`) |
| `buffer` | also buffers the turn: threshold parentheticals are REMOVED and the block sits before the markers; the user waits for the whole reply (~10 s) | unit-tested on the stream (`riskBackstopStream.test.ts`); not replayed live |

**Production: leave unset (= live).** Roll back with `RISK_BACKSTOP=0` — no redeploy.

### 4c. What the app does when `SERPER_DAILY_CREDIT_CEILING` is hit

`src/lib/ai/tools/serperClient.ts` is the one door to Serper (maps 3 credits, search/shopping/images 1). Credits are
added to the shared daily counter BEFORE the call; at 80 % one `tappyai_alert serper_daily_ceiling_80pct` warning is
logged per instance per day; over the ceiling every further Serper call is **refused inside the server** (`serperPost`
returns `null`, one `tappyai_alert serper_daily_ceiling` error per instance per day) and the request continues:

1. **Place search** falls through to OpenStreetMap (`osm_fallback_used`): the user still gets places, without ratings,
   price bands or photos, and the reply says the data is from OpenStreetMap with a Google Maps link.
2. **OSM empty or down too**: the tool returns `results: []` + `google_maps_search` + `no_results_instruction`; the
   prompt rule (i) makes the model say plainly nothing was found and offer the Maps link — **no raw error, no stack
   trace reaches the model or the user** (`serperCeilingDegrade.test.ts` pins this with Serper refused and every fetch
   rejecting: the result carries no "error", "serper" or "ceiling" text).
3. **Photos / web / shopping enrichment** simply do not run for the rest of the day (cards render without images;
   shopping answers from the model's knowledge with the honesty rules).
4. The counter resets at the VN midnight (`vnToday`). With the KV store down, each instance is held to
   `SERPER_OUTAGE_INSTANCE_CEILING` (1,500) instead, and `serper_ceiling_store_down` is logged.

Watch the two alerts in the logs; the 80 % warning is the moment to raise the ceiling or investigate abuse.

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
