-- READ-ONLY, catalog-only second probe for the Supabase SQL Editor (production project fwznnobrdctuskgrvuik).
-- Checks what the missing migrations 20261001 / 20261001b / 20261001d / 20261001e / 20261009 REQUIRE to already exist, and whether the
-- 20260930 INSERT check on content_reports is in place. One SELECT: names and existence only, no user data, no row counts.
select jsonb_pretty(jsonb_build_object(
  'prerequisite_tables', (select jsonb_object_agg(t, to_regclass('public.' || t) is not null)
                          from unnest(array['reviews','review_comments','review_likes','user_follows','notifications','profiles','account_status','audit_log']) t),
  'content_reports_policies', (select coalesce(jsonb_agg(policyname || ' : ' || cmd order by policyname), '[]'::jsonb)
                               from pg_policies where schemaname = 'public' and tablename = 'content_reports')
)) as probe2;
