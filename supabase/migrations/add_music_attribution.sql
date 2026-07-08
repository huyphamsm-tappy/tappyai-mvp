-- ============================================================================
-- Music attribution — for curated CC-BY tracks (Tier 1, e.g. Jamendo).
-- CC-BY REQUIRES crediting the artist + license, so store both + the source URL.
-- Additive & idempotent.
-- ============================================================================
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS license    TEXT,  -- e.g. 'CC-BY 3.0'
  ADD COLUMN IF NOT EXISTS source_url TEXT;  -- canonical page for attribution/link

-- Prevent duplicate re-ingestion of the same source track.
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_source_url_uidx
  ON public.music_tracks (source_url) WHERE source_url IS NOT NULL;
