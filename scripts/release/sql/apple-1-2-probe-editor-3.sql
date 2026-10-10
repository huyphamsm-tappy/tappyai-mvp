-- READ-ONLY, catalog-only third probe for the Supabase SQL Editor (production project fwznnobrdctuskgrvuik).
-- Dedup guards and enum values the new migrations rely on: the unique index behind the queue's ON CONFLICT DO NOTHING (uq_modq_source),
-- content_reports' own unique/check constraints and columns, and the moderation_type / moderation_status labels. Definitions only: no rows, no counts.
select jsonb_pretty(jsonb_build_object(
  'moderation_queue_indexes', (select coalesce(jsonb_agg(indexname || ' :: ' || indexdef order by indexname), '[]'::jsonb) from pg_indexes where schemaname = 'public' and tablename = 'moderation_queue'),
  'content_reports_indexes', (select coalesce(jsonb_agg(indexname || ' :: ' || indexdef order by indexname), '[]'::jsonb) from pg_indexes where schemaname = 'public' and tablename = 'content_reports'),
  'content_reports_constraints', (select coalesce(jsonb_agg(conname || ' :: ' || pg_get_constraintdef(oid) order by conname), '[]'::jsonb) from pg_constraint where conrelid = 'public.content_reports'::regclass),
  'content_reports_columns', (select coalesce(jsonb_agg(attname || ':' || format_type(atttypid, atttypmod) order by attnum), '[]'::jsonb) from pg_attribute where attrelid = 'public.content_reports'::regclass and attnum > 0 and not attisdropped),
  'enum_moderation_type', (select coalesce(jsonb_agg(enumlabel order by enumsortorder), '[]'::jsonb) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'moderation_type'),
  'enum_moderation_status', (select coalesce(jsonb_agg(enumlabel order by enumsortorder), '[]'::jsonb) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'moderation_status')
)) as probe4;
