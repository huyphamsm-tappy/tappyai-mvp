-- ============================================================================
-- Bug #14 V1 hardening — extend partner_deals (backward-compatible, NO data loss).
-- Adds internal identity (partner_slug), classification (partner_type), an
-- affiliate placeholder, a featured flag, and a lightweight click counter.
-- Runs AFTER 20260724_partner_deals.sql (which creates the table + base seed).
-- Fully idempotent: ADD COLUMN IF NOT EXISTS + guarded backfills that NEVER
-- overwrite admin-edited rows.
-- ============================================================================

-- 1. New columns (additive, defaults keep existing rows valid) --------------
ALTER TABLE partner_deals ADD COLUMN IF NOT EXISTS partner_slug   TEXT;
ALTER TABLE partner_deals ADD COLUMN IF NOT EXISTS partner_type   TEXT NOT NULL DEFAULT 'ecommerce';
ALTER TABLE partner_deals ADD COLUMN IF NOT EXISTS affiliate_code TEXT;          -- nullable, no logic yet
ALTER TABLE partner_deals ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partner_deals ADD COLUMN IF NOT EXISTS click_count    INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill the launch partners' slug/type/featured — ONCE. Guarded by
--    partner_slug IS NULL so re-running never clobbers admin edits.
UPDATE partner_deals d SET
  partner_slug = s.slug,
  partner_type = s.ptype,
  is_featured  = s.featured
FROM (VALUES
  ('Shopee',      'shopee',     'ecommerce', TRUE),
  ('ShopeeFood',  'shopeefood', 'food',      TRUE),
  ('TikTok Shop', 'tiktok',     'ecommerce', FALSE),
  ('Grab',        'grab',       'ride',      TRUE),
  ('Be',          'be',         'ride',      FALSE),
  ('Agoda',       'agoda',      'travel',    TRUE),
  ('Booking.com', 'booking',    'travel',    FALSE)
) AS s(name, slug, ptype, featured)
WHERE d.partner_name = s.name AND d.partner_slug IS NULL;

-- Any remaining slug-less rows (admin-added before this migration) get a stable
-- id-derived slug so the NOT NULL + UNIQUE constraints below always hold.
UPDATE partner_deals
  SET partner_slug = 'partner-' || substr(id::text, 1, 8)
  WHERE partner_slug IS NULL;

-- 3. Slug is the permanent identifier: lowercase, unique, required.
ALTER TABLE partner_deals
  DROP CONSTRAINT IF EXISTS partner_deals_slug_lowercase;
ALTER TABLE partner_deals
  ADD CONSTRAINT partner_deals_slug_lowercase CHECK (partner_slug = lower(partner_slug));
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_deals_slug ON partner_deals (partner_slug);
ALTER TABLE partner_deals ALTER COLUMN partner_slug SET NOT NULL;

-- 4. Immutable after creation — reject any UPDATE that changes partner_slug.
CREATE OR REPLACE FUNCTION partner_deals_slug_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.partner_slug IS DISTINCT FROM OLD.partner_slug THEN
    RAISE EXCEPTION 'partner_slug is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_deals_slug_immutable ON partner_deals;
CREATE TRIGGER trg_partner_deals_slug_immutable
  BEFORE UPDATE ON partner_deals
  FOR EACH ROW EXECUTE FUNCTION partner_deals_slug_immutable();

-- 5. Lightweight click counter. Public clients can't UPDATE (RLS), so a
--    SECURITY DEFINER function does the atomic +1 and is granted to anon.
--    This is a popularity counter only — no analytics, no user data.
CREATE OR REPLACE FUNCTION increment_deal_click(p_deal_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE partner_deals SET click_count = click_count + 1 WHERE id = p_deal_id;
$$;

GRANT EXECUTE ON FUNCTION increment_deal_click(uuid) TO anon, authenticated;
