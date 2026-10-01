-- ============================================================================
-- A permanently LOCKED account that is deleted leaves ONE thing behind: a keyed hash of its e-mail address (owner 02/10), so the same
-- address cannot simply sign up again. Nothing else about the person is kept: no e-mail, no name, no id, no content (the strike ledger
-- is separately anonymised — 20261001d).
--
-- GATE: applied to production ONLY under explicit Owner authorization, after 20261001d, after the pg_dump. Inert until someone who is
-- locked is deleted; the sign-up check only matches an address already in the table.
--
-- HOW
--   - the hash is HMAC-SHA256(lower(trim(email)), pepper). The pepper is a random 32-byte value generated here, kept in a table of the
--     private schema `safety_private` (not exposed through the REST API, no client role can read it). Without the pepper the table cannot
--     be reversed by trying known addresses.
--   - BEFORE DELETE on auth.users: if the account is locked (account_status.is_banned, or a standing 'banned' decision on the ledger with
--     no reversed appeal) the hash is recorded. It NEVER blocks a deletion: any error is swallowed.
--   - BEFORE INSERT on auth.users: an address whose hash is in the table is refused with a generic error. A failed LOOKUP never blocks a
--     sign-up (fail open); only a confirmed match does.
--   - lifting it: delete the row (service role). Retention period: the legal minimum is for the owner to confirm with someone who knows
--     Vietnamese law (docs/security/MODERATION-STANDARDS.md §3); `purge_banned_identities(days)` exists to enforce whatever period is set.
--
-- Rollback: rollback/20261001e_banned_identity_hash_rollback.sql
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS safety_private;
REVOKE ALL ON SCHEMA safety_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA safety_private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS safety_private.identity_pepper (
  id     boolean PRIMARY KEY DEFAULT true CHECK (id),
  pepper bytea NOT NULL DEFAULT extensions.gen_random_bytes(32)
);
INSERT INTO safety_private.identity_pepper (id) VALUES (true) ON CONFLICT DO NOTHING;
REVOKE ALL ON TABLE safety_private.identity_pepper FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.banned_identities (
  identity_hash text PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banned_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.banned_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.banned_identities TO service_role;

CREATE OR REPLACE FUNCTION safety_private.identity_hash(p_email text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT encode(hmac(convert_to(lower(btrim(p_email)), 'UTF8'), (SELECT pepper FROM safety_private.identity_pepper WHERE id), 'sha256'), 'hex')
$$;
REVOKE EXECUTE ON FUNCTION safety_private.identity_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION safety_private.identity_hash(text) TO service_role;

CREATE OR REPLACE FUNCTION safety_private.keep_banned_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_locked boolean;
BEGIN
  IF OLD.email IS NULL OR btrim(OLD.email) = '' THEN RETURN OLD; END IF;
  SELECT EXISTS (SELECT 1 FROM public.account_status a WHERE a.user_id = OLD.id AND a.is_banned)
      OR EXISTS (SELECT 1 FROM public.moderation_decisions d
                  WHERE d.subject_user_id = OLD.id AND d.outcome = 'banned'
                    AND NOT EXISTS (SELECT 1 FROM public.moderation_appeals p WHERE p.decision_id = d.id AND p.status = 'reversed'))
    INTO v_locked;
  IF v_locked THEN
    INSERT INTO public.banned_identities (identity_hash) VALUES (safety_private.identity_hash(OLD.email)) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD; -- never block a deletion
END $$;
REVOKE EXECUTE ON FUNCTION safety_private.keep_banned_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS keep_banned_identity ON auth.users;
CREATE TRIGGER keep_banned_identity BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION safety_private.keep_banned_identity();

CREATE OR REPLACE FUNCTION safety_private.refuse_banned_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_hit boolean := false;
BEGIN
  BEGIN
    IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
      SELECT EXISTS (SELECT 1 FROM public.banned_identities b WHERE b.identity_hash = safety_private.identity_hash(NEW.email)) INTO v_hit;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_hit := false; -- a failed lookup never blocks a sign-up
  END;
  IF v_hit THEN RAISE EXCEPTION 'account_unavailable' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION safety_private.refuse_banned_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS refuse_banned_identity ON auth.users;
CREATE TRIGGER refuse_banned_identity BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION safety_private.refuse_banned_identity();

CREATE OR REPLACE FUNCTION public.purge_banned_identities(p_older_than_days integer) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH gone AS (DELETE FROM public.banned_identities WHERE created_at < now() - make_interval(days => GREATEST(p_older_than_days, 1)) RETURNING 1)
  SELECT count(*)::int FROM gone
$$;
REVOKE EXECUTE ON FUNCTION public.purge_banned_identities(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_banned_identities(integer) TO service_role;

COMMIT;
