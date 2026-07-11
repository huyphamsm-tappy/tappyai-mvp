-- ============================================================================
-- Combined Music UGC migration — run once in Supabase SQL Editor
-- ============================================================================
-- Idempotent: safe to re-run. Applies all missing music UGC structure
-- (music_type, play_count, uploaded_by, rights_confirmed, saved/followed
-- tables, INSERT policy) and retroactively registers original sounds for
-- existing upload clips that don't have one yet.
-- ============================================================================

-- 1. music_type column + constraint
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

-- 2. play_count + increment function
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

-- 3. Provenance + consent columns
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rights_confirmed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS music_tracks_uploaded_by_idx ON public.music_tracks (uploaded_by);

-- 4. RLS: let signed-in users publish their own original sounds
DROP POLICY IF EXISTS "Users publish own original sound" ON public.music_tracks;
CREATE POLICY "Users publish own original sound"
  ON public.music_tracks FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND music_type = 'original_sound'
    AND rights_confirmed = true
  );

DROP POLICY IF EXISTS "Uploader can deactivate own track" ON public.music_tracks;
CREATE POLICY "Uploader can deactivate own track"
  ON public.music_tracks FOR UPDATE
  USING (auth.uid() = uploaded_by)
  WITH CHECK (auth.uid() = uploaded_by);

-- 5. music_saved table
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

-- 6. music_followed table
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

-- 7. music_track_reports table (copyright/abuse)
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

DROP POLICY IF EXISTS "Users can file a report" ON public.music_track_reports;
CREATE POLICY "Users can file a report"
  ON public.music_track_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS music_track_reports_track_idx  ON public.music_track_reports (track_id);
CREATE INDEX IF NOT EXISTS music_track_reports_status_idx ON public.music_track_reports (status) WHERE status = 'open';

-- 8. Retroactively register original sounds for existing upload clips
-- Creates a music_track per clip that has video content but no music registered yet.
DO $$
DECLARE
  internal_provider_id UUID;
  r RECORD;
  new_track_id UUID;
BEGIN
  SELECT id INTO internal_provider_id FROM public.music_providers WHERE slug = 'internal';
  IF internal_provider_id IS NULL THEN
    RAISE NOTICE 'No internal provider found — skipping retroactive registration';
    RETURN;
  END IF;

  FOR r IN
    SELECT rev.id, rev.media_url, rev.thumbnail, rev.user_id, p.full_name
    FROM public.reviews rev
    LEFT JOIN public.profiles p ON p.id = rev.user_id
    WHERE rev.content_type = 'video'
      AND (rev.source_type = 'upload' OR rev.source_type IS NULL)
      AND rev.media_url IS NOT NULL
      AND rev.music IS NULL
  LOOP
    INSERT INTO public.music_tracks
      (title, artist, duration_sec, audio_url, preview_url, cover_url,
       provider_id, music_type, uploaded_by, rights_confirmed, is_active)
    VALUES
      ('Âm thanh gốc', r.full_name, 15, r.media_url, r.media_url, r.thumbnail,
       internal_provider_id, 'original_sound', r.user_id, true, true)
    RETURNING id INTO new_track_id;

    UPDATE public.reviews
    SET music = jsonb_build_object(
      'version', 1,
      'trackId', new_track_id,
      'startSec', 0,
      'volume', 1,
      'origin', 'original'
    )
    WHERE id = r.id;
  END LOOP;
END $$;
