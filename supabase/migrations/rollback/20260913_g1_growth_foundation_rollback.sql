-- Rollback for 20260913_g1_growth_foundation.sql. Drops only what that
-- migration created. DESTRUCTIVE for shared_results content: every public
-- share link (/r/<slug>) stops resolving. Owner authorization required.
DROP FUNCTION IF EXISTS public.fn_shared_result_bump(TEXT, TEXT, INTEGER);
DROP TABLE IF EXISTS public.anon_identity_map;
DROP TABLE IF EXISTS public.shared_results;
