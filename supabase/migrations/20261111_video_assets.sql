-- Explore video, part 1 (plan VID-05; ADR rev.1 05/11/2026): the lifecycle record of a video, built to stay dark until the owner switches the feature on.
--
-- What it adds (all additive, nothing existing is touched; nothing reads these tables yet):
--  1. public.video_assets: one row per uploaded video. Its own table, not columns on `reviews`: the DDL of `reviews` is not under migrations, so it is not extended blindly.
--     review_id is a plain reference (no foreign key) for the same reason.
--  2. public.video_asset_events: the append-only history of every state change (who, what, why, correlation id).
--  3. public.video_asset_transition_allowed(from, to): THE transition table of the lifecycle. src/lib/media/video/assetState.ts holds the same table;
--     supabase/tests/video_assets.test.ts compares the two for every pair of states.
--  4. A BEFORE UPDATE trigger that rejects an illegal jump and any change of owner / idempotency key / creation time, and stamps updated_at.
--  5. public.video_asset_transition(...): the single write path (row lock, validate, update, append the event, idempotent when the asset is already in the target state).
--
-- Safety properties kept by the database itself, not only by application code:
--  - `ready` and `published` exist only together with moderation_state = 'approved' (CHECK).
--  - deleted_at is set exactly when the state is `deleted`, and nothing leaves `deleted`.
--  - Row level security is ON with no policy; anon and authenticated have no grant; only the service role (the server) reads or writes, and it can append to the
--    history but neither edit nor erase it. Deleting an account still removes its rows (the foreign key cascade runs inside the database).
-- Object keys, buckets and job ids are filled in by later parts of the plan; the 5-minute length rule lives in code (src/lib/config/product.ts), not here.
-- Rollback: rollback/20261111_video_assets_rollback.sql.

CREATE TABLE IF NOT EXISTS public.video_assets (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id              uuid        NULL,
  state                  text        NOT NULL DEFAULT 'draft',
  moderation_state       text        NOT NULL DEFAULT 'pending',
  source_bucket          text        NULL,
  source_object_key      text        NULL,
  staging_manifest_key   text        NULL,
  delivery_manifest_key  text        NULL,
  download_object_key    text        NULL,
  duration_ms            integer     NULL,
  width                  integer     NULL,
  height                 integer     NULL,
  transcode_job_id       text        NULL,
  overlay_version        integer     NOT NULL DEFAULT 0,
  idempotency_key        text        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz NULL,
  CONSTRAINT video_assets_state_check CHECK (state IN
    ('draft','uploading','uploaded','processing','moderating','review_required','ready','published','rejected','failed','deleted')),
  CONSTRAINT video_assets_moderation_state_check CHECK (moderation_state IN ('pending','approved','review_required','rejected')),
  CONSTRAINT video_assets_idempotency_key_check CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  CONSTRAINT video_assets_visible_needs_approval CHECK (state NOT IN ('ready','published') OR moderation_state = 'approved'),
  CONSTRAINT video_assets_deleted_at_matches_state CHECK ((state = 'deleted') = (deleted_at IS NOT NULL)),
  CONSTRAINT video_assets_positive_numbers CHECK (
    (duration_ms IS NULL OR duration_ms > 0) AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0) AND overlay_version >= 0),
  CONSTRAINT video_assets_owner_idempotency_unique UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS video_assets_owner_created_idx ON public.video_assets (owner_id, created_at DESC);
-- The reconciliation sweep (jobs stuck in a working state) reads only the in-flight rows.
CREATE INDEX IF NOT EXISTS video_assets_in_flight_idx ON public.video_assets (updated_at)
  WHERE state IN ('uploading','uploaded','processing','moderating');
CREATE INDEX IF NOT EXISTS video_assets_review_idx ON public.video_assets (review_id) WHERE review_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.video_asset_events (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id       uuid        NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
  from_state     text        NULL,
  to_state       text        NOT NULL,
  event_type     text        NOT NULL,
  actor          text        NOT NULL,
  reason         text        NULL,
  correlation_id text        NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_asset_events_actor_check CHECK (btrim(actor) <> ''),
  CONSTRAINT video_asset_events_event_type_check CHECK (btrim(event_type) <> '')
);
CREATE INDEX IF NOT EXISTS video_asset_events_asset_idx ON public.video_asset_events (asset_id, id);

-- THE transition table. Keep it identical to TRANSITIONS in src/lib/media/video/assetState.ts (the test compares every pair).
CREATE OR REPLACE FUNCTION public.video_asset_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM (VALUES
        ('draft','uploading'), ('draft','deleted'),
        ('uploading','uploaded'), ('uploading','failed'), ('uploading','deleted'),
        ('uploaded','processing'), ('uploaded','failed'), ('uploaded','deleted'),
        ('processing','moderating'), ('processing','failed'), ('processing','deleted'),
        ('moderating','ready'), ('moderating','review_required'), ('moderating','rejected'), ('moderating','failed'), ('moderating','deleted'),
        ('review_required','ready'), ('review_required','rejected'), ('review_required','deleted'),
        ('ready','published'), ('ready','review_required'), ('ready','deleted'),
        ('published','review_required'), ('published','rejected'), ('published','deleted'),
        ('rejected','review_required'), ('rejected','deleted'),
        ('failed','uploaded'), ('failed','processing'), ('failed','moderating'), ('failed','deleted')
      ) AS t(f, t)
     WHERE t.f = p_from AND t.t = p_to
  );
$fn$;

CREATE OR REPLACE FUNCTION public.video_assets_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'video_assets: owner_id, idempotency_key and created_at cannot change' USING ERRCODE = '23514';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT public.video_asset_transition_allowed(OLD.state, NEW.state) THEN
    RAISE EXCEPTION 'video_assets: cannot go from "%" to "%"', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS video_assets_guard ON public.video_assets;
CREATE TRIGGER video_assets_guard BEFORE UPDATE ON public.video_assets
  FOR EACH ROW EXECUTE FUNCTION public.video_assets_guard();

-- The single write path. SECURITY DEFINER so the server (service role) needs no table-level UPDATE on the history; callers: the service role only.
CREATE OR REPLACE FUNCTION public.video_asset_transition(
  p_asset            uuid,
  p_to               text,
  p_event_type       text,
  p_actor            text,
  p_reason           text DEFAULT NULL,
  p_correlation      text DEFAULT NULL,
  p_moderation_state text DEFAULT NULL
)
RETURNS TABLE (asset_id uuid, state text, moderation_state text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v      public.video_assets%ROWTYPE;
  v_from text;
BEGIN
  IF btrim(COALESCE(p_actor, '')) = '' OR btrim(COALESCE(p_event_type, '')) = '' THEN
    RAISE EXCEPTION 'video_asset_transition: actor and event type are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: the asset is already where the caller wants it (a retry, a duplicate callback). Nothing changes, no second event.
  IF v.state = p_to AND (p_moderation_state IS NULL OR p_moderation_state = v.moderation_state) THEN
    RETURN QUERY SELECT v.id, v.state, v.moderation_state, false;
    RETURN;
  END IF;

  v_from := v.state;
  UPDATE public.video_assets a
     SET state            = p_to,
         moderation_state = COALESCE(p_moderation_state, a.moderation_state),
         deleted_at       = CASE WHEN p_to = 'deleted' THEN COALESCE(a.deleted_at, now()) ELSE a.deleted_at END
   WHERE a.id = p_asset;

  INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason, correlation_id)
  VALUES (p_asset, v_from, p_to, p_event_type, p_actor, p_reason, p_correlation);

  RETURN QUERY SELECT a.id, a.state, a.moderation_state, true FROM public.video_assets a WHERE a.id = p_asset;
END;
$fn$;

-- Access: the server only.
ALTER TABLE public.video_assets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_asset_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.video_assets       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.video_asset_events FROM PUBLIC, anon, authenticated, service_role;
GRANT  ALL ON public.video_assets       TO service_role;
GRANT  SELECT, INSERT ON public.video_asset_events TO service_role;

REVOKE EXECUTE ON FUNCTION public.video_asset_transition_allowed(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_transition_allowed(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_assets_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.video_asset_transition(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_transition(uuid, text, text, text, text, text, text) TO service_role;
