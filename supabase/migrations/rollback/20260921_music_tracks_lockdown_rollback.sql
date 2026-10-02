-- ---------------------------------------------------------------------------
-- ROLLBACK of 20260921_music_tracks_lockdown.sql
--
-- Restores the ordinary-role policies and table grants on music_tracks to their
-- state before the lockdown (the post-20260818b world). No data change; RLS was
-- and stays enabled.
--
-- NOTE: the RESTRICTIVE publication-boundary policy depends on
-- public.fn_original_sound_is_servable(uuid), which the lockdown migration did
-- NOT drop — so it is still present and this recreation succeeds. Idempotent.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.music_tracks TO anon, authenticated;

-- Permissive SELECT (20260704).
DROP POLICY IF EXISTS "Anyone can read active music tracks" ON public.music_tracks;
CREATE POLICY "Anyone can read active music tracks"
  ON public.music_tracks FOR SELECT
  USING (is_active);

-- Restrictive publication boundary (20260818b).
DROP POLICY IF EXISTS music_tracks_publication_boundary ON public.music_tracks;
CREATE POLICY music_tracks_publication_boundary
  ON public.music_tracks
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (public.fn_original_sound_is_servable(id));

-- INSERT — publish own original sound (add_original_sound_ugc).
DROP POLICY IF EXISTS "Users publish own original sound" ON public.music_tracks;
CREATE POLICY "Users publish own original sound"
  ON public.music_tracks FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND music_type = 'original_sound'
    AND rights_confirmed = true
  );

-- UPDATE — uploader soft-deletes own track (add_original_sound_ugc).
DROP POLICY IF EXISTS "Uploader can deactivate own track" ON public.music_tracks;
CREATE POLICY "Uploader can deactivate own track"
  ON public.music_tracks FOR UPDATE
  USING (auth.uid() = uploaded_by)
  WITH CHECK (auth.uid() = uploaded_by);
