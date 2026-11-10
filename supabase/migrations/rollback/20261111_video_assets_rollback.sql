-- Rollback of 20261111_video_assets.sql.
-- WARNING: this DROPS the video lifecycle rows and their history. Nothing reads these tables until the later parts of the Explore video plan ship, so run it
-- only if the feature has never been switched on (EXPLORE_VIDEO_PIPELINE_ENABLED unset). Objects already stored in the buckets are NOT touched by this script.
DROP TABLE IF EXISTS public.video_asset_events;
DROP TABLE IF EXISTS public.video_assets;
DROP FUNCTION IF EXISTS public.video_asset_transition(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.video_assets_guard();
DROP FUNCTION IF EXISTS public.video_asset_transition_allowed(text, text);
