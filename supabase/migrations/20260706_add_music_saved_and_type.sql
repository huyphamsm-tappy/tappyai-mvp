-- Phase A (final) — saved/followed tracks, music_type, and a play counter,
-- powering the mini-Spotify sound page (❤️ Lưu, 🔔 Theo dõi, "N người lưu",
-- "Đã phát N lần") and reserving structure for Original Sound / AI music.
--
-- Additive & idempotent: new columns (with defaults) and new tables only.
-- Safe to run once in the Supabase SQL Editor. No data is modified or dropped.

-- 1. music_type on the catalog — design-ready so future track kinds never
--    require a schema refactor. Existing rows become 'royalty_free' (the
--    current SoundHelix demo catalog).
--      royalty_free   — free-to-use library music (today)
--      licensed       — commercially licensed (future label deals)
--      original_sound — audio a user extracted from their own video
--      ai_generated   — music TappyAI generates with AI (future)
--      external        — link-only to Spotify/Apple Music, no file stored (future)
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS music_type TEXT NOT NULL DEFAULT 'royalty_free';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_tracks_music_type_check'
  ) THEN
    ALTER TABLE public.music_tracks
      ADD CONSTRAINT music_tracks_music_type_check
      CHECK (music_type IN ('royalty_free', 'licensed', 'original_sound', 'ai_generated', 'external'));
  END IF;
END $$;

-- 2. play_count — how many times a track's preview has been played. Incremented
--    via the SECURITY DEFINER function below so anonymous listeners can bump it
--    despite music_tracks being read-only under RLS. Future recommendation
--    signals read this directly.
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.music_increment_play(p_track UUID)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE public.music_tracks SET play_count = play_count + 1 WHERE id = p_track;
$$;

GRANT EXECUTE ON FUNCTION public.music_increment_play(UUID) TO anon, authenticated;

-- 3. music_saved — a user bookmarks a track (❤️ Lưu + future "Đã lưu" tab).
CREATE TABLE IF NOT EXISTS public.music_saved (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id   UUID NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, track_id)
);

ALTER TABLE public.music_saved ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own saved tracks select" ON public.music_saved;
CREATE POLICY "own saved tracks select" ON public.music_saved
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own saved tracks insert" ON public.music_saved;
CREATE POLICY "own saved tracks insert" ON public.music_saved
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own saved tracks delete" ON public.music_saved;
CREATE POLICY "own saved tracks delete" ON public.music_saved
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS music_saved_track_idx ON public.music_saved (track_id);
CREATE INDEX IF NOT EXISTS music_saved_user_idx  ON public.music_saved (user_id);

-- 4. music_followed — a user follows a track to be notified when NEW videos use
--    it (🔔 Theo dõi). The toggle + follower count ship now; the "5 video mới"
--    notification delivery is deferred, but the structure is reserved here.
CREATE TABLE IF NOT EXISTS public.music_followed (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id   UUID NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, track_id)
);

ALTER TABLE public.music_followed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own followed tracks select" ON public.music_followed;
CREATE POLICY "own followed tracks select" ON public.music_followed
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own followed tracks insert" ON public.music_followed;
CREATE POLICY "own followed tracks insert" ON public.music_followed
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own followed tracks delete" ON public.music_followed;
CREATE POLICY "own followed tracks delete" ON public.music_followed
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS music_followed_track_idx ON public.music_followed (track_id);
CREATE INDEX IF NOT EXISTS music_followed_user_idx  ON public.music_followed (user_id);
