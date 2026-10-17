-- AI data consent: least privilege for the client roles (owner decision 17/10/2026, option A).
--
-- Supabase's default privileges grant every new table in `public` to anon and authenticated (arwdDxtm). 20261018 revoked
-- only INSERT, UPDATE and DELETE, which left SELECT, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on both roles (read-only
-- audit of production, 17/10). No client reads or writes this table: POST /api/ai-consent, the background jobs and group
-- suggestions all use the service role. TRUNCATE also bypasses RLS, and an emptied table would make every iOS account look
-- web-only (fail open). So the client roles get nothing. The select-own policy stays; it has no effect until a
-- GRANT SELECT ... TO authenticated is added back. service_role and postgres are unchanged.
--
-- Rollback: supabase/migrations/rollback/20261019_ai_data_consent_client_acl_rollback.sql

REVOKE ALL ON public.ai_data_consent FROM anon, authenticated;
