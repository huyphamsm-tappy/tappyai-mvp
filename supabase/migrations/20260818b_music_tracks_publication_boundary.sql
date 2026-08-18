-- ============================================================================
-- MUSIC_TRACKS PUBLICATION BOUNDARY — Phase 0, part 2 (M1)
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- An ORIGINAL sound is not a song that happens to be attached to a clip: it IS
-- the clip. `music_tracks.audio_url` and `preview_url` point at that clip's
-- video file and `cover_url` at its thumbnail. So while `reviews` is the table
-- the content safety gate decides about, `music_tracks` is a second, entirely
-- separate door onto the same bytes.
--
-- Measured anonymously on production 2026-08-18, with the gate already active
-- and the held review already carrying publication_state = 'UNDER_REVIEW':
--
--   GET /api/music/tracks?q=Âm thanh gốc   → the held clip's mp4 as audioUrl
--   GET /api/music/tracks?limit=200        → same
--   GET /rest/v1/music_tracks?id=eq.…      → same, straight from PostgREST
--
-- The music library is also the picker other users choose sounds from, so a
-- held clip's audio was being offered for reuse.
--
-- Fixing the routes cannot close this: the web music picker calls PostgREST
-- directly from the browser (`useMusic.ts` → `musicRepository`), never through
-- an API route. Only a database boundary reaches every caller.
--
-- ============================================================================
-- THREE CASES. THEY MUST NOT BE COLLAPSED.
-- ============================================================================
--   · an originating clip exists and is NOT publishable → do not serve
--   · an originating clip exists and IS publishable     → serve
--   · NO originating clip at all (the clip was deleted) → serve, unchanged
--
-- The third case is not a technicality: 5 of production's 10 original sounds
-- are orphans (measured 2026-08-18) and all 5 return 200 today. Content safety
-- has no opinion about a review that does not exist, and Owner decided
-- explicitly (Option A) that this gate must not touch them.
--
-- ============================================================================
-- 🚨 SECURITY DEFINER IS LOAD-BEARING, NOT STYLE
-- ============================================================================
-- The obvious version of this policy — an inline
-- `EXISTS (SELECT 1 FROM public.reviews …)` — DOES NOT WORK, and fails in the
-- dangerous direction. Measured on a real PostgreSQL:
--
--   policy with inline EXISTS, no SECURITY DEFINER
--     → anon still sees the held track
--
-- because a subquery inside a policy is evaluated with the QUERYING role's row
-- security applied to the referenced table. Once `reviews` has its own
-- publication boundary, `anon` cannot see the held row, so the subquery reports
-- "no originating clip" — i.e. it reports ORPHAN — and the track is served. The
-- safer the database gets, the more this leaks. Hence the definer function.
--
-- ============================================================================
-- 🚨 DO NOT REVOKE EXECUTE FROM anon / authenticated. IT IS NOT AN EXPOSURE.
-- ============================================================================
-- An RLS policy expression runs with the privileges of the role running the
-- query; SECURITY DEFINER changes whose privileges apply INSIDE the body, not
-- whether the caller may invoke it. Revoking EXECUTE therefore does not harden
-- anything — it breaks every read:
--
--   REVOKE EXECUTE … FROM anon;  →  SELECT FROM music_tracks as anon
--     → ERROR 42501: permission denied for function fn_original_sound_is_servable
--
-- That is the entire music library, the sound pages and the composer picker,
-- down. Measured, not assumed.
--
-- This is a deliberate exception to the standing rule that SECURITY DEFINER
-- functions must be revoked from `anon, authenticated`. That rule is about RPCs
-- a user can call to DO something. This function is a policy predicate: it
-- takes a track id and returns one boolean, it performs no action, it returns
-- no row, and the same boolean is already observable from the outside (the
-- sound page 404s and the track is absent from the library). A SECURITY DEFINER
-- sweep that "fixes" this grant will cause an outage.
--
-- ============================================================================
-- PRECONDITION TO VERIFY IMMEDIATELY BEFORE APPLYING
-- ============================================================================
--   SELECT relname, relrowsecurity, relforcerowsecurity
--     FROM pg_class WHERE relname IN ('reviews','music_tracks');
--
-- If `reviews.relforcerowsecurity` is true, STOP and check who owns this
-- function first. With FORCE row security the function's owner is subject to
-- `reviews` policies too; an owner that satisfies no permissive SELECT policy
-- would see zero rows, take the orphan branch, and fail OPEN. With FORCE off
-- (the default) the owner is exempt and the question does not arise.
--
-- ROLLBACK (deletes nothing):
--   DROP POLICY IF EXISTS music_tracks_publication_boundary ON public.music_tracks;
--   DROP FUNCTION IF EXISTS public.fn_original_sound_is_servable(uuid);
-- ============================================================================

-- ── 1. The trusted lookup ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_original_sound_is_servable(p_track uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    -- ORPHAN — no originating clip. Not this gate's subject matter (Option A).
    NOT EXISTS (
      SELECT 1 FROM public.reviews r
       WHERE r.music->>'trackId' = p_track::text
         AND r.music->>'origin'  = 'original')
    -- …or at least one originating clip is publishable.
    OR EXISTS (
      SELECT 1 FROM public.reviews r
       WHERE r.music->>'trackId' = p_track::text
         AND r.music->>'origin'  = 'original'
         AND (r.publication_state IS NULL OR r.publication_state = 'PUBLISHED'));
$$;

COMMENT ON FUNCTION public.fn_original_sound_is_servable(uuid) IS
  'Policy predicate for music_tracks_publication_boundary. SECURITY DEFINER because a policy subquery is otherwise filtered by the querying role''s row security on reviews, which reports a held clip as an orphan. EXECUTE MUST remain granted to anon and authenticated: an RLS expression runs as the querying role, so revoking it makes every read of music_tracks fail with 42501. Returns one boolean, performs no action, discloses no row.';

-- ── 2. EXECUTE — granted on purpose. See the comment above before changing. ──
REVOKE EXECUTE ON FUNCTION public.fn_original_sound_is_servable(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_original_sound_is_servable(uuid) TO anon, authenticated;

-- ── 3. The boundary ─────────────────────────────────────────────────────────
-- RESTRICTIVE, so it narrows the existing permissive policy
-- ("Anyone can read active music tracks", USING (is_active)) without replacing
-- it.
--
-- 🚨 DELIBERATELY NOT `music_type IS DISTINCT FROM 'original_sound' OR …`.
-- That short-circuit looks like a harmless optimisation and is a bypass:
-- `music_type` is ATTACKER-CONTROLLED. `20260711_music_ugc_combined.sql` grants
-- the uploader "Uploader can deactivate own track" — a whole-row UPDATE with
-- `USING (auth.uid() = uploaded_by)` and no column restriction — so the author
-- of a held clip can set their own track's `music_type` to NULL or
-- 'royalty_free' and step straight out of the boundary. Mutation testing found
-- this: weakening the branch to `<>` changed nothing any test could see, which
-- is what a predicate nobody depends on looks like.
--
-- The predicate below reads only inputs the author cannot forge: whether a
-- review exists that names this track as its own audio, and that review's
-- publication state. A library track has no such review, takes the orphan
-- branch and is served exactly as before — so dropping the short-circuit costs
-- nothing but a function call per row.
DROP POLICY IF EXISTS music_tracks_publication_boundary ON public.music_tracks;
CREATE POLICY music_tracks_publication_boundary
  ON public.music_tracks
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (
    public.fn_original_sound_is_servable(id)
  );

COMMENT ON POLICY music_tracks_publication_boundary ON public.music_tracks IS
  'An original sound is its clip: serving the track serves the clip''s video file. Held only while an originating clip exists and is not publishable; an orphaned original sound keeps its prior behaviour (Owner decision, Option A, 2026-08-18).';
