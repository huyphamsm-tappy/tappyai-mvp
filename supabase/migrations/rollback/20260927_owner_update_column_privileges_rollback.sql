-- Rollback for 20260927_owner_update_column_privileges.sql.
-- Restores table-wide UPDATE on reviews and profiles for anon and authenticated (the Supabase
-- default grants the tables had before).
-- 🚨 This REOPENS security-audit H1 / M1: owners can again change every column of their own row
-- through PostgREST — including publication_state (undoing moderation) and the counters.
REVOKE UPDATE ON TABLE public.reviews  FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT  UPDATE ON TABLE public.reviews  TO anon, authenticated;
GRANT  UPDATE ON TABLE public.profiles TO anon, authenticated;
