-- ============================================================================
-- ROLLBACK for supabase/migrations/20260913_plan_shares.sql
-- Plan shares — the published snapshot behind /plan/<shareId>.
--
-- Symmetric and destructive: every published plan link stops resolving the
-- moment this runs, and the snapshots are gone. Nothing else references the
-- table — the plans themselves still live in `conversations.messages`, which
-- this file does not touch.
-- ============================================================================

DROP FUNCTION IF EXISTS public.plan_share_public(TEXT);
DROP TABLE IF EXISTS public.plan_shares;
