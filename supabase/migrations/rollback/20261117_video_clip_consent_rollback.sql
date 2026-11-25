-- Rollback of 20261117_video_clip_consent.sql. Drops the recorded acceptances: afterwards every account must accept again before it can post a clip.
-- Before running it: switch the video routes off (EXPLORE_VIDEO_PIPELINE_ENABLED unset).
DROP TABLE IF EXISTS public.video_clip_consents;
