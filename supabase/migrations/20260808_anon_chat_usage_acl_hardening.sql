-- ---------------------------------------------------------------------------
-- anon_chat_usage_increment — bring the ACL and search_path to platform standard
--
-- CORRECTIVE migration. 20260711_anon_chat_usage.sql is left untouched (history is
-- not rewritten); this file is applied immediately after it.
--
-- Grants only + a search_path hardening. No logic, no signature, no schema, no data.
--
-- ---------------------------------------------------------------------------
-- WHY (measured on this project, 2026-08-08, read-only)
-- ---------------------------------------------------------------------------
-- 20260711 ends with:
--     REVOKE ALL ON FUNCTION public.anon_chat_usage_increment() FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.anon_chat_usage_increment() TO authenticated;
--
-- On Supabase a REVOKE FROM PUBLIC does NOT remove `anon`. pg_default_acl in this
-- project grants EXECUTE on every NEW function in `public` to anon, authenticated and
-- service_role EXPLICITLY (confirmed for BOTH the `postgres` and `supabase_admin`
-- grantors):
--     {postgres=X/…, anon=X/…, authenticated=X/…, service_role=X/…}
-- Those are separate ACL entries that REVOKE ... FROM PUBLIC leaves in place. This is
-- the same defect as F-04 (20260807_audit_chain.sql) and BL-C7-01
-- (20260803_platform_owner.sql), both already fixed in production.
--
-- NOT EXPLOITABLE TODAY, which is why this is hygiene rather than a Critical: the
-- function's own first guard is `IF auth.uid() IS NULL THEN RAISE`, and a caller
-- holding only the publishable anon key has no JWT, so auth.uid() is NULL. Measured:
-- a request carrying only `apikey:` runs as the `anon` role (a service_role-only
-- function answers it with 42501). Defence in depth is still the standard here.
--
-- ---------------------------------------------------------------------------
-- WHY `authenticated` KEEPS THE GRANT  (⚠️ verify in Phase 4 before relying on it)
-- ---------------------------------------------------------------------------
-- A Supabase anonymous user is a real `auth.users` row with a real session, so its JWT
-- is expected to carry `role: "authenticated"` plus `is_anonymous: true` — the `anon`
-- role is the NO-SESSION role used when a request presents only the publishable key
-- (verified above). The function additionally requires the is_anonymous claim, so the
-- grant alone is not what authorises the caller.
--
-- ⚠️ This is the ONE fact that could not be verified in Phase 2: minting a real
-- anonymous session requires enabling the provider, which Phase 2 forbids. Phase 4
-- MUST run this check immediately after enabling it and BEFORE any reliance:
--
--     -- with a freshly minted anonymous access token:
--     select current_setting('request.jwt.claims', true)::jsonb
--              -> 'role'          as jwt_role,          -- expect "authenticated"
--            current_setting('request.jwt.claims', true)::jsonb
--              -> 'is_anonymous'  as is_anon;           -- expect true
--
-- If `jwt_role` is anything other than "authenticated", this GRANT is wrong and must be
-- corrected before the feature is enabled. A wrong grant fails CLOSED (42501 → /api/chat
-- falls back to its cookie cap), so it degrades rather than exposing anything.
-- ---------------------------------------------------------------------------

-- 1. Close the inherited anon grant.
REVOKE EXECUTE ON FUNCTION public.anon_chat_usage_increment()
  FROM PUBLIC, anon;

-- 2. Re-assert the only grant the product needs (idempotent; 20260711 already set it).
GRANT EXECUTE ON FUNCTION public.anon_chat_usage_increment()
  TO authenticated;

-- 3. search_path hardening. 20260711 sets `SET search_path = public`, which leaves
--    pg_temp implicitly ahead of it for table lookups. Every reference inside the body
--    is already schema-qualified (public.anon_chat_usage, auth.uid(), auth.jwt()), so
--    this is not exploitable today — but pinning pg_temp LAST is the project standard
--    for SECURITY DEFINER and removes the class of problem entirely.
ALTER FUNCTION public.anon_chat_usage_increment()
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- VERIFICATION — expect exactly this after applying
-- ---------------------------------------------------------------------------
--   SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
--               ELSE a.grantee::regrole::text END AS grantee
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
--   WHERE n.nspname = 'public' AND p.proname = 'anon_chat_usage_increment'
--     AND a.privilege_type = 'EXECUTE'
--   ORDER BY 1;
--
--   Expected: postgres (owner) and authenticated ONLY.
--   Any row naming anon, or grantee 0 (PUBLIC), means the revoke did not take.
-- ---------------------------------------------------------------------------
