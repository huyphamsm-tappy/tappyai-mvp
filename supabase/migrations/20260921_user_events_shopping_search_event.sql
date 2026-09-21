-- Analytics taxonomy: allow the 'shopping_search_click' event type on user_events.
--
-- Same conditional, additive pattern as 20260921_user_events_ga4_event_types.sql (#7),
-- kept as a separate migration because #7 is already applied (extending it in place
-- would drift from what ran). Rationale, verbatim from #7:
--   - constraint ABSENT  -> no-op (prod path: stays forward-compatible, no gate added);
--   - constraint PRESENT -> rebuild it as (current allowed set ∪ the new type),
--     never narrowing, so no other branch's values are dropped.
-- Idempotent and NOT VALID (new rows only). See docs/uat/DEPLOY-CHECKLIST.md #8.
--
-- shopping_search_click = a tap on a shopping card's "Tìm trên …" search-redirect link
-- (a demand signal while real buy buttons are sparse). It is a normal client-tracker
-- event (writes a user_events row) — unlike affiliate_click, which is GA-only.

DO $$
DECLARE
  cur_def   text;
  existing  text[];
  additions text[] := ARRAY['shopping_search_click'];
  final_set text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cur_def
  FROM pg_constraint
  WHERE conrelid = 'public.user_events'::regclass
    AND conname  = 'user_events_event_type_check';

  IF cur_def IS NULL THEN
    RAISE NOTICE 'user_events_event_type_check absent — leaving event_type forward-compatible (no gate added).';
    RETURN;
  END IF;

  SELECT array_agg(m[1]) INTO existing
  FROM regexp_matches(cur_def, '''([^'']+)''', 'g') AS m;

  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO final_set
  FROM (SELECT DISTINCT unnest(existing || additions) AS v) s;

  ALTER TABLE public.user_events DROP CONSTRAINT user_events_event_type_check;
  EXECUTE format(
    'ALTER TABLE public.user_events ADD CONSTRAINT user_events_event_type_check CHECK (event_type IN (%s)) NOT VALID',
    final_set
  );
  RAISE NOTICE 'user_events_event_type_check rebuilt with % values (union preserved).', array_length(string_to_array(final_set, ', '), 1);
END $$;
