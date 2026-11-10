-- Rollback of 20261112_video_asset_cleanup.sql. Drops the three functions, the index and the two columns (any legal hold dates and removal stamps recorded so far are LOST).
-- Before running it: remove the video-source-cleanup cron from vercel.json so nothing calls the functions while they are gone. Nothing in the buckets is touched.
DROP FUNCTION IF EXISTS public.video_asset_set_hold(uuid, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.video_asset_source_removed(uuid, text, text);
DROP FUNCTION IF EXISTS public.video_assets_due_for_source_cleanup(integer, integer);
DROP INDEX IF EXISTS public.video_assets_source_cleanup_idx;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS source_removed_at;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS legal_hold_until;
