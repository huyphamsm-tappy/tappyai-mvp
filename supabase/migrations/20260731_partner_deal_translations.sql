-- ============================================================================
-- Deals i18n V1 — localized partner-deal content (shared by Web, Android, iOS).
--
-- Deal display text (category / title / description) is authored in Vietnamese
-- on partner_deals (the base row = the vi source of truth). This table holds
-- per-locale overrides. The public API resolves a requested locale and falls
-- back field-by-field to the vi base when a translation row/field is absent, so
-- adding a language is data-only (no schema or code change) and a partially
-- translated deal never shows blanks.
--
-- Designed for the future back-office: an admin editor manages one base row +
-- N translation rows per deal. `title` is included but stays NULL for brand
-- partners (Shopee/Grab are never translated) — it exists for future deals
-- whose title is real copy (a campaign name), not a brand.
--
-- Idempotent DDL (safe to re-run). Apply AFTER 20260724_partner_deals*.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS partner_deal_translations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id     UUID NOT NULL REFERENCES partner_deals(id) ON DELETE CASCADE,
    -- BCP-47-ish: 'en', 'vi', or 'en-US' / 'zh-Hant'. Lowercase language, optional
    -- uppercase region. 'vi' rows are allowed but redundant (base row IS vi).
    locale      TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    -- All nullable: a translation may localize only some fields; the rest fall
    -- back to the base (vi) row field-by-field in getActiveDeals.
    category    TEXT,
    title       TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One translation row per (deal, locale). Upsert target for the admin editor.
    UNIQUE (deal_id, locale)
);

-- The public resolver looks up by (deal_id, locale); the unique index above
-- already covers that access path.

-- Keep updated_at fresh on every write (reuse pattern from partner_deals).
CREATE OR REPLACE FUNCTION partner_deal_translations_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_deal_translations_updated_at ON partner_deal_translations;
CREATE TRIGGER trg_partner_deal_translations_updated_at
  BEFORE UPDATE ON partner_deal_translations
  FOR EACH ROW EXECUTE FUNCTION partner_deal_translations_touch_updated_at();

-- RLS: deny-by-default. Public may SELECT a translation ONLY when its parent
-- deal is itself publicly visible. The EXISTS subquery runs under the same anon
-- role, so it respects partner_deals' own RLS (active + in date window) — a
-- translation for a hidden/expired/future deal stays invisible too. All writes
-- go through the service-role admin client (bypasses RLS), so no write policy.
ALTER TABLE partner_deal_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads translations of visible deals" ON partner_deal_translations;
CREATE POLICY "public reads translations of visible deals"
  ON partner_deal_translations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM partner_deals d WHERE d.id = partner_deal_translations.deal_id
    )
  );

-- ---------------------------------------------------------------------------
-- Seed — English translations for the 7 launch partners. Matched to the base
-- rows by partner_slug (the stable, immutable identifier). Runs once (guarded
-- by NOT EXISTS on any 'en' row) so re-applying never clobbers admin edits.
-- title is intentionally omitted (brand names are not translated) → NULL →
-- resolves to the base brand title.
--
-- Editorial note (MFS 3.10): factual, non-superlative copy — no manufactured
-- urgency or unverifiable claims.
-- ---------------------------------------------------------------------------
INSERT INTO partner_deal_translations (deal_id, locale, category, description)
SELECT d.id, 'en', s.category_en, s.description_en
FROM (VALUES
  ('shopee',     'Shopping',  'Online marketplace — everything you need'),
  ('shopeefood', 'Shopping',  'Order food & groceries, delivered to your door'),
  ('tiktok',     'Shopping',  'Shoppertainment right inside TikTok'),
  ('grab',       'Transport', 'Rides, food delivery & parcels'),
  ('be',         'Transport', 'Vietnamese ride-hailing & delivery app'),
  ('agoda',      'Travel',    'Great deals on hotels & flights'),
  ('booking',    'Travel',    'Book stays & accommodation worldwide')
) AS s(slug, category_en, description_en)
JOIN partner_deals d ON d.partner_slug = s.slug
WHERE NOT EXISTS (
  SELECT 1 FROM partner_deal_translations WHERE locale = 'en'
);
