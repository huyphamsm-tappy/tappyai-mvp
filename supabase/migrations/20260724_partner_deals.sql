-- ============================================================================
-- Bug #14 V1 — Partner Deals (admin-managed content, replaces hardcoded DEAL_POOL)
-- Deals become managed DATA, not application code. Admin CRUD writes via the
-- service-role client (bypasses RLS); the public web/mobile clients read through
-- RLS, which enforces active + in-date-window + nothing else.
--
-- Idempotent DDL (safe to re-run). Apply this in Supabase (SQL Editor) BEFORE the
-- V1 code is served, so /api/deals has rows to return. The seed at the bottom
-- inserts the 7 launch partners only when the table is empty.
-- ============================================================================

CREATE TABLE IF NOT EXISTS partner_deals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_name  TEXT NOT NULL,
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    -- official_url must always be HTTPS (validated here AND in the admin API zod).
    official_url  TEXT NOT NULL CHECK (official_url ~ '^https://'),
    banner_image  TEXT,
    logo_image    TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    start_at      TIMESTAMPTZ,
    end_at        TIMESTAMPTZ,
    country_code  TEXT NOT NULL DEFAULT 'VN',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public list query filters (is_active, date window) then sorts by display_order.
CREATE INDEX IF NOT EXISTS idx_partner_deals_active_order
    ON partner_deals (is_active, display_order);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION partner_deals_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_deals_updated_at ON partner_deals;
CREATE TRIGGER trg_partner_deals_updated_at
  BEFORE UPDATE ON partner_deals
  FOR EACH ROW EXECUTE FUNCTION partner_deals_touch_updated_at();

-- RLS: deny-by-default. Public may SELECT only deals that are active, already
-- started, and not yet expired. Inactive/future/expired rows are invisible to
-- the public client. All writes go through the service-role admin client, which
-- bypasses RLS — so no INSERT/UPDATE/DELETE policy is defined (deny-by-default).
ALTER TABLE partner_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads active in-window deals" ON partner_deals;
CREATE POLICY "public reads active in-window deals"
  ON partner_deals FOR SELECT
  USING (
    is_active
    AND (start_at IS NULL OR start_at <= NOW())
    AND (end_at   IS NULL OR end_at   >= NOW())
  );

-- ---------------------------------------------------------------------------
-- Seed — 7 launch partners (official landing pages only; no campaign/seasonal/
-- search URLs). Runs once (only when the table is empty) so re-applying the
-- migration never duplicates or overwrites admin edits.
-- ---------------------------------------------------------------------------
INSERT INTO partner_deals (partner_name, category, title, description, official_url, display_order)
SELECT * FROM (VALUES
  ('Shopee',      'Mua sắm',    'Shopee',      'Sàn mua sắm online — mọi thứ bạn cần',  'https://shopee.vn',                          1),
  ('ShopeeFood',  'Mua sắm',    'ShopeeFood',  'Đặt đồ ăn & đi chợ, giao tận nơi',      'https://shopeefood.vn',                      2),
  ('TikTok Shop', 'Mua sắm',    'TikTok Shop', 'Mua sắm giải trí ngay trên TikTok',     'https://www.tiktok.com/shop',                3),
  ('Grab',        'Vận chuyển', 'Grab',        'Đặt xe, giao đồ ăn & giao hàng',        'https://www.grab.com/vn/',                   4),
  ('Be',          'Vận chuyển', 'Be',          'Ứng dụng gọi xe & giao hàng Việt',      'https://be.com.vn',                          5),
  ('Agoda',       'Du lịch',    'Agoda',       'Đặt khách sạn & vé máy bay giá tốt',    'https://www.agoda.com/vi-vn',                6),
  ('Booking.com', 'Du lịch',    'Booking.com', 'Đặt phòng & chỗ nghỉ khắp thế giới',    'https://www.booking.com/index.vi.html',      7)
) AS seed(partner_name, category, title, description, official_url, display_order)
WHERE NOT EXISTS (SELECT 1 FROM partner_deals);
