-- Rollback for 20261209_authority_takedowns.sql. DROPS the register of takedown requests (legal records): run only if that is intended and after exporting the rows you must keep.
BEGIN;
DROP TRIGGER IF EXISTS authority_takedowns_no_delete ON public.authority_takedowns;
DROP FUNCTION IF EXISTS public.authority_takedowns_no_delete();
DROP TABLE IF EXISTS public.authority_takedowns;
COMMIT;
