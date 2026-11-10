-- Explore video, part VID-03 (ADR rev.1/rev.2): the record of every moderation decision, and the two write paths that turn a video in `moderating` / `review_required` into
-- `ready` / `review_required` / `rejected`. Builds on 20261111 (lifecycle), 20261112 (legal hold) and 20261113 (transcode). All additive; nothing reads it until
-- EXPLORE_VIDEO_PIPELINE_ENABLED is switched on.
--
-- What it adds:
--  1. video_assets.moderation_attempts / moderation_error: how many times the automatic step failed to get an answer from the provider (bounded retries, then a person decides).
--  2. public.video_moderation_results: APPEND-ONLY. One row per automatic decision and per human decision: decision, category, confidence, reason code, provider / model /
--     policy version, the evidence references (object keys, status and scores per kind) and the speech transcript. The transcript and the evidence are kept ONLY server-side:
--     the table has no grant for anon / authenticated, and the service role can append and read but never edit or erase. Deleting an account removes its rows (cascade).
--  3. public.video_moderation_record_auto(...): the automatic decision. One transaction: lock the video, refuse unless it is still `moderating` (so running the step twice
--     writes ONE decision), append the result row, for a suspected child-safety case append a `csam_suspected` event and set a legal hold (video_asset_set_hold), then move
--     the video through video_asset_transition (so the state table and the `ready requires approved` constraint apply).
--  4. public.video_moderation_review_decide(...): a moderator's decision on a `review_required` video: a note is REQUIRED, the same single transaction, idempotent
--     (a video that already left review_required is reported unchanged, no second row).
--  5. public.video_asset_note_event_once(...): appends a history event only if the video has none of that type yet (the "no AI consent" note: a poll must not write it every time).
-- Service role only (REVOKE / GRANT as in 20261111). Rollback: rollback/20261114_video_moderation_rollback.sql.

ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS moderation_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS moderation_error    text    NULL;

ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_moderation_attempts_check;
ALTER TABLE public.video_assets ADD CONSTRAINT video_assets_moderation_attempts_check
  CHECK (moderation_attempts >= 0 AND (moderation_error IS NULL OR char_length(moderation_error) <= 64));

-- The reconciliation sweep reads only the videos waiting for a decision.
CREATE INDEX IF NOT EXISTS video_assets_moderating_idx ON public.video_assets (updated_at) WHERE state = 'moderating';
CREATE INDEX IF NOT EXISTS video_assets_review_required_idx ON public.video_assets (updated_at) WHERE state = 'review_required';

CREATE TABLE IF NOT EXISTS public.video_moderation_results (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id       uuid        NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
  kind           text        NOT NULL,
  decision       text        NOT NULL,
  category       text        NULL,
  confidence     numeric(6,5) NULL,
  reason_code    text        NOT NULL,
  priority       text        NULL,
  provider       text        NULL,
  model          text        NULL,
  policy_version text        NULL,
  evidence       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  transcript     text        NULL,
  actor          text        NOT NULL,
  note           text        NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_moderation_results_kind_check     CHECK (kind IN ('automated', 'human')),
  CONSTRAINT video_moderation_results_decision_check CHECK (decision IN ('approve', 'review_required', 'reject')),
  CONSTRAINT video_moderation_results_priority_check CHECK (priority IS NULL OR priority IN ('normal', 'high', 'urgent')),
  CONSTRAINT video_moderation_results_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT video_moderation_results_reason_check   CHECK (char_length(reason_code) BETWEEN 1 AND 120),
  CONSTRAINT video_moderation_results_actor_check    CHECK (btrim(actor) <> ''),
  CONSTRAINT video_moderation_results_human_note_check CHECK (kind <> 'human' OR btrim(COALESCE(note, '')) <> ''),
  CONSTRAINT video_moderation_results_auto_audit_check CHECK (kind <> 'automated' OR (provider IS NOT NULL AND model IS NOT NULL AND policy_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS video_moderation_results_asset_idx ON public.video_moderation_results (asset_id, id);

-- Appends a history event once per type. Returns true when it wrote the event.
CREATE OR REPLACE FUNCTION public.video_asset_note_event_once(p_asset uuid, p_event_type text, p_actor text, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v public.video_assets%ROWTYPE;
BEGIN
  IF btrim(COALESCE(p_actor, '')) = '' OR btrim(COALESCE(p_event_type, '')) = '' THEN
    RAISE EXCEPTION 'video_asset_note_event_once: actor and event type are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.video_asset_events e WHERE e.asset_id = p_asset AND e.event_type = p_event_type) THEN
    RETURN false;
  END IF;
  INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason)
  VALUES (p_asset, v.state, v.state, p_event_type, p_actor, p_reason);
  RETURN true;
END;
$fn$;

-- The automatic decision. Only the call that finds the video still in `moderating` writes anything.
CREATE OR REPLACE FUNCTION public.video_moderation_record_auto(
  p_asset       uuid,
  p_decision    text,
  p_category    text,
  p_confidence  numeric,
  p_reason      text,
  p_priority    text,
  p_provider    text,
  p_model       text,
  p_policy      text,
  p_evidence    jsonb,
  p_transcript  text,
  p_csam        boolean,
  p_hold_until  timestamptz,
  p_actor       text
)
RETURNS TABLE (asset_id uuid, state text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v        public.video_assets%ROWTYPE;
  v_to     text;
  v_mod    text;
BEGIN
  IF p_decision NOT IN ('approve', 'review_required', 'reject') THEN
    RAISE EXCEPTION 'video_moderation_record_auto: unknown decision' USING ERRCODE = '22023';
  END IF;
  -- A suspected child-safety case is never approved or rejected by the automatic step, and it always carries a hold in the future.
  IF COALESCE(p_csam, false) AND (p_decision <> 'review_required' OR p_hold_until IS NULL OR p_hold_until <= now()) THEN
    RAISE EXCEPTION 'video_moderation_record_auto: a suspected child-safety case needs review_required and a future hold' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already decided (or not in moderation at all). No second row, no second event.
  IF v.state <> 'moderating' THEN
    RETURN QUERY SELECT v.id, v.state, false;
    RETURN;
  END IF;

  INSERT INTO public.video_moderation_results
    (asset_id, kind, decision, category, confidence, reason_code, priority, provider, model, policy_version, evidence, transcript, actor)
  VALUES
    (p_asset, 'automated', p_decision, p_category, p_confidence, p_reason, p_priority, p_provider, p_model, p_policy, COALESCE(p_evidence, '{}'::jsonb), p_transcript, p_actor);

  IF COALESCE(p_csam, false) THEN
    INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason)
    VALUES (p_asset, v.state, v.state, 'csam_suspected', p_actor, p_reason);
    PERFORM public.video_asset_set_hold(p_asset, p_hold_until, p_actor, 'csam_suspected');
  END IF;

  IF p_decision = 'approve' THEN v_to := 'ready'; v_mod := 'approved';
  ELSIF p_decision = 'reject' THEN v_to := 'rejected'; v_mod := 'rejected';
  ELSE v_to := 'review_required'; v_mod := 'review_required';
  END IF;

  PERFORM public.video_asset_transition(p_asset, v_to, 'moderation_' || p_decision, p_actor, p_reason, NULL, v_mod);
  RETURN QUERY SELECT a.id, a.state, true FROM public.video_assets a WHERE a.id = p_asset;
END;
$fn$;

-- A moderator's decision on a video waiting for review. The note is required (also a CHECK on the row).
CREATE OR REPLACE FUNCTION public.video_moderation_review_decide(p_asset uuid, p_decision text, p_note text, p_actor text)
RETURNS TABLE (asset_id uuid, state text, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v      public.video_assets%ROWTYPE;
  v_to   text;
  v_mod  text;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'video_moderation_review_decide: decision must be approve or reject' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_note, '')) = '' OR btrim(COALESCE(p_actor, '')) = '' THEN
    RAISE EXCEPTION 'video_moderation_review_decide: a note and an actor are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: somebody (or a retry) already decided. The caller compares the state it gets back with what it asked for.
  IF v.state <> 'review_required' THEN
    RETURN QUERY SELECT v.id, v.state, false;
    RETURN;
  END IF;

  INSERT INTO public.video_moderation_results (asset_id, kind, decision, reason_code, actor, note)
  VALUES (p_asset, 'human', p_decision, 'human_' || p_decision, p_actor, p_note);

  IF p_decision = 'approve' THEN v_to := 'ready'; v_mod := 'approved';
  ELSE v_to := 'rejected'; v_mod := 'rejected';
  END IF;

  PERFORM public.video_asset_transition(p_asset, v_to, 'human_' || p_decision, p_actor, left(p_note, 500), NULL, v_mod);
  RETURN QUERY SELECT a.id, a.state, true FROM public.video_assets a WHERE a.id = p_asset;
END;
$fn$;

-- Access: the server only. The results table can be appended to and read, never edited or erased by the service role.
ALTER TABLE public.video_moderation_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_moderation_results FROM PUBLIC, anon, authenticated, service_role;
GRANT  SELECT, INSERT ON public.video_moderation_results TO service_role;

REVOKE EXECUTE ON FUNCTION public.video_asset_note_event_once(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_note_event_once(uuid, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_moderation_record_auto(uuid, text, text, numeric, text, text, text, text, text, jsonb, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_moderation_record_auto(uuid, text, text, numeric, text, text, text, text, text, jsonb, text, boolean, timestamptz, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_moderation_review_decide(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_moderation_review_decide(uuid, text, text, text) TO service_role;
