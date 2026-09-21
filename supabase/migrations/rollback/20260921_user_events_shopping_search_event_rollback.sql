-- Rollback for 20260921_user_events_shopping_search_event.sql
--
-- Removes ONLY 'shopping_search_click', preserving every other allowed type. No-op
-- when the constraint is absent (prod path). Safe on historical rows: the rebuilt
-- constraint is NOT VALID, so existing shopping_search_click rows are not rejected;
-- only NEW inserts of that type would be, once this runs.

DO $$
DECLARE
  cur_def   text;
  existing  text[];
  removals  text[] := ARRAY['shopping_search_click'];
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
