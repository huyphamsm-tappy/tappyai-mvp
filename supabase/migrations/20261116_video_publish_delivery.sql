-- Explore video, publishing + delivery slice (ADR rev.1 §B1 / rev.2): publishing a video into a post, and taking its delivery copy down again. Builds on
-- 20261111 / 20261112 / 20261113. All additive; nothing reads it until the video routes are switched on (EXPLORE_VIDEO_PIPELINE_ENABLED).
--
-- The DDL of `reviews` is NOT under migrations, so `reviews` is neither altered nor given a foreign key. The post carries the video through its media_url (the manifest URL on
-- the CDN host, whose path names the asset); the asset points back at the post through video_assets.review_id (already there, 20261111).
--
-- What it adds:
--  1. video_assets.delivery_removed_at / delivery_takedown_attempts / delivery_takedown_error: the takedown bookkeeping. A video with delivery_removed_at set cannot be
--     played even if its state still says `published` (the playback route checks it).
--  2. A UNIQUE index on video_assets.review_id: one video per post, so a retried publish can never create or claim a second post.
--  3. public.video_asset_publish(asset, owner, review, actor): ready -> published through video_asset_transition, stamping review_id in the same transaction. Idempotent per
--     (asset, review). Refuses (23514) anything not `ready` and approved, (55000) a video with no live delivery copy, (42501) someone else's video. When the asset already
--     belongs to ANOTHER post it returns that post's id and changes nothing.
--  4. public.video_asset_record_takedown(asset, removed, error): counts a takedown attempt; on success stamps delivery_removed_at and appends ONE history event.
--  5. public.video_assets_due_for_takedown(limit, max_attempts): the videos whose delivery copy must be removed now: every video that left `published`/`ready`, and every
--     `published` video whose post is hidden, held, restricted, or (after a 15 minute grace, the post is written just after the claim) missing. Read through to_jsonb(), so it
--     does not depend on which optional columns `reviews` has.
-- Service role only. Rollback: rollback/20261116_video_publish_delivery_rollback.sql.

ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS delivery_removed_at        timestamptz NULL;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS delivery_takedown_attempts integer     NOT NULL DEFAULT 0;
ALTER TABLE public.video_assets ADD COLUMN IF NOT EXISTS delivery_takedown_error    text        NULL;

ALTER TABLE public.video_assets DROP CONSTRAINT IF EXISTS video_assets_takedown_check;
ALTER TABLE public.video_assets ADD CONSTRAINT video_assets_takedown_check
  CHECK (delivery_takedown_attempts >= 0 AND (delivery_takedown_error IS NULL OR char_length(delivery_takedown_error) <= 64));

CREATE UNIQUE INDEX IF NOT EXISTS video_assets_review_unique_idx ON public.video_assets (review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_assets_delivery_live_idx ON public.video_assets (updated_at)
  WHERE delivery_manifest_key IS NOT NULL AND delivery_removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.video_asset_publish(p_asset uuid, p_owner uuid, p_review uuid, p_actor text)
RETURNS TABLE (asset_id uuid, state text, review_id uuid, changed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v public.video_assets%ROWTYPE;
BEGIN
  IF p_review IS NULL OR btrim(COALESCE(p_actor, '')) = '' THEN
    RAISE EXCEPTION 'video_asset_publish: review and actor are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;
  IF v.owner_id <> p_owner THEN
    RAISE EXCEPTION 'video asset % does not belong to this user', p_asset USING ERRCODE = '42501';
  END IF;

  -- Already published: a retry (same post) or a second post asking for the same video (it gets the first post's id). Nothing changes.
  IF v.state = 'published' THEN
    RETURN QUERY SELECT v.id, v.state, v.review_id, false;
    RETURN;
  END IF;

  IF v.state <> 'ready' OR v.moderation_state <> 'approved' THEN
    RAISE EXCEPTION 'video asset % is not ready to publish', p_asset USING ERRCODE = '23514';
  END IF;
  -- A ready video that already belongs to another post is not handed to a second one.
  IF v.review_id IS NOT NULL AND v.review_id <> p_review THEN
    RETURN QUERY SELECT v.id, v.state, v.review_id, false;
    RETURN;
  END IF;
  IF v.delivery_manifest_key IS NULL OR v.delivery_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'video asset % has no delivery copy', p_asset USING ERRCODE = '55000';
  END IF;

  UPDATE public.video_assets a SET review_id = p_review WHERE a.id = p_asset;
  PERFORM public.video_asset_transition(p_asset, 'published', 'post_published', p_actor, NULL, p_review::text, 'approved');
  RETURN QUERY SELECT a.id, a.state, a.review_id, true FROM public.video_assets a WHERE a.id = p_asset;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.video_asset_record_takedown(p_asset uuid, p_removed boolean, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v public.video_assets%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.video_assets a WHERE a.id = p_asset FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video asset % not found', p_asset USING ERRCODE = 'P0002';
  END IF;
  IF p_removed THEN
    UPDATE public.video_assets a
       SET delivery_takedown_attempts = a.delivery_takedown_attempts + 1,
           delivery_takedown_error    = NULL,
           delivery_removed_at        = COALESCE(a.delivery_removed_at, now())
     WHERE a.id = p_asset;
    IF v.delivery_removed_at IS NULL THEN
      INSERT INTO public.video_asset_events (asset_id, from_state, to_state, event_type, actor, reason)
      VALUES (p_asset, v.state, v.state, 'delivery_removed', 'service:video-takedown', NULL);
    END IF;
  ELSE
    UPDATE public.video_assets a
       SET delivery_takedown_attempts = a.delivery_takedown_attempts + 1,
           delivery_takedown_error    = left(COALESCE(p_error, 'unknown'), 64)
     WHERE a.id = p_asset;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.video_assets_due_for_takedown(p_limit integer, p_max_attempts integer)
RETURNS TABLE (
  id uuid, owner_id uuid, state text, moderation_state text, deleted_at timestamptz, review_id uuid, duration_ms integer, staging_manifest_key text,
  delivery_manifest_key text, delivery_removed_at timestamptz, delivery_takedown_attempts integer, updated_at timestamptz, takedown_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT a.id, a.owner_id, a.state, a.moderation_state, a.deleted_at, a.review_id, a.duration_ms, a.staging_manifest_key,
         a.delivery_manifest_key, a.delivery_removed_at, a.delivery_takedown_attempts, a.updated_at,
         CASE WHEN a.state = 'published' THEN 'post_not_public' ELSE 'state' END
    FROM public.video_assets a
   WHERE a.delivery_manifest_key IS NOT NULL
     AND a.delivery_removed_at IS NULL
     AND a.delivery_takedown_attempts < GREATEST(COALESCE(p_max_attempts, 8), 1)
     AND (
           a.state NOT IN ('ready', 'published')
        OR (a.state = 'published' AND (
              EXISTS (
                SELECT 1 FROM public.reviews r
                 WHERE r.id = a.review_id
                   AND (   COALESCE((to_jsonb(r) ->> 'is_hidden')::boolean, false)
                        OR (to_jsonb(r) ->> 'publication_state') IS NOT NULL AND (to_jsonb(r) ->> 'publication_state') <> 'PUBLISHED')
              )
           OR (NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = a.review_id) AND a.updated_at < now() - interval '15 minutes')
           ))
         )
   ORDER BY a.updated_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.video_asset_publish(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_publish(uuid, uuid, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_asset_record_takedown(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_asset_record_takedown(uuid, boolean, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.video_assets_due_for_takedown(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.video_assets_due_for_takedown(integer, integer) TO service_role;
