-- ============================================================================
-- Original Sound (UGC music) — user uploads + rights consent + notice-and-takedown
-- ============================================================================
-- Legal model: users may only upload music they OWN or are licensed to use.
-- Every upload records who uploaded it and an explicit rights confirmation, and
-- anyone can report a track for copyright infringement; the designated copyright
-- agent removes it (is_active=false) within 24–48h. Additive & idempotent.
-- ============================================================================

-- 1. Provenance + consent columns on the catalog -----------------------------
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- explicit "I own/have rights to this and allow TappyAI + other users to use it"
  ADD COLUMN IF NOT EXISTS rights_confirmed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS music_tracks_uploaded_by_idx ON public.music_tracks (uploaded_by);

-- 2. RLS: let a signed-in user publish ONLY their own Original Sound, and only
--    with rights confirmed. (Curated/admin catalog inserts use the service role,
--    which bypasses RLS.) music_tracks already has a SELECT-active policy.
DROP POLICY IF EXISTS "Users publish own original sound" ON public.music_tracks;
CREATE POLICY "Users publish own original sound"
  ON public.music_tracks FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND music_type = 'original_sound'
    AND rights_confirmed = true
  );

-- Uploader may take their own track down (soft-delete via is_active).
DROP POLICY IF EXISTS "Uploader can deactivate own track" ON public.music_tracks;
CREATE POLICY "Uploader can deactivate own track"
  ON public.music_tracks FOR UPDATE
  USING (auth.uid() = uploaded_by)
  WITH CHECK (auth.uid() = uploaded_by);

-- 3. music_track_reports — copyright / abuse reports (notice-and-takedown) -----
CREATE TABLE IF NOT EXISTS public.music_track_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('copyright', 'inappropriate', 'spam', 'other')),
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.music_track_reports ENABLE ROW LEVEL SECURITY;

-- A signed-in user can file a report (as themselves). No SELECT policy → reports
-- are readable only via the service role (the copyright agent's tooling), never
-- exposed to the public.
DROP POLICY IF EXISTS "Users can file a report" ON public.music_track_reports;
CREATE POLICY "Users can file a report"
  ON public.music_track_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS music_track_reports_track_idx  ON public.music_track_reports (track_id);
CREATE INDEX IF NOT EXISTS music_track_reports_status_idx ON public.music_track_reports (status) WHERE status = 'open';
