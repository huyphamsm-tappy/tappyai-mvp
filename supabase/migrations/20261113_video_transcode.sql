-- Explore video, part 4 (ADR rev.1 §B1 / rev.2 §2.1): what the transcoding step records on a video. Builds on 20261111 / 20261112. Additive; nothing reads it until the video routes are on.
--
--  1. video_assets.has_audio: whether the file has a sound track (read from its own header at upload, part 2b), so the transcode job asks for audio only when there is some.
--  2. video_assets.transcode_attempts: how many transcode jobs were started for this video (a failed job is retried a few times, then the video fails).
--  3. video_assets.transcode_error: a short machine-readable code of the last failure (never a provider message), cleared on success.
--  4. An index over the videos being processed, for the reconciliation sweep that finds jobs stuck or lost.
--  5. video_assets_due_for_source_cleanup now also returns owner_id: the clean-up removes the transcoder output of a deleted or failed video too, and that folder is
--     per owner (vstg/<owner>/<asset>/). The function changes its result type, so it is dropped and recreated.
-- Rollback: rollback/20261113_video_transcode_rollback.sql.

ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS has_audio          boolean NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS transcode_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS transcode_error    text    NULL;

ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_transcode_check;
ALTER TABLE public.video_assets ADD CONSTRAINT video_assets_transcode_check
  CHECK (transcode_attempts >= 0 AND (transcode_error IS NULL OR char_length(transcode_error) <= 64));

CREATE INDEX IF NOT EXISTS video_assets_processing_idx ON public.video_assets (updated_at) WHERE state = 'processing';

DROP FUNCTION IF EXISTS public.video_assets_due_for_source_cleanup(integer, integer);
CREATE FUNCTION public.video_assets_due_for_source_cleanup(p_stale_hours integer, p_limit integer)
RETURNS TABLE (id uuid, owner_id uuid, source_bucket text, source_object_key text, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT a.id,
         a.owner_id,
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
