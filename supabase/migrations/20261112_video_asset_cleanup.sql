-- Explore video, part 3 (plan VID-01 storage policy; ADR rev.1 §B3): which original files must be removed from the PRIVATE source bucket, and the legal hold that postpones it.
-- Builds on 20261111_video_assets.sql. All additive; nothing runs until the clean-up cron (src/app/api/cron/video-source-cleanup) is given a source bucket.
--
-- What it adds:
--  1. video_assets.legal_hold_until: while it is in the future the original file is KEPT (a reported or appealed video, evidence). NULL = no hold.
--  2. video_assets.source_removed_at: set when the original file was removed from the bucket (the row stays: it is the record, and the history keeps the event).
--  3. video_assets_due_for_source_cleanup(stale_hours, limit): the files to remove now, oldest first, with the reason:
--       deleted    the post/video was deleted (the owner deleted the post);
--       failed     an upload that was refused or failed, once it is older than the stale window;
--       abandoned  an upload that was started and never completed, once older than the stale window.
--     A live video (uploaded, processing, moderating, review_required, ready, published, rejected) is NEVER due here: those are kept for the life of the post. A row under a
--     legal hold is never due. The function only LISTS: the removal is done through the storage API, then recorded with (4).
--  4. video_asset_source_removed(asset, actor, reason): records that the file is gone (idempotent, appends one history event, refuses while a hold is active).
--  5. video_asset_set_hold(asset, until, actor, reason): sets or clears the hold (a past date is refused), with a history event. Used by the moderation work later.
-- Service role only. Account deletion does not use this: the account-deletion job removes every file under the user's prefix and the rows go with the account (cascade).
-- Rollback: rollback/20261112_video_asset_cleanup_rollback.sql.

ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS legal_hold_until  timestamptz NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS source_removed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS video_assets_source_cleanup_idx
  ON public.video_assets (updated_at)
  WHERE source_object_key IS NOT NULL AND source_removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.video_assets_due_for_source_cleanup(p_stale_hours integer, p_limit integer)
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

CREATE OR REPLACE FUNCTION public.video_asset_source_removed(p_asset uuid, p_actor text, p_reason text)
RETURNS TABLE (asset_id uuid, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v public.video_assets%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_actor, '')) = '' THEN
    RAISE EXCEPTION 'video_asset_source_removed: actor is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;
  -- The file must not be reported gone while a hold says it is kept.
  IF v.legal_hold_until IS NOT NULL AND v.legal_hold_until > now() THEN
    RAISE EXCEPTION 'video asset % is under a legal hold', p_asset USING ERRCODE = '55000';
  END IF;
  IF v.source_removed_at IS NOT NULL THEN
    RETURN QUERY SELECT v.id, false;
    RETURN;
  END IF;
  UPDATE public.video_assets a SET source_removed_at = now() WHERE a.id = p_asset;
  INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason)
  VALUES (p_asset, v.state, v.state, 'source_removed', p_actor, p_reason);
  RETURN QUERY SELECT v.id, true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.video_asset_set_hold(p_asset uuid, p_until timestamptz, p_actor text, p_reason text)
RETURNS TABLE (asset_id uuid, legal_hold_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v public.video_assets%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_actor, '')) = '' OR btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'video_asset_set_hold: actor and reason are required' USING ERRCODE = '22023';
  END IF;
  IF p_until IS NOT NULL AND p_until <= now() THEN
    RAISE EXCEPTION 'video_asset_set_hold: the hold must end in the future (use NULL to clear it)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.video_assets a SET legal_hold_until = p_until WHERE a.id = p_asset;
  INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason)
  VALUES (p_asset, v.state, v.state, CASE WHEN p_until IS NULL THEN 'hold_cleared' ELSE 'hold_set' END, p_actor, p_reason);
  RETURN QUERY SELECT p_asset, p_until;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.video_assets_due_for_source_cleanup(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_assets_due_for_source_cleanup(integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_asset_source_removed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_source_removed(uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_asset_set_hold(uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_set_hold(uuid, timestamptz, text, text) TO service_role;
