-- ============================================================================
-- Bug #14 V1 polish — reserve a `metadata` JSONB on partner_deals for future
-- capabilities. Additive, idempotent, backward-compatible. NOT used yet, NOT
-- exposed via the API, NO UI. Placeholder only.
-- ============================================================================

ALTER TABLE partner_deals
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
