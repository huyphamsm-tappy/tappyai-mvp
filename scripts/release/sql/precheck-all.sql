-- READ-ONLY state probe for every migration in docs/uat/RELEASE-PLAN-2026-09-29.md §1.
-- Run with:  bash scripts/release/apply-migration.sh --check scripts/release/sql/precheck-all.sql
-- (--check forces default_transaction_read_only=on and does NOT stop on error: a query about an
--  object that does not exist yet errors and the next one still runs — that error IS the answer.)
-- Queries are copied from docs/uat/DEPLOY-CHECKLIST.md §1; H1/M1/portal-state ones are added here.
-- Run it BEFORE the first apply (expect the "before" column) and again at the end (expect "after").

\echo '== §1-V already on prod (expect t,t,t — if any f: STOP, the 09-17 snapshot no longer describes prod)'
SELECT to_regclass('public.chat_messages') IS NOT NULL AS chat_phase1,
       to_regclass('public.chat_blocks')   IS NOT NULL AS chat_phase6,
       to_regclass('public.review_shares') IS NOT NULL AS review_shares;

\echo '== G1 20260913_g1_growth_foundation (before f / after t)'
SELECT to_regclass('public.shared_results') IS NOT NULL AS g1_shared_results,
       to_regclass('public.anon_identity_map') IS NOT NULL AS g1_anon_identity_map,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_shared_result_bump') AS g1_fn;

\echo '== #1 20260913_plan_shares (before f / after t, 3 policies, fn t)'
SELECT to_regclass('public.plan_shares') IS NOT NULL AS plan_shares,
       (SELECT count(*) FROM pg_policies WHERE tablename='plan_shares') AS policies,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='plan_share_public') AS fn_ok;

\echo '== P1 20260915_profile_public_presentation (before f,f / after t,t)'
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='bio') AS bio,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='cover_url') AS cover_url;

\echo '== L1 20260915b_review_likes_private (before: "Anyone can read likes" / after: review_likes_select_own)'
SELECT policyname FROM pg_policies WHERE tablename='review_likes' AND cmd='SELECT';
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='review_likers') AS review_likers_fn,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname='hot_places_24h') AS hot_places_fn;

\echo '== G2 20260918_g1b_share_ancestry (before f / after t,t)'
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_results' AND column_name='parent_id') AS parent_id,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shared_results' AND column_name='owner_is_anonymous') AS owner_is_anonymous;

\echo '== #2/#3 commerce tables (before f,f,f / after t,t,t)'
SELECT to_regclass('public.commerce_providers') IS NOT NULL AS providers,
       to_regclass('public.commerce_feed_items') IS NOT NULL AS feed_items,
       to_regclass('public.commerce_feed_runs')  IS NOT NULL AS feed_runs;

\echo '== PS 20260927100000_commerce_providers_portal_state (after: 7 rows cellphones,klook,lazada,traveloka,tripcom,vexere,vietnamairlines; errors before #2)'
SELECT provider_id, active, deeplink_enabled, tier, network, campaign_id
  FROM public.commerce_providers WHERE deeplink_enabled ORDER BY provider_id;

\echo '== #4 F-028 (before f / after t)'
SELECT prosrc ILIKE '%age(CURRENT_DATE, v_existing%' AS f028_applied FROM pg_proc WHERE proname='set_user_date_of_birth';

\echo '== #5 F-032 (before f / after body_ok t, auth_can_exec f)'
SELECT (SELECT prosrc ILIKE '%v_jwt_role%' FROM pg_proc WHERE proname='fn_grant_admin_role') AS body_ok,
       has_function_privilege('authenticated', (SELECT oid FROM pg_proc WHERE proname='fn_grant_admin_role'), 'EXECUTE') AS auth_can_exec;

\echo '== #6 music_tracks_lockdown (before policies 4, anon_read t / after 0, f, svc t, rows unchanged)'
SELECT (SELECT count(*) FROM pg_policies WHERE tablename='music_tracks') AS policies,
       has_table_privilege('anon','public.music_tracks','SELECT') AS anon_read,
       has_table_privilege('service_role','public.music_tracks','SELECT') AS svc_read,
       (SELECT count(*) FROM public.music_tracks) AS rows_kept;

\echo '== #7/#8 user_events constraint (prod: 0 rows = both are no-ops)'
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.user_events'::regclass AND conname='user_events_event_type_check';

\echo '== GR 20260922_groups_avatar_url (before f / after t)'
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='avatar_url') AS avatar_url;

\echo '== S1 20260904_group_read_boundary (before 2 rows / after 0 rows)'
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
   AND policyname IN ('Anyone can read groups','Anyone can read group members');
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('groups','group_members') AND cmd='SELECT';

\echo '== D1 (DEFERRED — info only; text = not applied)'
SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id';

\echo '== D2 (DEFERRED — info only; 0 rows = not applied)'
SELECT conname FROM pg_constraint WHERE conname IN ('decision_evidence_owner_id_fkey','anon_chat_usage_user_id_fkey');

\echo '== D3 20260925b_decision_evidence_sweep (before: fn 0 rows / after: fn present, authenticated cannot execute, expired 0 after the one-off sweep)'
SELECT proname FROM pg_proc WHERE proname = 'decision_evidence_sweep';
SELECT count(*) FILTER (WHERE expires_at < now()) AS expired, count(*) AS total FROM public.decision_evidence;

\echo '== D4 (DEFERRED — info only; confdeltype n = not applied, trigger 0 rows)'
SELECT conrelid::regclass, confdeltype FROM pg_constraint
 WHERE contype='f' AND confrelid='auth.users'::regclass
   AND conrelid IN ('public.shared_results'::regclass,'public.notifications'::regclass);
SELECT tgname FROM pg_trigger WHERE tgname='trg_enqueue_account_deletion';

\echo '== D5 20260925d_audit_log_pii_retention (chain problems MUST be 0 before; trigger 0 rows = not applied; actor_email nullable after)'
SELECT count(*) AS chain_problems FROM fn_verify_audit_chain();
SELECT tgname FROM pg_trigger WHERE tgname='aaa_audit_log_pii';
SELECT is_nullable AS actor_email_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='audit_log' AND column_name='actor_email';

\echo '== H1 20260927_owner_update_column_privileges (pre-flight: all 6 prosecdef t / before upd t,t / after f,f)'
SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND proname IN ('increment_review_view','sync_review_watch_stats','update_follow_counts',
       'update_review_comment_count','update_review_like_count','update_review_save_count') ORDER BY proname;
SELECT has_column_privilege('authenticated','public.reviews','publication_state','UPDATE') AS reviews_publication_state_upd,
       has_column_privilege('authenticated','public.profiles','onboarded','UPDATE')       AS profiles_onboarded_upd,
       has_column_privilege('authenticated','public.reviews','is_hidden','UPDATE')        AS reviews_is_hidden_upd_keep_t;

\echo '== M1 20260928_revoke_reviews_insert (before t,t / after f,f)'
SELECT has_table_privilege('authenticated','public.reviews','INSERT') AS auth_insert,
       has_table_privilege('anon','public.reviews','INSERT')          AS anon_insert;

\echo '== skipped: music_soundhelix_attribution needs music_tracks.license (prod: expect f)'
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='music_tracks' AND column_name='license') AS music_license_col;
