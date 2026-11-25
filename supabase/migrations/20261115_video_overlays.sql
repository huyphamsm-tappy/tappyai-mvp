-- Explore video, VID-02 / VID-04 (owner decisions 05/11/2026): the text overlay of a video, and the renders of its watermarked download. Builds on 20261111. Additive; nothing
-- reads these tables until the overlay and download routes are on (EXPLORE_VIDEO_PIPELINE_ENABLED).
--
--  1. public.video_overlays: ONE current row per video holding the overlay document (versioned JSON, schema_version inside the document) and its own version number,
--     which grows by one on every save. The original video is never touched; playback draws the layers from this JSON.
--  2. public.video_overlay_save(asset, owner, expected_version, doc): the single write path. Row-locks the asset, refuses someone else's or a deleted asset, checks the
--     caller's expected version (optimistic concurrency: a stale editor gets `conflict`, never overwrites a newer save) and writes version + 1.
--  3. public.video_download_renders: one row per (asset, cache key) for the rendered MP4 of the download (state, transcoder job name, attempts, error code, object key).
--     The cache key is a hash of (asset, overlay version, username, branding version), so a changed overlay or username is a new row and the old file is simply left to expire.
--  4. public.video_download_claim(asset, cache_key, max_attempts, grace_seconds, cooldown_seconds): the claim. Exactly ONE concurrent caller gets claimed = true and
--     goes on to create the job; a failed render may be tried again until max_attempts, then is left alone for the cool-down; a render whose creator died before it
--     recorded a job is taken over after the grace period.
--
-- Safety kept by the database: row level security ON with no policy, no grant to anon / authenticated, service role only (same as 20261111); the document is a JSON object of
-- bounded size; the cache key is 64 hex characters; states are a closed set. Rows follow their asset (ON DELETE CASCADE), so deleting an account removes them.
-- APPLY: named-file apply (additive). Rollback: rollback/20261115_video_overlays_rollback.sql (the saved overlays and render records are LOST; the files stay in the bucket
-- until the clean-up removes them).

CREATE TABLE IF NOT EXISTS public.video_overlays (
  asset_id   uuid        PRIMARY KEY REFERENCES public.video_assets(id) ON DELETE CASCADE,
  version    integer     NOT NULL,
  doc        jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_overlays_version_check CHECK (version >= 1),
  CONSTRAINT video_overlays_doc_check CHECK (jsonb_typeof(doc) = 'object' AND octet_length(doc::text) <= 65536)
);

CREATE TABLE IF NOT EXISTS public.video_download_renders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid        NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
  cache_key   text        NOT NULL,
  state       text        NOT NULL DEFAULT 'rendering',
  job_name    text        NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  error_code  text        NULL,
  object_key  text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_download_renders_unique UNIQUE (asset_id, cache_key),
  CONSTRAINT video_download_renders_key_check CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT video_download_renders_state_check CHECK (state IN ('rendering', 'ready', 'failed')),
  CONSTRAINT video_download_renders_attempts_check CHECK (attempts >= 0),
  CONSTRAINT video_download_renders_error_check CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  CONSTRAINT video_download_renders_ready_check CHECK (state <> 'ready' OR object_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS video_download_renders_open_idx ON public.video_download_renders (updated_at) WHERE state = 'rendering';

CREATE OR REPLACE FUNCTION public.video_overlays_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS video_overlays_stamp ON public.video_overlays;
CREATE TRIGGER video_overlays_stamp BEFORE UPDATE ON public.video_overlays FOR EACH ROW EXECUTE FUNCTION public.video_overlays_stamp();
DROP TRIGGER IF EXISTS video_download_renders_stamp ON public.video_download_renders;
CREATE TRIGGER video_download_renders_stamp BEFORE UPDATE ON public.video_download_renders FOR EACH ROW EXECUTE FUNCTION public.video_overlays_stamp();

-- status: 'saved' | 'not_found' (no such asset, or not this owner's: the same answer) | 'deleted' | 'conflict' (the stored version is not the one the caller edited).
-- p_expected_version is 0 for "there is no saved overlay yet".
CREATE OR REPLACE FUNCTION public.video_overlay_save(p_asset uuid, p_owner uuid, p_expected_version integer, p_doc jsonb)
RETURNS TABLE (status text, version integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  a public.video_assets%ROWTYPE;
  current_version integer;
BEGIN
  SELECT * INTO a FROM public.video_assets WHERE id = p_asset FOR UPDATE;
  IF NOT FOUND OR a.owner_id IS DISTINCT FROM p_owner THEN
    RETURN QUERY SELECT 'not_found'::text, 0;
    RETURN;
  END IF;
  IF a.state = 'deleted' THEN
    RETURN QUERY SELECT 'deleted'::text, 0;
    RETURN;
  END IF;

  SELECT o.version INTO current_version FROM public.video_overlays o WHERE o.asset_id = p_asset;
  IF COALESCE(current_version, 0) <> COALESCE(p_expected_version, -1) THEN
    RETURN QUERY SELECT 'conflict'::text, COALESCE(current_version, 0);
    RETURN;
  END IF;

  IF current_version IS NULL THEN
    INSERT INTO public.video_overlays (asset_id, version, doc) VALUES (p_asset, 1, p_doc);
    RETURN QUERY SELECT 'saved'::text, 1;
  ELSE
    UPDATE public.video_overlays SET version = current_version + 1, doc = p_doc WHERE asset_id = p_asset;
    RETURN QUERY SELECT 'saved'::text, current_version + 1;
  END IF;
END;
$fn$;

-- claimed = true: this caller owns the render and must create the job. Otherwise the current state is returned for the caller to act on (poll, stream, or report).
CREATE OR REPLACE FUNCTION public.video_download_claim(p_asset uuid, p_cache_key text, p_max_attempts integer, p_grace_seconds integer, p_cooldown_seconds integer)
RETURNS TABLE (claimed boolean, state text, attempts integer, job_name text, object_key text, error_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  r public.video_download_renders%ROWTYPE;
  inserted uuid;
BEGIN
  INSERT INTO public.video_download_renders (asset_id, cache_key) VALUES (p_asset, p_cache_key)
    ON CONFLICT (asset_id, cache_key) DO NOTHING
    RETURNING id INTO inserted;
  IF inserted IS NOT NULL THEN
    RETURN QUERY SELECT true, 'rendering'::text, 0, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.video_download_renders WHERE asset_id = p_asset AND cache_key = p_cache_key FOR UPDATE;

  -- A failed render is tried again while attempts remain, and again after the cool-down once they have run out (a fresh budget).
  IF r.state = 'failed' AND (
       r.attempts < GREATEST(COALESCE(p_max_attempts, 3), 1)
       OR r.updated_at < now() - make_interval(secs => GREATEST(COALESCE(p_cooldown_seconds, 3600), 0))
     ) THEN
    UPDATE public.video_download_renders
       SET state = 'rendering', job_name = NULL, error_code = NULL,
           attempts = CASE WHEN r.attempts < GREATEST(COALESCE(p_max_attempts, 3), 1) THEN r.attempts ELSE 0 END
     WHERE id = r.id
     RETURNING * INTO r;
    RETURN QUERY SELECT true, r.state, r.attempts, r.job_name, r.object_key, r.error_code;
    RETURN;
  END IF;

  -- The caller that inserted the row died before it recorded a job: take it over once the grace period has passed.
  IF r.state = 'rendering' AND r.job_name IS NULL AND r.updated_at < now() - make_interval(secs => GREATEST(COALESCE(p_grace_seconds, 120), 0)) THEN
    UPDATE public.video_download_renders SET updated_at = now() WHERE id = r.id RETURNING * INTO r;
    RETURN QUERY SELECT true, r.state, r.attempts, r.job_name, r.object_key, r.error_code;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, r.state, r.attempts, r.job_name, r.object_key, r.error_code;
END;
$fn$;

ALTER TABLE public.video_overlays         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_download_renders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_overlays         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.video_download_renders FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.video_overlays         TO service_role;
GRANT  ALL ON public.video_download_renders TO service_role;

REVOKE EXECUTE ON FUNCTION public.video_overlays_stamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.video_overlay_save(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_overlay_save(uuid, uuid, integer, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_download_claim(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_download_claim(uuid, text, integer, integer, integer) TO service_role;
