-- Tighten Music Module V1 schema constraints.
--
-- Applied while music_tracks / music_usage are still empty (verified before
-- running), so these are zero-risk to apply now and would require a data
-- backfill/cleanup step if deferred until real content exists.

-- 1. music_tracks.provider_id must always be set: every track needs a known
--    licensor for licensing traceability (the whole reason music_providers
--    exists). A NULL provider_id would silently defeat that guarantee.
ALTER TABLE public.music_tracks
  ALTER COLUMN provider_id SET NOT NULL;

-- 2. music_usage.track_id must always be set: a usage log row that doesn't
--    reference a track carries no meaningful information.
ALTER TABLE public.music_usage
  ALTER COLUMN track_id SET NOT NULL;

-- 3. Guard against invalid duration values (0 or negative), which would
--    silently break any future progress-bar/seek-position math.
ALTER TABLE public.music_tracks
  ADD CONSTRAINT music_tracks_duration_positive CHECK (duration_sec > 0);
