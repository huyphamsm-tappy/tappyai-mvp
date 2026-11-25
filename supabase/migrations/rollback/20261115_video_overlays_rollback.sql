-- Rollback of 20261115_video_overlays.sql: removes the overlay documents and the download render records. The saved overlays and the render records are LOST (the videos
-- themselves are untouched; rendered MP4 files stay in the private bucket until the clean-up removes them). Before running it: switch the video routes off
-- (EXPLORE_VIDEO_PIPELINE_ENABLED unset) so nothing writes them.
DROP FUNCTION IF EXISTS public.video_download_claim(uuid, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.video_overlay_save(uuid, uuid, integer, jsonb);
DROP TABLE IF EXISTS public.video_download_renders;
DROP TABLE IF EXISTS public.video_overlays;
DROP FUNCTION IF EXISTS public.video_overlays_stamp();
