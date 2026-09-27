-- Rollback for 20260928_revoke_reviews_insert.sql.
-- Restores INSERT on reviews for anon and authenticated (the Supabase default grant it had).
-- 🚨 This REOPENS the INSERT half of security-audit H1: a signed-in user can again create a row
-- through PostgREST with publication_state 'PUBLISHED', is_verified true and any counters.
-- Only needed if the code that writes with the service role has to be rolled back too.
GRANT INSERT ON TABLE public.reviews TO anon, authenticated;
