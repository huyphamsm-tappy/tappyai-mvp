-- Music Module V1 — standalone schema.
--
-- This module is feature-agnostic: entity_type/entity_id in music_usage are
-- opaque strings/uuids, never foreign keys into feature tables (reviews,
-- stories, etc.). Consuming features store their own selection
-- (track_id, start_sec, volume) on their own rows — Music never learns what
-- a "review" is. See src/modules/music for the module boundary.

-- 1. music_providers — licensor/source of a track (licensing risk mitigation).
--    Minimal V1 seed only; no external service integration.
CREATE TABLE IF NOT EXISTS public.music_providers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.music_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read music providers"
  ON public.music_providers FOR SELECT
  USING (true);

INSERT INTO public.music_providers (slug, name) VALUES
  ('internal', 'Internal'),
  ('pixabay',  'Pixabay')
ON CONFLICT (slug) DO NOTHING;

-- 2. music_categories — curated, ordered, toggleable, localized labels.
--    A category is curated content (needs order + on/off + i18n), not a bare
--    enum string, so a lookup table is used instead of a text column.
CREATE TABLE IF NOT EXISTS public.music_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "vi": "...", "en": "...", "ja": "..." }
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.music_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active music categories"
  ON public.music_categories FOR SELECT
  USING (is_active);

CREATE INDEX IF NOT EXISTS music_categories_sort_idx
  ON public.music_categories (sort_order);

-- 3. music_tracks — the catalog. title/artist are proper nouns and are NOT
--    localized (a song title doesn't change per UI language).
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  artist        TEXT,
  duration_sec  INTEGER NOT NULL,
  audio_url     TEXT NOT NULL,
  preview_url   TEXT, -- short pre-cut clip; null falls back to audio_url
  cover_url     TEXT,
  category_id   UUID REFERENCES public.music_categories(id),
  provider_id   UUID REFERENCES public.music_providers(id),
  is_active     BOOLEAN NOT NULL DEFAULT true, -- licensing kill-switch
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active music tracks"
  ON public.music_tracks FOR SELECT
  USING (is_active);

CREATE INDEX IF NOT EXISTS music_tracks_category_idx
  ON public.music_tracks (category_id);

CREATE INDEX IF NOT EXISTS music_tracks_provider_idx
  ON public.music_tracks (provider_id);

CREATE INDEX IF NOT EXISTS music_tracks_active_idx
  ON public.music_tracks (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS music_tracks_title_search_idx
  ON public.music_tracks (lower(title));

CREATE INDEX IF NOT EXISTS music_tracks_artist_search_idx
  ON public.music_tracks (lower(artist));

-- 4. music_usage — append-only event log. NOT a state store: selection
--    (start_sec, volume) stays on the consuming feature's own row for the
--    hot read path. This table only records "track X was used by entity Y"
--    so future trending/recommendation/analytics work has history to read,
--    without building any of that now.
CREATE TABLE IF NOT EXISTS public.music_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    UUID REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- opaque to this module, e.g. 'review', 'story'
  entity_id   UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.music_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own music usage"
  ON public.music_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS music_usage_track_idx
  ON public.music_usage (track_id);

CREATE INDEX IF NOT EXISTS music_usage_entity_idx
  ON public.music_usage (entity_type, entity_id);
