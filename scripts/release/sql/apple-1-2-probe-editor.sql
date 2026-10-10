-- READ-ONLY, catalog-only probe for the Supabase SQL Editor (production project fwznnobrdctuskgrvuik).
-- Use when scripts/release/apply-migration.sh --check cannot run (no D:/TappyAI-backups/pgpass). Paste the whole statement, press Run once, paste the JSON result back.
-- One SELECT: no DDL/DML, reads only pg_class / pg_policies / pg_trigger names and existence checks. No user data, no counts of rows.
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_object_agg(t, to_regclass('public.' || t) is not null)
             from unnest(array['content_reports','moderation_queue','moderation_actions','user_blocks','user_reports','moderation_decisions','moderation_appeals','banned_identities','chat_blocks']) t),
  'rls', (select coalesce(jsonb_object_agg(c.relname, c.relrowsecurity), '{}'::jsonb)
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname in ('content_reports','moderation_queue','moderation_actions','user_blocks','user_reports','moderation_decisions','moderation_appeals','banned_identities','chat_blocks')),
  'block_policy_count', (select count(*) from pg_policies where schemaname = 'public' and policyname like 'user_blocks_%'),
  'functions', jsonb_build_object(
     'blocked_ids', to_regprocedure('safety_private.blocked_ids()') is not null,
     'review_author_blocked', to_regprocedure('safety_private.review_author_blocked(uuid)') is not null,
     'user_report_to_queue', to_regprocedure('public.user_report_to_queue()') is not null,
     'fn_ingest_moderation_reports', to_regprocedure('public.fn_ingest_moderation_reports()') is not null,
     'content_report_to_queue_20261009', to_regprocedure('public.content_report_to_queue()') is not null),
  'triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]'::jsonb) from pg_trigger
               where not tgisinternal and tgname in ('content_report_to_queue','user_report_to_queue','moderation_decisions_guard','moderation_appeals_guard','refuse_banned_identity')),
  'ledger_table_exists', to_regclass('supabase_migrations.schema_migrations') is not null
)) as probe;
