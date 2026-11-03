-- Rollback for 20261001e_banned_identity_hash.sql. Drops the sign-up check, the deletion hook, the hashes and the pepper.
-- (Dropping the pepper makes any exported hash useless; sanctions themselves are untouched.)
BEGIN;
DROP TRIGGER IF EXISTS refuse_banned_identity_update ON auth.users;
DROP TRIGGER IF EXISTS refuse_banned_identity ON auth.users;
DROP TRIGGER IF EXISTS keep_banned_identity ON auth.users;
DROP FUNCTION IF EXISTS safety_private.refuse_banned_identity();
DROP FUNCTION IF EXISTS safety_private.keep_banned_identity();
DROP FUNCTION IF EXISTS public.purge_banned_identities(integer);
DROP FUNCTION IF EXISTS safety_private.identity_hash(text);
DROP FUNCTION IF EXISTS safety_private.normalize_email(text);
DROP TABLE IF EXISTS public.banned_identities;
DROP TABLE IF EXISTS safety_private.identity_pepper;
COMMIT;
