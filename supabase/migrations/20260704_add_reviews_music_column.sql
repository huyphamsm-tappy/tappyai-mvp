-- Additive: lets a Review attach a Music Module selection. Reviews owns this
-- storage per the Music Module's architecture ("features persist their own
-- selection; the Music Module never stores it") — this is Reviews' column,
-- not Music's.
--
-- JSONB (not discrete typed columns) so the domain can grow additively
-- (track snapshot, provider, license, preview metadata, ...) without another
-- migration each time. A `version` field inside the JSON lets the API
-- evolve the payload shape over time.
--
-- Nullable, no default beyond NULL: every existing review keeps music = NULL
-- with zero backfill. No FK to music_tracks, no trigger, no index — shape
-- and existence validation happen in the API layer (src/app/api/reviews/route.ts),
-- which calls the Music Module's own public getTrack()/createSelection()
-- rather than a DB-level constraint, keeping the one-way Reviews -> Music
-- dependency at the application layer where the rest of this module already
-- puts it.
--
-- Current payload shape: { "version": 1, "trackId": "...", "startSec": 12, "volume": 0.8 }

ALTER TABLE public.reviews
  ADD COLUMN music JSONB DEFAULT NULL;
