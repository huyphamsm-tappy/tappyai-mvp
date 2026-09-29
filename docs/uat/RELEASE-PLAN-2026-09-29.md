# RELEASE PLAN — production release 2026-09-29 (PREPARED, NOT EXECUTED)

Prepared 2026-09-28 from `C:/wtrel` (`release/rc-merge-main-2026-09-29` → `origin/rc/web-uat`, HEAD `b08561d` at
time of writing; 612 commits ahead of `origin/main` `f42ae4b`). Nothing in this file has been run against
production. Every production write below is done by the **lead or the owner at release time**, in the order given.

Sources: `DEPLOY-CHECKLIST.md` (§0–§6), `RELEASE-PROGRESS.md`, `PRIVACY-REVIEW-G1.md`, `UAT-MEDIA-INFRA.md`,
`ANDROID-REQUESTS.md`, `git diff --name-status origin/main HEAD -- supabase/migrations`, `vercel env ls production|preview`
(names only).

**Owner decisions applied here (2026-09-28/29):** D1, D2, D4 **DEFERRED** (`ACCOUNT_SELF_DELETE_ENABLED` stays off);
D3, D5 **APPLY** (D5 is required — `src/lib/admin/audit.ts:90` writes `actor_email: null`); S1 **after** the web
deploy; H1 + M1 **only after** the prod smoke test passes; `music_soundhelix_attribution` **SKIP**;
`20260927100000_commerce_providers_portal_state` **APPLY right after #2/#3**; `SERPER_DAILY_CREDIT_CEILING=15000`;
Android versionCode 10 / versionName 1.0.0; `SHOW_PUBLIC_SHARE` default on (leave unset).

**Tools (new, `scripts/release/`, none of them run yet):**
| Script | Purpose |
|---|---|
| `backup-prod.ps1` | §0.2 dump (docker `postgres:17`, pgpass from `D:\TappyAI-backups\pgpass`, host from `pghost.txt`) to `D:\TappyAI-backups\prod-<stamp>\`, then §0.3 (a)(b)(c) [+ (d) with `-RestoreCheck`]. Writes `CHECKS-PASSED.json` only when all pass; exits 1 loudly otherwise. |
| `apply-migration.sh` | `psql -X -1 -v ON_ERROR_STOP=1` for one file. Refuses without `--i-have-a-valid-backup <dir>` whose marker + dump hash verify (≤12 h old; ≤2 h for H1/M1). Refuses SKIP/DEFER/VERIFY-ONLY/unlisted files; S1 needs `--after-web-deploy`, H1/M1 need `--after-smoke-passed`. `--check <file>` = read-only probe (session `SET default_transaction_read_only = on`). Logs to `<backup>/applied/`, ledger `<backup>/APPLIED.tsv`. |
| `sql/precheck-all.sql` | Every check query of §1 in one read-only file (run before the first apply and at the end). |
| `sql/d3-one-off-sweep.sql` | The §1-D3 one-off `decision_evidence_sweep()` call. |
| `smoke-prod.mjs` | Automated signed-out §5 smoke on `https://www.tappyai.com` (no bypass header). |
| `build-aab.sh <sha>` | Signed release AAB from a fresh `git worktree add --detach C:/wtbuild-<sha7>`; verifies signature + BuildConfig. |

---

## 1. Migrations, final order

**Delta:** 26 migration files are on this branch and not on `origin/main` (+ 21 rollback files). Six more files show
as `M` in the diff (`20260817_content_safety_gate`, `20260820_m01_daily_snapshots`, `20260820_m04_cohort_metrics`,
`20260821_m08_user_notes`, `20260821_m09_moderation_queue`, `add_user_language_preference`): **comment-only changes**
(checked: no non-comment line differs) — already on prod, nothing to apply.

**Not covered by DEPLOY-CHECKLIST (flagged):**
1. `20260927100000_commerce_providers_portal_state.sql` — not in the checklist at all (only in
   `docs/commerce/AFFILIATE_STATUS.md:94`). Owner decision: APPLY right after #2/#3. Row UPDATEs only.
2. `rollback/20260911_user_memory_discovery_city_rollback.sql` — a rollback for `20260911_user_memory_discovery_city.sql`,
   which is already on `origin/main` (not in this delta). Nothing to do; do not run it.
3. `scripts/release/sql/d3-one-off-sweep.sql` — not a migration; the checklist's §1-D3 one-off call, made a file so the
   script's gates and log cover it.

Run everything with `apply-migration.sh <file> --i-have-a-valid-backup <dir>` from Git Bash in `C:/wtrel`
(paths below are relative to `supabase/migrations/`). "Check" = run first, apply only if it shows *not applied*;
all checks are also in `scripts/release/sql/precheck-all.sql`.

| # | File | Action | When | Check (read-only; before → after) | Rollback | Reason |
|---|---|---|---|---|---|---|
| 0 | — | VERIFY | before anything | `bash scripts/release/apply-migration.sh --check scripts/release/sql/precheck-all.sql` → save output | — | Snapshot of prod state; §1-V must be `t,t,t` or STOP |
| V1 | `20260905_chat_messaging_phase1` | **VERIFY-ONLY** | step 0 | `to_regclass('public.chat_messages') IS NOT NULL` → `t` | (`rollback/20260905_20260906_chat_messaging_rollback.sql` — never run) | Already on prod (09-17 snapshot). If `f`: stop, re-derive the checklist |
| V2 | `20260906_phase6_messenger_reachability` | **VERIFY-ONLY** | step 0 | `to_regclass('public.chat_blocks') IS NOT NULL` → `t` | (same file) | Already on prod |
| V3 | `20260915_review_shares` | **VERIFY-ONLY** | step 0 | `to_regclass('public.review_shares') IS NOT NULL` → `t` | (`rollback/20260915_review_shares_rollback.sql` — never run) | Already on prod |
| 1 | `20260913_g1_growth_foundation` | **APPLY** | before deploy | `to_regclass('public.shared_results') IS NOT NULL` f → t; `anon_identity_map` t; `fn_shared_result_bump` t; RLS t/t; policies 2/0 | `rollback/20260913_g1_growth_foundation_rollback.sql` | "Public link" share (web + Android) 500s without `shared_results` |
| 2 | `20260913_plan_shares` | **APPLY** | before deploy | `to_regclass('public.plan_shares') IS NOT NULL` f → t; 3 policies; `plan_share_public` t | `rollback/20260913_plan_shares_rollback.sql` | Every plan share 500s without it (prod has no `/api/plans/share` today) |
| 3 | `20260915_profile_public_presentation` | **APPLY** | before deploy | `profiles.bio` / `cover_url` exist: f,f → t,t | `rollback/20260915_profile_public_presentation_rollback.sql` | Cover/bio; API degrades without it |
| 4 | `20260918_g1b_share_ancestry` | **APPLY** | before deploy, after #1 | `shared_results.parent_id`, `owner_is_anonymous` f → t,t | `rollback/20260918_g1b_share_ancestry_rollback.sql` | Share creation writes these columns |
| 5 | `20260920100000_commerce_providers` | **VERIFY-ONLY** (already on prod since 2026-09-27, AFFILIATE_STATUS §0) | step 0 (pre-check) | `to_regclass('public.commerce_providers') IS NOT NULL` → expect **t** (already applied). `f` = the 27/09 apply is missing → STOP and ask Huy (then it becomes APPLY) | none (additive): `DROP TABLE public.commerce_providers CASCADE; DROP FUNCTION IF EXISTS public.commerce_providers_touch();` | Runtime provider registry; feed rows key on it |
| 6 | `20260920110000_commerce_feed_items` | **APPLY** | before deploy, after #5 | `commerce_feed_items`, `commerce_feed_runs` f,f → t,t | none (additive): `DROP TABLE public.commerce_feed_items, public.commerce_feed_runs;` (before #5's drop) | Feed ingest target (buy buttons, §6 checklist) |
| 7 | `20260927100000_commerce_providers_portal_state` ⚑ | **VERIFY-ONLY** (already on prod since 2026-09-27, AFFILIATE_STATUS §0) | step 0 (pre-check) | `select provider_id … where deeplink_enabled` → expect **7 rows** (cellphones, klook, lazada, traveloka, tripcom, vexere, vietnamairlines). Anything else → STOP and ask Huy; never re-run the file blindly (it is row UPDATEs of the portal state) | none (row UPDATEs only; undo = rollback of #5, or re-apply the seed values of `20260920100000` for lazada/vexere/traveloka/vietnamairlines/tiktokshop/shopee/dmx) | ACCESSTRADE portal state verified 27 Sep; **not in DEPLOY-CHECKLIST** |
| 8 | `20260920_f028_dob_self_correct_while_ineligible` | **APPLY** | before deploy | `prosrc ILIKE '%age(CURRENT_DATE, v_existing%'` on `set_user_date_of_birth` f → t | `rollback/20260920_f028_dob_self_correct_while_ineligible_rollback.sql` | Age-correction flow matches the new client |
| 9 | `20260921_f032_admin_role_actor_from_authuid` | **APPLY** | before deploy | `body_ok` f → t, `auth_can_exec` f | `rollback/20260921_f032_admin_role_actor_from_authuid_rollback.sql` | Security hardening of admin-role RPCs |
| 10 | `20260921_user_events_ga4_event_types` | **APPLY** (no-op on prod) | before deploy | constraint query → 0 rows on prod (no-op expected) | `rollback/20260921_user_events_ga4_event_types_rollback.sql` | Conditional; widens only an existing constraint |
| 11 | `20260921_user_events_shopping_search_event` | **APPLY** (no-op on prod) | before deploy | as #10 | `rollback/20260921_user_events_shopping_search_event_rollback.sql` | as #10 |
| 12 | `20260922_groups_avatar_url` | **APPLY** | before deploy | `groups.avatar_url` f → t | `rollback/20260922_groups_avatar_url_rollback.sql` | `GET /api/group` selects it; every group 404s without it |
| 13 | `20260925b_decision_evidence_sweep` (D3) | **APPLY** | before deploy | `decision_evidence_sweep` 0 rows → 1; after: `has_function_privilege('authenticated','public.decision_evidence_sweep(integer)','EXECUTE')` f | `rollback/20260925b_decision_evidence_sweep_rollback.sql` | Owner-approved retention; the daily cron answers 500 until applied |
| 13b | `scripts/release/sql/d3-one-off-sweep.sql` | **APPLY** | right after #13 (repeat while it returns 5000) | `count(*) FILTER (WHERE expires_at < now())` → 0 | none (deleted rows are in the backup) | One-off cleanup. **Skip the checklist's `VALIDATE CONSTRAINT` step** — that FK is D2, deferred |
| 14 | `20260925d_audit_log_pii_retention` (D5) | **APPLY** | before deploy | pre: `count(*) FROM fn_verify_audit_chain()` **must be 0** (else STOP); trigger `aaa_audit_log_pii` 0 → 1 row; `audit_log.actor_email` nullable NO → YES | `rollback/20260925d_audit_log_pii_retention_rollback.sql` (🚨 not after a prune without exporting `audit_log_anchor`) | **Required before the deploy**: new code inserts `actor_email = null`; on the old schema (NOT NULL) every audited admin action fails |
| 15 | `20260915b_review_likes_private` (L1) | **APPLY** | **last before deploy** (minutes before) | `policyname` on `review_likes` SELECT: `Anyone can read likes` → `review_likes_select_own`; `review_likers`/`hot_places_24h` exist and anon can EXECUTE | none on disk — re-create `"Anyone can read likes" FOR SELECT USING (true)` from `add_review_social.sql` (re-opens the leak) | Privacy (anyone lists anyone's likes); new like-list route calls its functions |
| — | **WEB DEPLOY** (§4 step 7) | | | | | |
| 16 | `20260904_group_read_boundary` (S1) | **AFTER-DEPLOY** | minutes after `/api/version` = release SHA; `--after-web-deploy` | 2 rows (`Anyone can read groups` / `… group members`) → 0 rows; SELECT policies → `groups_select_participant`, `group_members_select_participant` | none on disk — re-create the two `USING (true)` policies from `add_groups.sql` (re-opens the leak) | Security F-065; before the deploy it would break the OLD `GET /api/group` |
| 17 | `20260921_music_tracks_lockdown` | **APPLY** | with S1, after deploy | policies 4 → 0; `anon_read` t → f; `svc_read` t; row count unchanged | `rollback/20260921_music_tracks_lockdown_rollback.sql` | Revokes anon/authenticated only; new code reads via service role (checklist §2: "with or just after") |
| — | **PROD SMOKE (§5a + §5b) must pass**, then a **fresh** `backup-prod.ps1 -Label pre-sec` | | | | | |
| 18 | `20260927_owner_update_column_privileges` (H1) | **AFTER-SMOKE** | after smoke + fresh backup; `--after-smoke-passed` | pre-flight: all 6 counter fns `prosecdef = t`; `has_column_privilege('authenticated','public.reviews','publication_state','UPDATE')` t → f; `profiles.onboarded` UPDATE t → f; `reviews.is_hidden` UPDATE stays t | `rollback/20260927_owner_update_column_privileges_rollback.sql` | Security H1 (column-level UPDATE). Aborts by itself if a counter fn is INVOKER — then stop, do not force |
| 19 | `20260928_revoke_reviews_insert` (M1) | **AFTER-SMOKE** | right after #18 | `has_table_privilege('authenticated','public.reviews','INSERT')` t → f (anon t → f) | `rollback/20260928_revoke_reviews_insert_rollback.sql` (roll back #19 before #18) | Security M1; applied early it breaks every review on the OLD code |
| — | re-run §5b signed-in smoke + like/save/comment + name/bio/avatar/cover | | | | | |
| ✗ | `20260922_music_soundhelix_attribution` | **SKIP** | never | `music_tracks.license` column → f on prod (the file would error) | none | Needs `add_music_attribution.sql`, absent on prod; music hidden |
| D1 | `20260911b_user_memory_auth_fk` | **DEFER** | not this release | `user_memory.user_id` data_type → `text` (stays) | `rollback/20260911b_user_memory_auth_fk_rollback.sql` | Owner deferred; self-delete stays off |
| D2 | `20260925_account_deletion_cascade_gaps` | **DEFER** | not this release | `decision_evidence_owner_id_fkey` / `anon_chat_usage_user_id_fkey` → 0 rows (stays) | `rollback/20260925_account_deletion_cascade_gaps_rollback.sql` | Owner deferred |
| D4 | `20260925c_account_deletion_f096` | **DEFER** | not this release | `confdeltype` `n`; trigger `trg_enqueue_account_deletion` 0 rows (stays) | `rollback/20260925c_account_deletion_f096_rollback.sql` | Owner deferred. Consequence: the daily `/api/cron/account-deletion-jobs` answers 500 `deletion_jobs_failed` (harmless, noisy) |

**Rollback order if the release must be reverted:** reverse of what was applied, only what was applied:
19 → 18 → 17 → 16 → (redeploy previous production) → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7/6/5 (drops) → 4 → 3 → 2 → 1.
Each via `apply-migration.sh supabase/migrations/rollback/<file> --rollback --i-have-a-valid-backup <dir>`.
Rows lost to #13b come back only from the dump (DEPLOY-CHECKLIST §0.4).

---

## 2. Production env gap

Method: `vercel env ls production` / `vercel env ls preview` (names only; 80 / 71 names) compared with every name the
code on this branch reads (`process.env.X`, `env.X` / `env['X']` in helpers, and names held in constants such as
`ZALO_VERIFY_URL_ENV`) — 94 direct names + constant-held ones under `src/`.

### 2a. Set on Preview but missing on Production — do **NOT** copy
| Name | Why it must stay Preview-only |
|---|---|
| `GCS_MEDIA_BUCKET` | Preview = `tappyai-media-uat`. Production omits it → code default `tappyai-media-prod` (`src/lib/media/index.ts:83`, `trustedHosts.ts:37`). Copying it would send prod uploads to the UAT bucket, and the prod WIF identity has no access there → every upload fails. |
| `GCP_MEDIA_SERVICE_ACCOUNT` | Preview = `tappyai-media-uat@…`. Production default = `tappyai-media-bridge@…` (`index.ts:91`). The UAT SA only trusts the `vercel-oidc-uat` pool with the `environment:preview` subject → prod token exchange would be refused. |

`GCP_WIF_POOL`, `GCP_WIF_PROVIDER`, `GCP_PROJECT_NUMBER` exist on **both** as separate records (UAT-MEDIA-INFRA added
the Preview ones). Production must keep its own (`vercel-oidc` / `vercel` / `1023373437508`, = code defaults). The
lead should eyeball the three Production values in the dashboard (not the CLI) — a `-uat` value there breaks uploads.

### 2b. Missing on both, but required by the checklist / owner decision
| Name | Set to | What breaks without it |
|---|---|---|
| `SERPER_DAILY_CREDIT_CEILING` | `15000` (owner) | Code default is also 15,000 (`serperClient.ts:24`), but §4a marks it REQUIRED-explicit so the cap is visible and deliberate. Without KV it would be per-instance; KV is set on prod. |
| `ACCESSTRADE_API_KEY` | owner (§3a) | `/api/cron/feed-ingest` → `blocked_no_credentials`; `commerce_feed_items` stays empty → no product-depth buy buttons from the feed (search-fallback chips still show). |
| `ACCESSTRADE_FEED_ENDPOINT` | `https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv` (template from `feedIngest.ts:11`; owner confirms) | same as above — either missing blocks ingest. Host must be `api.accesstrade.vn` (`ccp/feeds/source.ts:19`). |

### 2c. Present on Production with a value that must be checked/changed before the deploy
| Name | Action | Why |
|---|---|---|
| `ACCOUNT_SELF_DELETE_ENABLED` | 🚨 **set it explicitly to `false` on Production at the deploy (owner 2026-09-29 — not removed).** `vercel env ls production` shows it as a plain (non-sensitive) variable created ~6 h before this check, and its listed value is `true`. | Owner deferred D1/D2/D4 and wants the flag off. Current prod code (`origin/main`) has no self-delete route, so it is inert **today**; the release code reads it (`src/lib/account/selfDelete.ts:21`) → the in-app "Xóa tài khoản" button would go live on web and Android deleting accounts while AI memory, share pages, notifications and uploads survive. Preview never had it (UAT tested flag-off). |
| `PLACES_PROVIDER` | confirm value is `serper` or remove | §4a: prod must be unset/`serper`; `osm` = degraded emergency mode; `google` silently falls back to serper. Set on both envs; value not inspected here. |
| `CONTENT_SAFETY_GATE_ENABLED`, `CONTENT_SAFETY_SCHEMA_MIGRATED` | confirm values | Exist on prod only. §4a says "unset until the safety schema is applied"; the checklist header says that schema IS on prod. Whatever they are today, they are what production runs now — just don't change them in this release without a test. |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | confirm `https://www.tappyai.com` | §4e(c): share links, OG `og:url`, Android origin. |
| `MEDIA_PROVIDER` | leave (inert) | Code no longer reads a provider switch (`activeProviderId` returns `gcs`). |

### 2d. Read by the code, missing on both — same as what UAT tested; no action for launch
`SHOW_PUBLIC_SHARE` (unset = ON, owner) · `RISK_BACKSTOP` (unset = live) · `CONSULTATIVE_V1` (unset = ON) ·
`PLACE_GUARD_ATTRIBUTION_V2` (unset = ON) · `MEDIA_PLACEMENT_V2` (unset = OFF, as tested) · ~~`SNIPPET_PRICE_GUARD_V2`~~ → UAT runs it ON: see §2g (ADD `1` on Production) ·
`LLM_PROVIDER`, `LLM_FAST/SMART/PLANNING/VISION_MODEL` (must stay unset) · `SERPER_OUTAGE_INSTANCE_CEILING` (default 1,500) ·
`MESSAGE_NOTIFICATIONS_ENABLED`, `GCP_LOGGING_*` (off) · harness switches `AUDIT_*`, `CCP_EVENT_LOG` (must stay unset —
confirmed absent) · `UPSTASH_REDIS_REST_*` (fallback for KV, KV is set).
Optional features that stay off: `INDEXNOW_KEY` (no IndexNow pings) · `ANDROID_APP_LINKS_SHA256` /
`IOS_UNIVERSAL_LINKS_APP_ID` (`/.well-known/*` 404 → links open in the browser, not the app) · `GOOGLE_WEB_RISK_API_KEY`
+ `GOOGLE_CLOUD_PROJECT` (Scam Shield runs without the Web Risk provider) · `TRAVELPAYOUTS_TOKEN` (no flight-price
lookup; the AI gives search links) · `ZALO_IDENTITY_SECRET`, `NEXT_PUBLIC_ZALO_MINI_APP_ID` (Zalo Mini App off) ·
`APPLE_IAP_*` (`/api/iap/apple/verify` unusable; iOS is not in this release) · `NEXT_PUBLIC_POSTHOG_*` (deliberately
absent) · `NEXT_PUBLIC_TIKTOK_CONTENT_POSTING_ENABLED` (off) · `ORGANIZATION_SAME_AS` (no JSON-LD `sameAs`) ·
`VAPID_CONTACT_EMAIL` (defaults to admin@tappyai.com).

### 2g. FLAG / CONFIG PARITY — Production must run what UAT tested (owner 2026-09-29, applied in PHẦN B)

Rule (Huy, 29/09): every flag the release code reads runs on Production **exactly as on UAT (Preview, `rc/web-uat`)**,
except the owner's explicit decisions: `NEXT_PUBLIC_PLAY_LISTING_LIVE` **off**, `ACCOUNT_SELF_DELETE_ENABLED=false`,
D1/D2/D4 deferred. Method (29/09): `vercel env ls` names on both, `vercel env pull` of Preview for the non-sensitive values
(file deleted right after; *Sensitive* values come back empty, so those were read from behaviour — UAT logs), code defaults
read from the source. "eff." = the value the code actually runs with.

**A. Behaviour flags**

| Flag | Code default (unset) | UAT / Preview (tested) | Production today | Release action (step 6 of the run sheet) |
|---|---|---|---|---|
| `SNIPPET_PRICE_GUARD_V2` | OFF (`=== '1'/'true'`) | **set (Sensitive) → eff. ON** — UAT log `snippet_price v2:true` (064542b, 29/09) | unset → **OFF** | **ADD `1` on Production** (Q-ENV1, approved 29/09) |
| `CONSULT_V2` | ON (off only on `0/false/off`) | unset → ON | unset → ON | none |
| `CONSULTATIVE_V1` | ON | unset → ON | unset → ON | none |
| `PLACE_GUARD_ATTRIBUTION_V2` | ON | unset → ON | unset → ON | none |
| `RISK_BACKSTOP` | `live` | unset → live | unset → live | none |
| `MEDIA_PLACEMENT_V2` | OFF | unset → OFF | unset → OFF | none |
| `CONSULT_TOP3`, `CONSULT_TRIM_FRAME`, `CONSULT_TRIP_PREFETCH` | ON (`!== '0'`) | unset → ON | unset → ON | none |
| `CONSULT_V1_MORE` | normal (`=== '0'` switches) | unset | unset | none |
| `CONSULT_CACHE_LIBRARY`, `CONSULT_FOLLOW_REUSE`, `CONSULT_FOLLOW_SEED`, `CONSULT_FOLLOW_STATE` | OFF (`=== '1'`) | unset → OFF | unset → OFF | none (A/B kept off) |
| `QUOTA_WEIGHTED` | off | unset | unset | none |
| `SHOW_PUBLIC_SHARE` | ON | unset → ON | unset → ON | none |
| `MESSAGE_NOTIFICATIONS_ENABLED` | OFF (`=== 'true'`) | unset → OFF | unset → OFF | none |
| `NEXT_PUBLIC_TIKTOK_CONTENT_POSTING_ENABLED` | OFF | unset | unset | none |
| `GCP_LOGGING_ENABLED` | OFF | unset | unset | none |
| `CONTENT_SAFETY_GATE_ENABLED` | OFF (`=== 'true'`) | unset → **OFF** | **set (Encrypted, value not readable by CLI)** | 🚨 Lead reads the value in the Vercel dashboard at step 6. If `true`: production runs the safety gate UAT never ran → **before Huy's UAT sign-off**, set the same value on Preview (`rc/web-uat`), redeploy UAT and re-run the gates (do NOT switch a safety gate off on Production). If `false`/empty: nothing. |
| `CONTENT_SAFETY_SCHEMA_MIGRATED` | **since R19 (29/09): the read filter is ON unless the value is exactly `false`** (`publishableFilter`); gate activation still needs `true` | unset → filter ON | set (Encrypted) | 🚨 must NOT be `false` on Production (that would show RESTRICTED posts again); `true` or unset are both safe for reads |
| `CONTROLLER_ORG_MEMBERSHIP_ENABLED` | OFF (`=== 'true'`) | unset → OFF | set (Encrypted) | same rule: read it; `true` → mirror on Preview and re-test before sign-off |
| `ACCOUNT_SELF_DELETE_ENABLED` | OFF | unset → OFF | **`true`** (plain) | **SET `false`** (owner decision) |
| `NEXT_PUBLIC_PLAY_LISTING_LIVE` | OFF (UAT shows the badge by rule, `VERCEL_ENV !== 'production'`) | unset | unset → OFF | **keep unset** until Huy publishes the Play listing |
| `AUTH_GOOGLE_ENABLED` | not read by this release (Phase 8 reads it) | set (Sensitive) | set | **keep** on Production |
| `LLM_PROVIDER`, `LLM_*_MODEL`, `AUDIT_*`, `CCP_EVENT_LOG` | code defaults / harness only | unset | unset | **must stay unset** |

**B. Config with an environment-specific value (NOT copied — each environment has its own)**

| Name | UAT / Preview | Production | Release action |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | `https://uat.tappyai.com` | set (Encrypted) | confirm `https://www.tappyai.com` in the dashboard |
| `PLACES_PROVIDER` | `serper` | set (Encrypted) | confirm `serper` (same as UAT) |
| `GCS_MEDIA_BUCKET`, `GCP_MEDIA_SERVICE_ACCOUNT` | UAT bucket / SA | unset → code defaults = prod bucket / bridge SA | **keep unset** (§2a) |
| `GCP_WIF_POOL`, `GCP_WIF_PROVIDER`, `GCP_PROJECT_NUMBER` | UAT pool | prod values | confirm no `-uat` value (§2a) |
| `SERPER_DAILY_CREDIT_CEILING` | unset → 15,000 | unset → 15,000 | ADD `15000` explicitly (§2b) |
| `ACCESSTRADE_PUBLISHER_ID` | set | set | none |
| `ACCESSTRADE_API_KEY`, `ACCESSTRADE_FEED_ENDPOINT` | unset | unset | ADD (owner, §2b) — feed ingest |
| `CCP_ATTRIBUTION_SECRET` | own value | own value | none (different per env by design) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | unset (no GA on UAT) | set | none |
| `MEDIA_PROVIDER`, `APPLE_ROOT_CA_PEM` | unset | set | leave (inert: GCS is the only provider; the Apple root is pinned in code) |
| Credentials (`ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `STRIPE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `KV_*`, `ZALO_*`, `VAPID_*`, `GOOGLE_CLIENT_*`, `CRON_SECRET`, …) | own values | own values | none — never copied between environments |

After step 6: redeploy Production (env changes apply only to new deployments), then `verify-prod.mjs` (§5).

### 2e. Checklist §4 names the code no longer reads — do NOT add
`BLOB_READ_WRITE_TOKEN` (uploads are GCS via Workload Identity, not Vercel Blob) · `RESEND_API_KEY` ·
`NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Android gets it from Gradle) · `CJ_API_KEY`. Also on prod but unread by this
branch: `GOOGLE_PLACES_API_KEY` (Google Places removed), all `P8_*` (Phase 8 parked), `SMTP_*`/`EMAIL_FROM*`/`TEAM_EMAIL`,
`ADMIN_IDS`, `NEWSAPI_KEY`, `GOOGLE_SEARCH_*` — leave them; removing is not part of this release.
**`AUTH_GOOGLE_ENABLED` is NOT a leftover — KEEP it on Production (owner 2026-09-29).** rc does not read it yet, but
Phase 8 (`/auth/callback`) refuses Google sign-in unless it is `1`; removing it makes the Google button disappear
when Phase 8 merges. See `D:/Claude/Projects/TappyAI/tappyai-phase8/docs/uat/PHASE8-OVERLAP-2026-09-29.md` §4.

### 2f. Not an env var, but a dashboard switch the release depends on
Supabase **production** → Authentication → Sign In / Providers → **Allow anonymous sign-ins = ON** (guest chat). The
automated smoke (`smoke-prod.mjs`) fails every chat case if it is off.

---

## 3. Owner action list at release (one ordered list)

Do them in this order. Nothing here is typed into a chat; values go only into the local files named.

**(a) ACCESSTRADE feed credentials → `D:\TappyAI-backups\accesstrade.txt`** (before the deploy)
1. Open https://pub2.accesstrade.vn and sign in as the publisher.
2. Account menu (avatar, top right) → the API / account-information page → copy the **Access Key** (the publisher API
   token; the portal's exact menu label may differ — it is the key the API docs call "Access Key").
3. Confirm the datafeed URL: the API docs (same portal, "API"/"Datafeeds") → the datafeeds endpoint. Expected:
   `https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv` — keep `{campaign}` literally.
4. Create `D:\TappyAI-backups\accesstrade.txt` with exactly two lines, no quotes, no spaces:
   ```
   ACCESSTRADE_API_KEY=<the access key>
   ACCESSTRADE_FEED_ENDPOINT=https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv
   ```
5. Tell the lead "accesstrade.txt ready". The lead then runs (value never printed):
   ```bash
   for k in ACCESSTRADE_API_KEY ACCESSTRADE_FEED_ENDPOINT; do
     grep "^$k=" /d/TappyAI-backups/accesstrade.txt | cut -d= -f2- | tr -d '\r\n' | vercel env add "$k" production --sensitive
   done
   printf '15000' | vercel env add SERPER_DAILY_CREDIT_CEILING production
   vercel env rm ACCOUNT_SELF_DELETE_ENABLED production --yes && printf 'false' | vercel env add ACCOUNT_SELF_DELETE_ENABLED production
   # §2c — OWNER 2026-09-29: set it EXPLICITLY to false (do not leave it unset); self-delete stays off
   vercel env ls production | grep -E 'ACCESSTRADE_|SERPER_DAILY|ACCOUNT_SELF_DELETE'   # names only
   ```
   (If the CLI rejects `--sensitive`, drop the flag and mark the variable Sensitive in the dashboard.)
   Then delete `accesstrade.txt`.

**(b) Production DB access for the backup + migrations** (before §4 step 2)
1. https://supabase.com/dashboard/project/fwznnobrdctuskgrvuik → **Connect** (top bar) → **Session pooler**
   (port 5432, IPv4 — not "Transaction pooler" 6543, not "Direct connection").
2. Copy only the **host** (looks like `aws-0-<region>.pooler.supabase.com`). Save it alone on one line in
   `D:\TappyAI-backups\pghost.txt`.
3. DB password: use the one you already have (password manager). **Do NOT reset it** (Settings → Database → reset
   would break anything using the old one). If you do not have it, stop and tell the lead — resetting is a separate
   production change.
4. Create `D:\TappyAI-backups\pgpass` (no extension), one line:
   `<host>:5432:postgres:postgres.fwznnobrdctuskgrvuik:<password>`
   (a `:` or `\` inside the password must be written `\:` / `\\`). Not in OneDrive/Dropbox, not in any git folder.
5. Tell the lead "pgpass ready". The lead runs `backup-prod.ps1`, which validates the file's shape without printing it.

**(c) Merge PR #252 only if the lead's push/merge to `main` is blocked**
1. https://github.com/huyphamsm-tappy/tappyai-mvp/pull/252 (base `main` ← `rc/web-uat`, currently OPEN, MERGEABLE).
2. Check the head commit shown on the PR equals the release SHA the lead gives you.
3. Merge button dropdown → **"Create a merge commit"** (NOT "Squash and merge", NOT "Rebase and merge" — release docs
   and the Android build cite exact SHAs) → **Confirm merge**. Do not delete the branch.
4. Vercel builds production from `main` automatically; tell the lead when it is merged.

**(d) Play Console — AAB to Internal testing, then Production** (after the lead's `build-aab.sh <sha>` prints the path)
1. https://play.google.com/console → app **TappyAI** (`com.tappyai.app`).
2. Before upload: **Test and release → App integrity → App signing** → "Upload key certificate" SHA-256 must equal the
   `signer SHA-256` that `build-aab.sh` printed. Also **App bundle explorer**: confirm versionCode **10** has never been
   uploaded (a reused code is rejected; the 2026-09-28 11:58 local vc10 build must not have been uploaded).
3. **Test and release → Testing → Internal testing → Create new release** → **Upload** the `app-release.aab` →
   Release name `1.0.0 (10)` → Release notes (vi-VN): `Bản phát hành đầu tiên: hỏi đáp AI về ăn uống, mua sắm, du lịch;
   chia sẻ kế hoạch; kiểm tra lừa đảo.` (en-US: `First release: AI answers for food, shopping and travel; plan sharing;
   scam check.`) → **Next** → fix any errors → **Save** → **Start rollout to Internal testing**.
4. Install from the Play internal-testing link on your phone. Device test (DEPLOY-CHECKLIST §4e + blockers):
   sign in → Home looks the same before/after sign-in (F-107) → stay signed in across an app restart (F-098, minified
   build) → one chat turn → Settings shows **"Yêu cầu xóa tài khoản"** (flag off), not the in-app delete → one push
   arrives (§4e(b)).
5. Only if all pass: **Internal testing → the release → Promote release → Production** → review → **Save** →
   **Send changes for review** (Publishing overview). After approval, open
   `https://play.google.com/store/apps/details?id=com.tappyai.app` in a private window (§4e(a)(4)).

**(e) Production env values only the owner can supply**
| Name | Needed for launch? | Where to get it |
|---|---|---|
| `ACCESSTRADE_API_KEY`, `ACCESSTRADE_FEED_ENDPOINT` | yes (buy buttons from the feed) | step (a) |
| `ANDROID_APP_LINKS_SHA256` | optional (App Links) | Play Console → App integrity → **App signing key certificate** SHA-256 (not the upload key) |
| `INDEXNOW_KEY` | optional | any random 32-hex key you generate; not needed at launch (shares are noindex) |
| `GOOGLE_WEB_RISK_API_KEY` (+ `GOOGLE_CLOUD_PROJECT`) | optional | GCP console → APIs & Services → Credentials, Web Risk API enabled |
Everything else the release needs is already on Production (§2) or is a fixed value the lead sets
(`SERPER_DAILY_CREDIT_CEILING=15000`, `ACCOUNT_SELF_DELETE_ENABLED=false` set explicitly — owner 2026-09-29).
Also verify (dashboard, no value to copy): Supabase prod → Authentication → **Allow anonymous sign-ins** is ON (§2f).

**(e2) Guest chat on production — Allow anonymous sign-ins** (at §4 step 6, right after the deploy; before the smoke)
Baseline 29/09 (`f42ae4b`): a guest's first chat message answers **401 → "Cần đăng nhập để trò chuyện với Tappy"**
(`gs://tappyai-uat-evidence/evidence/prod-baseline-f42ae4b/guest-chat.png`). The release lets guests chat through an
anonymous Supabase session; without this switch every guest case of the smoke fails.
1. supabase.com/dashboard → project **`fwznnobrdctuskgrvuik`** (production — check the ref in the URL, NOT `zdaprdfgpbpnxyofagmc`).
2. Left menu **Authentication** → **Sign In / Providers** (older UI: Authentication → Providers → Settings).
3. Section *User Signups*: switch **Allow anonymous sign-ins** → ON. Leave "Allow new users to sign up" and
   "Confirm email" as they are.
4. **Save changes**. Tell the lead "anonymous ON" — the lead re-runs one guest question (expect 200 and an answer).
5. Rollback of this switch = the same toggle OFF (guests see the sign-in wall again; accounts are unaffected).

**(e3) Two production TEST accounts for `verify-prod.mjs`** (any time before §4 step 9; takes ~5 minutes)
Names — obviously test, never a real person: **`qa.release.a@tappyai.com`** (account A: chats, uploads, plan share)
and **`qa.release.b@tappyai.com`** (account B: only proves it cannot read A's data). No mailbox is needed.
1. supabase.com/dashboard → project **`fwznnobrdctuskgrvuik`** → **Authentication** → **Users**.
2. **Add user** → **Create new user** → email `qa.release.a@tappyai.com`, a strong password (password manager),
   tick **Auto Confirm User** → **Create user**. Repeat for `qa.release.b@tappyai.com` (different password).
3. On a private browser window open www.tappyai.com → Đăng nhập with account A → complete the **18+ date-of-birth**
   step once (the age gate blocks every signed-in account without it) → sign out. Repeat for B.
4. Do NOT give them Pro, admin or any role. After the release they may stay (useful for the next release) — their rows
   are test data; deleting them later = Authentication → Users → ⋯ → Delete user.
5. Running the script — the passwords never go into a file, the chat or the shell history. In Git Bash:
   ```bash
   export VERIFY_A_EMAIL=qa.release.a@tappyai.com VERIFY_B_EMAIL=qa.release.b@tappyai.com
   read -rs -p "A password: " VERIFY_A_PASSWORD; echo; export VERIFY_A_PASSWORD
   read -rs -p "B password: " VERIFY_B_PASSWORD; echo; export VERIFY_B_PASSWORD
   export VERIFY_SUPABASE_URL=https://fwznnobrdctuskgrvuik.supabase.co VERIFY_SUPABASE_ANON_KEY=<public anon key, Settings → API>
   node scripts/release/verify-prod.mjs --sha <release sha> --baseline <prod-baseline-f42ae4b dir>
   unset VERIFY_A_PASSWORD VERIFY_B_PASSWORD
   ```
   You type the two passwords yourself at the prompts (nothing is echoed); the lead runs the rest.

**(f) After the release is stable (same day)**
Delete `D:\TappyAI-backups\pgpass` (and `pghost.txt`, `accesstrade.txt` if still there). Keep the `prod-<stamp>`
dump folders; write a delete-after date in their `README.txt`.

---

## 4. Lead run sheet (order)

1. `vercel env` changes of §3(a) step 5 (after the owner's file). Do not redeploy the current production for them.
2. `powershell -ExecutionPolicy Bypass -File C:\wtrel\scripts\release\backup-prod.ps1 -RestoreCheck` → note the dir.
3. `bash scripts/release/apply-migration.sh --check scripts/release/sql/precheck-all.sql | tee <dir>/precheck-before.txt`.
   Stop if §1-V is not `t,t,t` or D5's `chain_problems` ≠ 0.
4. Migrations 1 → 15 of §1, one call each, verify after each (`--check` with the same file, or read the table).
5. Merge the release to `main` (or owner §3c) → Vercel production build.
6. `curl -s https://www.tappyai.com/api/version` → `{"v":"<release sha>"}`.
7. Migrations 16, 17 (`--after-web-deploy`).
8. Crons once (Vercel dashboard → Project → Settings → **Cron Jobs** → **Run** — avoids handling `CRON_SECRET`):
   `/api/cron/feed-ingest` (expect `outcome:"ok"`, `written > 0`), `/api/cron/decision-evidence-sweep`
   (`{"ok":true,…}`), `/api/cron/audit-retention` (200). `/api/cron/account-deletion-jobs` is **expected** to 500 (D4 deferred).
9. §5a automated smoke, §5b manual signed-in smoke. Any FAIL → stop, §0.4 / rollback order above.
10. `backup-prod.ps1 -Label pre-sec` (fresh) → migrations 18, 19 (`--after-smoke-passed`) → repeat §5b + counters.
11. `--check precheck-all.sql` again → `<dir>/precheck-after.txt`.
12. `bash scripts/release/build-aab.sh <release sha>` → owner §3d.
13. Fill `docs/ios/HANDOFF-FROM-RELEASE.md` "Release 2026-09-29" section.

---

## 5. Smoke test

### 5a. Automated, signed-out (`scripts/release/smoke-prod.mjs`)
```bash
PLAYWRIGHT_CORE_DIR=<dir with node_modules/playwright-core> node scripts/release/smoke-prod.mjs \
  --sha <release sha> --out D:/TappyAI-backups/smoke-<stamp>
```
Checks: home 200 · `/api/version` = SHA · guest chat food / delivery / shopping / hotel / event / flight /
"tối nay có chỗ nào đi chơi ở sài gòn ko" / trip (2 turns): `/api/chat` 200, non-empty, no literal `**`, buy/booking
control present on the six commerce verticals, no 5xx · OG tags on a review (`--review <uuid>` or auto-picked from
`/reviews`) · plan-share link signed-out + `noindex` (needs `--plan-url` from 5b step 3; re-run with `--only none --plan-url …`).
Side effect: each chat case = one anonymous auth user on prod (normal visitor behaviour). Exit ≠ 0 on any failure.

### 5b. Manual, signed-in (owner, own prod **test** account — never a real user's; no service-role sessions)
1. Sign in with email + password on https://www.tappyai.com.
2. Post a review **with a photo** → it appears on your profile; the photo URL is on `storage.googleapis.com/tappyai-media-prod/…`.
3. Ask for a 2-day plan → plan card → **Share** → copy the `/plan/<id>` link → run 5a with `--plan-url`.
4. Hide the review → it disappears from the public profile (signed-out window) → Unhide → back.
5. Delete the review → gone from profile and feed.
6. Avatar + cover upload (~1 MB JPEG) → both show after reload.
7. **Isolation (A cannot read B):** test user A saves a place and likes a review; in a second browser signed in as
   test user B open `https://www.tappyai.com/api/memory`, `/api/reviews/saved` and `/profile/favorites` → only B's
   data, none of A's. Also, with only the anon key (from the site bundle, public):
   `https://fwznnobrdctuskgrvuik.supabase.co/rest/v1/review_likes?select=user_id` → `[]` (L1) and
   `…/rest/v1/group_members?select=group_id` → `[]` (S1).
8. Report someone else's review (⋮ → Report) → "report sent". Copyright page `/copyright` renders.
9. Settings shows **"Yêu cầu xóa tài khoản"** (flag off). `POST /api/account/delete` signed-out → **404** (flag off).
10. Back office loads for an `@tappyai.com` admin; one admin action → its `audit_log` row has `actor_email` NULL (D5).
After H1/M1 (step 10 of §4): repeat 2, 4, 5, 6 plus like / save / comment (counters move) and edit name + bio.

---

## 6. Contradictions / gaps found in DEPLOY-CHECKLIST.md (for the lead)

1. 🚨 **`ACCOUNT_SELF_DELETE_ENABLED` is listed on Production (value `true`)**, while the owner deferred D1/D2/D4 and
   §4d says flag on only after them. Must be removed before the deploy (§2c, §3a).
2. 🚨 **Public `/delete-account` copy describes the in-app self-delete** (`1dcc877`, `src/lib/i18n/legal.ts`
   `legal.delete.s1.lead`: "delete … yourself … immediately"), but with the flag off the app shows the email-request
   flow — the page Play compares with the app would be false. Needs an owner/lead decision before the deploy: restore
   the request-by-email copy of `0af672c` for this release, or reverse the D1/D2/D4 deferral. (The page also promises
   "files within 48 h" and "audit logs store no email" — the latter holds with D5; the former needs D4.)
3. §1-D5 says "Independent of the deploy", but `src/lib/admin/audit.ts:90` writes `actor_email: null` and the column
   is NOT NULL until D5 → D5 must be applied **before** the deploy (done so in §1 #14).
4. §1-D3 says "Apply (any time after D2)"; D2 is deferred. D3 does not depend on D2 (the function deletes by
   `expires_at` only); only its optional `VALIDATE CONSTRAINT` step does → skipped.
5. `20260927100000_commerce_providers_portal_state.sql` is on the branch but absent from the checklist (§1 flag).
6. Stale counts: §1 intro "16 files / 12 apply", footer "Eight migrations (§1 #1–#8) are the release delta" — the real
   delta is 26 files: 16 APPLY (15 before the deploy + the music lockdown after it), 1 AFTER-DEPLOY (S1),
   2 AFTER-SMOKE (H1, M1), 3 VERIFY-ONLY, 3 DEFER (D1, D2, D4), 1 SKIP — plus the D3 one-off sweep call.
7. §3 rollback order covers only #1–#8; the full reverse order is in §1 above.
8. §4 "Must be set / feature-gated" lists `BLOB_READ_WRITE_TOKEN` ("set this"), `RESEND_API_KEY`,
   `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `CJ_API_KEY` — the code on this branch reads none of them (uploads are GCS/WIF,
   §4e(d) says so itself).
9. §4a `CONTENT_SAFETY_*` "unset until the schema is applied to prod" vs. the header "content_safety_gate … live on
   prod"; both names exist on Production today (values not read here).
10. §4d step 4 + §4e(a)(2) assume the in-app deletion ships ("Android must ship its in-app button in the same
    release"); with D1/D2/D4 deferred the Android button stays hidden behind `flags.accountSelfDelete=false`.
11. §0.2 uses an interactive `PGPASSWORD`; the owner chose a pgpass file — `backup-prod.ps1` uses it and copies it to a
    0600 file inside the container (libpq ignores a world-readable pgpass, which a Windows bind mount is).
12. §1-L1 and §1-S1 have no rollback **files** (only "re-create the policy from …"). Acceptable, but `apply-migration.sh
    --rollback` cannot be used for them.
13. Android versionCode 10: a local vc10 release build exists from 2026-09-28 11:58 (PRIVACY-REVIEW-G1 §1.1). If any
    vc10 AAB was ever uploaded to Play, the new upload is rejected — check App bundle explorer first (§3d step 2).
