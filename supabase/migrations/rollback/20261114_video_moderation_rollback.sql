-- Rollback of 20261114_video_moderation.sql.
-- WARNING: this DROPS the moderation decision history (results, transcripts, human notes) and the two attempt columns. Run it only if the feature has never been switched on
-- (EXPLORE_VIDEO_PIPELINE_ENABLED unset), or after the audit trail has been exported. Before running it, make sure nothing calls the functions (the moderation step runs only
-- behind that flag). The video rows, their state and their lifecycle history (video_asset_events, including csam_suspected / hold events) are NOT touched.
DROP FUNCTION IF EXISTS public.video_moderation_review_decide(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.video_moderation_record_auto(uuid, text, text, numeric, text, text, text, text, text, jsonb, text, boolean, timestamptz, text);
DROP FUNCTION IF EXISTS public.video_asset_note_event_once(uuid, text, text, text);
DROP TABLE IF EXISTS public.video_moderation_results;
DROP INDEX IF EXISTS public.video_assets_review_required_idx;
DROP INDEX IF EXISTS public.video_assets_moderating_idx;
ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_moderation_attempts_check;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS moderation_error;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS moderation_attempts;
