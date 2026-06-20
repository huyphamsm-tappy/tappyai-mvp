-- Place photos cache table
-- Each unique place_id is fetched from Google Places Photos API once ($0.007),
-- then the CDN URL is stored here forever — subsequent lookups are free.
--
-- Run this once in Supabase SQL Editor before deploying the photo feature.

CREATE TABLE IF NOT EXISTS place_photos (
  place_id  TEXT        PRIMARY KEY,
  photo_url TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE place_photos ENABLE ROW LEVEL SECURITY;

-- Allow server-side anon key to read and write (API route uses anon key server-side)
CREATE POLICY "anon_read"   ON place_photos FOR SELECT USING (true);
CREATE POLICY "anon_insert" ON place_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON place_photos FOR UPDATE USING (true);
