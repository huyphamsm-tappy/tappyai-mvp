-- Rollback for 20260921_user_events_ga4_event_types.sql
--
-- Removes ONLY the three values this migration added, preserving every other
-- allowed type (including any other branch's growth events). No-op when the
-- constraint is absent (prod path).
--
-- Safe on historical rows: the rebuilt constraint is NOT VALID, so it is never
-- re-checked against existing data. CAVEAT: if 'recommendation_click' /
-- 'scam_check' / 'chat_opened' rows were inserted after the forward migration,
-- they remain in the table (NOT VALID does not reject them); only NEW inserts of
-- those types would be rejected once this rollback runs.

DO $$
DECLARE
  cur_def   text;
  existing  text[];
  removals  text[] := ARRAY['recommendation_click', 'scam_check', 'chat_opened'];
  final_set text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cur_def
  FROM pg_constraint
  WHERE conrelid = 'public.user_events'::regclass
    AND conname  = 'user_events_event_type_check';

  IF cur_def IS NULL THEN
    RAISE NOTICE 'user_events_event_type_check absent — nothing to roll back.';
    RETURN;
  END IF;

  SELECT array_agg(m[1]) INTO existing
  FROM regexp_matches(cur_def, '''([^'']+)''', 'g') AS m;

  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO final_set
  FROM (SELECT DISTINCT unnest(existing) AS v) s
  WHERE v <> ALL (removals);

  ALTER TABLE public.user_events DROP CONSTRAINT user_events_event_type_check;
  EXECUTE format(
    'ALTER TABLE public.user_events ADD CONSTRAINT user_events_event_type_check CHECK (event_type IN (%s)) NOT VALID',
    final_set
  );
END $$;
