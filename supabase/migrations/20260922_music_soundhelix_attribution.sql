-- Phase 7 (music licensing audit, 2026-09-22): record the provenance of the 14 SoundHelix
-- demo tracks on the rows themselves, so every surface that shows one shows its credit.
--
-- EVIDENCE (fetched 2026-09-22 from https://www.soundhelix.com/audio-examples — the page
-- answered HTTP 500 with its body intact):
--   "You may use these audio examples in any way you like, but you must give credit to
--    SoundHelix and the artist of the respective song."
--   Table "Title | Artist": SoundHelix Song 1 … 14 — artist "T. Schürger".
-- (https://www.soundhelix.com/license covers the SoundHelix SOFTWARE — GNU GPLv3 — not the
-- example songs; the songs carry the grant above.)
--
-- What this is and is not: an explicit, unrestricted-use grant with ONE condition (credit
-- SoundHelix and the artist). It is an informal site statement, not a formal licence
-- text — no warranty, no versioned terms — so the owner keeps a dated copy of that page
-- with this file. `20260705_seed_music_demo_catalog.sql` had labelled these rows artist
-- "SoundHelix" with invented Vietnamese titles; the credit the grant asks for names the
-- artist, so the rows now carry the real title, the artist, and the source page.
--
-- Scoped by `audio_url` (the self-hosted copies from 20260706c) — touches nothing else.
-- `source_url` is the song's own original object (the page's download link): it is the
-- provenance of THAT file, and `music_tracks_source_url_uidx` needs one value per track.
-- Idempotent. Requires add_music_attribution.sql (license, source_url).
UPDATE public.music_tracks
SET
  title      = 'SoundHelix Song ' || substring(audio_url from '/music/soundhelix-song-(\d+)\.mp3'),
  artist     = 'T. Schürger · SoundHelix',
  license    = 'Free use with credit (SoundHelix audio examples)',
  source_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-'
               || substring(audio_url from '/music/soundhelix-song-(\d+)\.mp3') || '.mp3'
WHERE audio_url ~ '^/music/soundhelix-song-\d+\.mp3$';
