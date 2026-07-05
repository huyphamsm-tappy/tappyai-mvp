-- ============================================================================
-- Gate A DB hardening — residual verified findings (idempotent; re-runnable)
-- ============================================================================
-- Bundles four small, independent hardening fixes flagged by the verification
-- audit. Never edits historical migrations.
-- ============================================================================

-- 1. increment_review_view: block anonymous view-count inflation ------------
-- add_phase4.sql exposes this SECURITY DEFINER RPC with no REVOKE, so any
-- holder of the public anon key could call it in a loop via PostgREST and
-- manipulate the trending feed. Restrict EXECUTE to authenticated users.
REVOKE EXECUTE ON FUNCTION public.increment_review_view(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.increment_review_view(uuid) TO authenticated;

-- 2. place_photos: remove anonymous write (cache-poisoning) ------------------
-- 20260620_place_photos.sql granted anon INSERT/UPDATE WITH CHECK(true),
-- letting anyone overwrite photo_url for any place. The table is no longer
-- read by application code (image pipeline moved to Serper thumbnails), so
-- writes should be service-role-only. Drop the permissive write policies;
-- service_role bypasses RLS and keeps any admin/backfill path working.
DROP POLICY IF EXISTS "anon_insert" ON public.place_photos;
DROP POLICY IF EXISTS "anon_update" ON public.place_photos;

-- 3. user_events: reconcile order-dependent column drift --------------------
-- Two historical CREATE TABLE IF NOT EXISTS definitions disagree: the tracking
-- version has no place_id/review_id, the user_memory version does. Whichever
-- applied first wins, so the like-event insert (which sets review_id/place_id)
-- can silently fail. Guarantee the columns exist regardless of apply order.
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS place_id  uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_id uuid DEFAULT NULL;

-- 4. reviews(user_id) index -------------------------------------------------
-- Profile posts, notifications, feed filtering and preference signals all
-- query reviews by user_id; no index existed in any migration.
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON public.reviews (user_id);
