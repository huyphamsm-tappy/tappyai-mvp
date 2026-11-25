-- Rollback of 20261116_video_publish_delivery.sql. Drops the three functions, the two indexes and the three columns (takedown bookkeeping recorded so far is LOST; a video
-- stays `published` with its review_id, which the lifecycle of 20261111 still understands).
-- Before running it: remove the video-takedown cron from vercel.json so nothing calls the functions while they are gone, and keep EXPLORE_VIDEO_PIPELINE_ENABLED off (publishing and
-- playback need these functions). Nothing in the buckets or in `reviews` is touched.
DROP FUNCTION IF EXISTS public.video_assets_due_for_takedown(integer, integer);
DROP FUNCTION IF EXISTS public.video_asset_record_takedown(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.video_asset_publish(uuid, uuid, uuid, text);
DROP INDEX IF EXISTS public.video_assets_delivery_live_idx;
DROP INDEX IF EXISTS public.video_assets_review_unique_idx;
ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_takedown_check;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS delivery_takedown_error;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS delivery_takedown_attempts;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS delivery_removed_at;
