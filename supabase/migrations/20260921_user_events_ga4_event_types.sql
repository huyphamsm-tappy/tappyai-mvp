-- Analytics taxonomy: allow the new GA4-mirrored funnel event types on user_events.
--
-- Context (verified against the live DBs 2026-09-21):
--   • PROD (schema baseline 2026-09-17) has NO event_type CHECK — the
--     forward-compatible envelope migration dropped it and the security
--     re-add (add_event_type_check.sql) is NOT in the prod release delta.
--     So on prod every event_type already inserts; there is nothing to gate,
--     and this migration must NOT introduce a new restrictive gate that could
--     start dropping event types prod currently accepts.
--   • The audit / nonprod DB DOES carry user_events_event_type_check, expanded
--     by the G1 growth branch to a superset (share_out, action_started, …).
--     A blind DROP + re-CREATE from any single branch's list would silently
--     remove another branch's values. So we union, never narrow.
--
-- Therefore, exactly:
--   - If the constraint is ABSENT  -> no-op (prod path: stays forward-compatible).
--   - If the constraint is PRESENT -> rebuild it as (current allowed set ∪ the
--     three new client-tracker types), preserving every value already allowed.
--
-- The new types added here: 'recommendation_click', 'scam_check', 'chat_opened'.
--   (report_submitted is mirrored from the EXISTING 'report' type — no new type.
--    affiliate_click is GA-only, fired at the commerce-handoff tap with no
--    user_events row, so it needs no entry here.)
--
-- Idempotent (re-running unions the same set) and NOT VALID (new rows only,
-- so it can never fail on historical rows). See docs/uat/DEPLOY-CHECKLIST.md.

DO $$
DECLARE
  cur_def   text;
  existing  text[];
  additions text[] := ARRAY['recommendation_click', 'scam_check', 'chat_opened'];
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

  -- Pull every quoted literal out of `CHECK ((event_type = ANY (ARRAY['a'::text, ...])))`.
  SELECT array_agg(m[1]) INTO existing
  FROM regexp_matches(cur_def, '''([^'']+)''', 'g') AS m;

  -- current ∪ additions, de-duplicated, as a quoted comma list.
  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO final_set
  FROM (SELECT DISTINCT unnest(existing || additions) AS v) s;

  ALTER TABLE public.user_events DROP CONSTRAINT user_events_event_type_check;
  EXECUTE format(
    'ALTER TABLE public.user_events ADD CONSTRAINT user_events_event_type_check CHECK (event_type IN (%s)) NOT VALID',
    final_set
  );
  RAISE NOTICE 'user_events_event_type_check rebuilt with % values (union preserved).', array_length(string_to_array(final_set, ', '), 1);
END $$;
