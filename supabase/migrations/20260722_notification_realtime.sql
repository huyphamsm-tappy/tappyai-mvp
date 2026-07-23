-- Bug #21: emit realtime INSERT events for the four tables the unread notification
-- badge reacts to. The client subscribes to these ONLY as a trigger and then
-- refetches GET /api/notifications (the single source of truth). No data-model
-- change: this only adds the tables to the supabase_realtime publication so
-- Realtime streams their changes. Idempotent — safe to re-run.
--
-- INSERT events carry the new row regardless of replica identity, so no REPLICA
-- IDENTITY change is needed. Realtime still enforces each table's existing RLS
-- SELECT policy per subscriber.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['review_likes', 'review_comments', 'user_follows', 'review_milestones']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
