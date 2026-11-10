-- Rollback of 20261113_video_transcode.sql: restores the clean-up function as 20261112 defined it (without owner_id) and drops the columns, constraint and index.
-- The recorded attempts, errors and has_audio values are LOST. Before running it: switch the video routes off (EXPLORE_VIDEO_PIPELINE_ENABLED unset) so nothing writes them.
DROP FUNCTION IF EXISTS public.video_assets_due_for_source_cleanup(integer, integer);
CREATE FUNCTION public.video_assets_due_for_source_cleanup(p_stale_hours integer, p_limit integer)
RETURNS TABLE (id uuid, source_bucket text, source_object_key text, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id,
         a.source_bucket,
         a.source_object_key,
         CASE WHEN a.state = 'deleted' THEN 'deleted' WHEN a.state = 'failed' THEN 'failed' ELSE 'abandoned' END
    FROM public.video_assets a
   WHERE a.source_object_key IS NOT NULL
     AND a.source_removed_at IS NULL
     AND (a.legal_hold_until IS NULL OR a.legal_hold_until <= now())
     AND (
           a.state = 'deleted'
        OR (a.state IN ('failed', 'uploading') AND a.updated_at < now() - make_interval(hours => GREATEST(COALESCE(p_stale_hours, 24), 1)))
         )
   ORDER BY a.updated_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
$fn$;
REVOKE EXECUTE ON FUNCTION public.video_assets_due_for_source_cleanup(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_assets_due_for_source_cleanup(integer, integer) TO service_role;
DROP INDEX IF EXISTS public.video_assets_processing_idx;
ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_transcode_check;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS transcode_error;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS transcode_attempts;
ALTER TABLE public.video_assets DROP COLUMN IF EXISTS has_audio;
