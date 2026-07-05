-- ============================================================================
-- Music Library — demo catalog seed (REPLACEABLE DATA)
-- ============================================================================
-- A small CC0/free catalog (SoundHelix tracks — free to use, range-enabled,
-- plain <audio>-compatible) so the Music Library workflow works end-to-end for
-- MVP. This is DATA, not logic: swap these rows for a licensed catalog before
-- production without touching any application code. Idempotent / re-runnable.
-- ============================================================================

-- Categories -----------------------------------------------------------------
INSERT INTO public.music_categories (slug, label_i18n, sort_order, is_active) VALUES
  ('trending',   '{"vi":"Thịnh hành","en":"Trending"}',   1, true),
  ('chill',      '{"vi":"Chill","en":"Chill"}',           2, true),
  ('upbeat',     '{"vi":"Sôi động","en":"Upbeat"}',       3, true),
  ('acoustic',   '{"vi":"Nhẹ nhàng","en":"Acoustic"}',    4, true),
  ('electronic', '{"vi":"Điện tử","en":"Electronic"}',    5, true),
  ('cinematic',  '{"vi":"Điện ảnh","en":"Cinematic"}',    6, true)
ON CONFLICT (slug) DO UPDATE
  SET label_i18n = EXCLUDED.label_i18n, sort_order = EXCLUDED.sort_order, is_active = true;

-- Tracks (clear the demo set first so re-running stays idempotent) ------------
DELETE FROM public.music_tracks WHERE artist = 'SoundHelix';

INSERT INTO public.music_tracks
  (title, artist, duration_sec, audio_url, preview_url, cover_url, category_id, provider_id, is_active)
SELECT
  v.title, 'SoundHelix', v.dur,
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-' || v.n || '.mp3',
  NULL, NULL,
  (SELECT id FROM public.music_categories WHERE slug = v.cat),
  (SELECT id FROM public.music_providers  WHERE slug = 'internal'),
  true
FROM (VALUES
  (1,  'trending',   'Nhịp Phố',       210),
  (2,  'chill',      'Chiều Lười',     240),
  (3,  'upbeat',     'Bùng Nổ',        195),
  (4,  'acoustic',   'Gió Nhẹ',        260),
  (5,  'electronic', 'Xung Điện',      225),
  (6,  'cinematic',  'Khởi Đầu',       250),
  (7,  'trending',   'Cuốn Theo',      200),
  (8,  'chill',      'Mây Trôi',       270),
  (9,  'upbeat',     'Cháy Hết Mình',  230),
  (10, 'acoustic',   'Sớm Mai',        215),
  (11, 'electronic', 'Ánh Neon',       245),
  (12, 'cinematic',  'Chân Trời',      255),
  (13, 'trending',   'Vibe Cuối Tuần', 220),
  (14, 'chill',      'Thư Giãn',       235)
) AS v(n, cat, title, dur);
