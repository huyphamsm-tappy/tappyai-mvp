-- Security hardening: constrain user_events.event_type to the known taxonomy.
-- Backward compatible: NOT VALID skips existing rows, enforces new inserts only.
-- The allowlist is the UNION of every event_type the app actually writes:
--   • /api/track ALLOWED_TYPES (16)
--   • userMemory.logUserEvent UserEventType (like, skip_suggestion, checkin, view_review, open_app)
--   • reviews/[id]/like route ('like', already covered)
-- Idempotent: guarded by pg_constraint existence check.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_events_event_type_check'
  ) THEN
    ALTER TABLE public.user_events
      ADD CONSTRAINT user_events_event_type_check
      CHECK (event_type IN (
        'page_view','page_time','chat_search','category_click','place_save',
        'place_click','review_view','deal_click','feature_use','review_search',
        'review_like','review_share','review_post','hide','not_interested','report',
        'like','skip_suggestion','checkin','view_review','open_app'
      )) NOT VALID;
  END IF;
END $$;
