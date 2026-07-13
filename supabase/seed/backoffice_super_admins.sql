-- ============================================================================
-- TappyAI Back Office — Phase 0 SEED: initial Super Admin(s)
-- ============================================================================
-- This file is SEPARATE from the schema migration on purpose (owner decision,
-- Phase 0). Production admin UUIDs are NEVER hardcoded in a migration.
--
-- HOW TO USE (owner runs this in the Supabase SQL editor AFTER applying
-- migration 20260713_backoffice_phase0.sql, and BEFORE the Phase 0 code deploys):
--
--   1. Replace the placeholder UUID(s) below with the Supabase auth user id(s)
--      that should become the first Super Admin(s). These are the same UUIDs
--      currently listed in the ADMIN_IDS env var (the deprecated compat layer).
--   2. Run this script. It is idempotent (ON CONFLICT DO NOTHING).
--
-- The first Super Admin can then grant all other roles from /admin/rbac.
-- Bootstrap note: until at least one super_admin row exists here, NO ONE can
-- pass the /admin RBAC gate — this seed is the bootstrap.
-- ============================================================================

INSERT INTO admin_roles (user_id, role, notes)
VALUES
  -- ('00000000-0000-0000-0000-000000000000', 'super_admin', 'Founder — initial seed'),
  -- ('11111111-1111-1111-1111-111111111111', 'super_admin', 'Founder — initial seed'),
  ('REPLACE-WITH-SUPABASE-AUTH-UUID', 'super_admin', 'Initial Super Admin — Phase 0 seed')
ON CONFLICT (user_id, role) DO NOTHING;
