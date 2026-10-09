-- READ-ONLY probe of PRODUCTION for the App Review 1.2 safety chain (report / block / moderation).
-- Run (owner / lead only):  bash scripts/release/apply-migration.sh --check scripts/release/sql/apple-1-2-probe.sql
-- (--check forces default_transaction_read_only=on and does not stop on error: a query about an object that does not exist
--  errors and the next one still runs — that error IS the answer.)
-- Prints structure and COUNTS only: no report text, no user ids, no emails.
-- Paste the whole output back; "expect" lines say what a fully applied chain looks like.

\echo '== 1. tables (expect t on all 8; f = that migration is NOT on prod)'
SELECT to_regclass('public.content_reports')      IS NOT NULL AS content_reports,       -- 20260817 (+20260930 insert check)
       to_regclass('public.moderation_queue')     IS NOT NULL AS moderation_queue,      -- 20260821
       to_regclass('public.moderation_actions')   IS NOT NULL AS moderation_actions,    -- 20260821
       to_regclass('public.user_blocks')          IS NOT NULL AS user_blocks,           -- 20261001
       to_regclass('public.user_reports')         IS NOT NULL AS user_reports,          -- 20261001b
       to_regclass('public.moderation_decisions') IS NOT NULL AS moderation_decisions,  -- 20261001d
       to_regclass('public.moderation_appeals')   IS NOT NULL AS moderation_appeals,    -- 20261001d
       to_regclass('public.banned_identities')    IS NOT NULL AS banned_identities;     -- 20261001e

\echo '== 2. row level security (expect t on every row)'
SELECT c.relname, c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('content_reports','moderation_queue','moderation_actions','user_blocks','user_reports','moderation_decisions','moderation_appeals','banned_identities')
 ORDER BY 1;

\echo '== 3. what a block does (expect 10 policies named user_blocks_*: reviews_select, comments_select/insert/delete_by_review_owner, follows_insert, likes_insert, notifications_select, and 3 on user_blocks itself)'
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'user_blocks_%' ORDER BY 1, 2;
SELECT count(*) AS block_policy_count FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'user_blocks_%';

\echo '== 4. functions the chain needs (expect t on all)'
SELECT to_regprocedure('safety_private.blocked_ids()')            IS NOT NULL AS blocked_ids,
       to_regprocedure('safety_private.review_author_blocked(uuid)') IS NOT NULL AS review_author_blocked,
       to_regprocedure('public.user_report_to_queue()')           IS NOT NULL AS user_report_to_queue,
       to_regprocedure('public.fn_ingest_moderation_reports()')   IS NOT NULL AS fn_ingest_moderation_reports;

\echo '== 5. triggers (expect content_report_to_queue [20261009], user_report_to_queue, moderation_decisions_guard, moderation_appeals_guard, refuse_banned_identity)'
SELECT tgname, tgrelid::regclass AS on_table FROM pg_trigger
 WHERE NOT tgisinternal AND tgname IN ('content_report_to_queue','user_report_to_queue','moderation_decisions_guard','moderation_appeals_guard','refuse_banned_identity') ORDER BY 1;

\echo '== 6. migration ledger (this table may not exist if migrations were applied by hand: an error here is fine)'
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20260817' ORDER BY 1;

\echo '== 7. queue health, counts only (a report older than 24 h with priority 3 is overdue)'
SELECT status, priority, count(*) AS n, min(created_at) AS oldest FROM public.moderation_queue GROUP BY 1, 2 ORDER BY 2 DESC, 1;
SELECT count(*) AS content_reports_total FROM public.content_reports;
SELECT count(*) AS user_reports_total FROM public.user_reports;
SELECT count(*) AS blocks_total FROM public.user_blocks;
