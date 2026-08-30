-- ---------------------------------------------------------------------------
-- PUSH CREDENTIAL OWNERSHIP — one device, one account
--
-- Closes the privacy defect measured on production on 2026-08-29: a browser
-- signed in as one account displayed Web Push notifications addressed to a
-- DIFFERENT account.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY MEASURED (this matters — it changes what the fix must be)
-- ---------------------------------------------------------------------------
-- 2026-08-30, production, read-only:
--
--   notification_subscriptions:  1 row, enabled, provider=webpush
--   credentials claimed by >1 user:  0
--
-- ZERO duplicates. The leak happened with ONE row.
--
-- 🚨 So the failing state is NOT "two accounts claim one endpoint". It is
-- "the one account claiming this endpoint is no longer the account using this
-- browser". Duplicate rows are the ESCALATED form, and reaching it requires the
-- second person to press Subscribe. The OBSERVED form requires them to do
-- nothing at all.
--
-- 🚨 Read that again before trusting this file alone: THE UNIQUE INDEX BELOW
-- WOULD NOT HAVE PREVENTED THE INCIDENT. There was never a second row to
-- conflict with. Anyone who runs "SELECT ... HAVING count(DISTINCT user_id) > 1"
-- gets 0 and concludes there is no problem. There is.
--
-- Two invariants, and only one of them is a database property:
--
--   I1  no two ENABLED rows share a credential      → enforced here
--   I2  the enabled row for this browser's          → NOT enforceable here.
--       credential belongs to the account             The database cannot know
--       currently signed in on that browser           who is signed in. The
--                                                     client must assert it at
--                                                     every session start.
--
-- This migration owns I1 and gives the application the primitive for I2
-- (disown_push_credential). I2's client half ships separately.
--
-- ---------------------------------------------------------------------------
-- WHY THE TRANSFER LIVES IN A TRIGGER RATHER THAN IN THE ROUTE
-- ---------------------------------------------------------------------------
-- /api/notifications/subscribe writes through the RLS-bound client, whose
-- policy is `auth.uid() = user_id`. A route that tried to disable the previous
-- owner's row would have that UPDATE filtered to zero rows AND NO ERROR — the
-- transfer would appear to work and would do nothing. Making the route work
-- would mean handing a user-facing route the service-role key.
--
-- Putting it in a BEFORE trigger instead:
--   · the route keeps the RLS-bound client, and no user-facing route gains
--     service-role;
--   · the transfer happens INSIDE the upsert's own statement, so there is no
--     window in which the device has zero enabled rows;
--   · every writer is covered — a future Android path, a hand-written SQL fix,
--     a route nobody has written yet — not just the one route we remembered.
--
-- The unique index is the BACKSTOP, not the mechanism. If the trigger is ever
-- dropped or disabled, the index turns a silent double-claim into a loud error.
-- That is the failure direction we want.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
-- ---------------------------------------------------------------------------
-- · UNIQUE(user_id, provider) STAYS. One account still holds at most one
--   webpush row, so subscribing on a laptop still overwrites the phone's
--   endpoint. That is a pre-existing limitation ("one account = one device"),
--   it is not made worse here, and widening it belongs in its own change.
--   Together with this file the relationship is a strict 1:1.
-- · The RLS policy `users_manage_own_subscriptions` is untouched. A user still
--   cannot read or write another user's row. The transfer is performed BY THE
--   DATABASE, not by the caller.
-- · No change to notifications, emit.ts's write path, or the dispatch seam.
--
-- Safe to apply section by section (this repository applies SQL to production
-- by hand in the Supabase SQL editor). Every statement is idempotent; re-running
-- the whole file is a no-op.
--
-- REQUIRES the roles `anon` and `authenticated` to exist. REVOKE ... FROM a
-- missing role raises 42704 and aborts, which is intended: a guard that skipped
-- silently would produce a migration that "succeeds" while revoking nothing.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The credential expression
-- ===========================================================================
-- One expression covers both transports, because `subscription_data` already
-- holds `{endpoint, keys}` for Web Push and `{token}` for FCM. Keying on the
-- credential rather than on `provider` is what closes the FCM half of the hole
-- before Android ships, instead of after.
--
-- 🚨 IMMUTABLE and used in an index below. Changing the BODY of this function
-- silently corrupts that index — PostgreSQL will not re-derive it. If the body
-- ever changes, REINDEX notification_subscriptions_one_owner_per_credential in
-- the same migration.
CREATE OR REPLACE FUNCTION public.push_credential(subscription_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(subscription_data ->> 'endpoint', subscription_data ->> 'token')
$$;

COMMENT ON FUNCTION public.push_credential(jsonb) IS
  'The device credential inside a notification_subscriptions row: Web Push endpoint or FCM token. '
  'IMMUTABLE because notification_subscriptions_one_owner_per_credential indexes it.';


-- ===========================================================================
-- 2. Backfill — collapse any pre-existing multi-claim to a single owner
-- ===========================================================================
-- On production 2026-08-30 this is a NO-OP: there are zero duplicated
-- credentials. It runs anyway so the migration is environment-independent —
-- staging, a restored dump, or a future environment may not be as clean, and a
-- migration whose safety depends on a fact measured once is not a migration.
--
-- "Most recently updated wins" is the right rule: `updated_at` is bumped by the
-- existing trg_notif_subs_updated_at on every re-subscribe, so it names the
-- account that most recently proved it was sitting at that device.
--
-- The tie-break then falls to created_at and finally to the row id. Be precise
-- about what that buys: with every timestamp tied, WHICH account survives is
-- arbitrary — the row id is a random UUID, not a rank. What it guarantees is
-- that the answer is the same every time this file is re-run over the same
-- rows, which is the property that matters when migrations are applied by hand
-- and files get re-run. There is a test for exactly that, and none asserting a
-- particular account wins a total tie.
--
-- Losers are DISABLED, never deleted. The row is history — push_status on past
-- notifications refers to it.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY public.push_credential(subscription_data)
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rn
    FROM public.notification_subscriptions
   WHERE enabled
     AND public.push_credential(subscription_data) IS NOT NULL
)
UPDATE public.notification_subscriptions AS s
   SET enabled = false
  FROM ranked
 WHERE s.id = ranked.id
   AND ranked.rn > 1;


-- ===========================================================================
-- 3. I1 — at most one ENABLED claim per credential
-- ===========================================================================
-- Partial on `enabled` on purpose. A disabled row is HISTORY, not a claim; only
-- an enabled row asserts "this device is mine". Without the partial clause a
-- transfer could never be recorded at all, because the previous owner's row
-- would keep colliding with the new one forever.
--
-- NULL credentials are not indexed (a row whose subscription_data has neither
-- key). The route rejects those on the way in; this index simply does not
-- pretend to be that validation.
--
-- Note for reviewers: this is a btree over the credential text. Real endpoints
-- are 100–300 bytes; btree's per-row limit is ~2704. An endpoint longer than
-- that is rejected with an index-size error rather than stored. That is
-- fail-closed and no real push service issues one, but it is a behaviour a
-- route-level length bound should own rather than leave to the index.
CREATE UNIQUE INDEX IF NOT EXISTS notification_subscriptions_one_owner_per_credential
  ON public.notification_subscriptions (public.push_credential(subscription_data))
  WHERE enabled;


-- ===========================================================================
-- 4. Ownership transfer
-- ===========================================================================
-- SECURITY DEFINER is load-bearing, not decorative: the caller is the RLS-bound
-- `authenticated` role, and this UPDATE deliberately touches ANOTHER user's
-- row. Run as the invoker it would be filtered to zero rows by
-- `users_manage_own_subscriptions` and report success.
--
-- 🚨 This relies on the definer (the table owner) not being subject to the
-- table's own RLS. If notification_subscriptions is ever switched to FORCE ROW
-- LEVEL SECURITY, this UPDATE silently stops transferring and the leak returns
-- with every test still green. There is a test pinning relforcerowsecurity for
-- exactly that reason.
--
-- No recursion: the inner UPDATE sets enabled = false, so the WHEN (NEW.enabled)
-- clause on the trigger below refuses to fire for the rows it touches.
CREATE OR REPLACE FUNCTION public.notification_subscriptions_enforce_single_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  cred text := public.push_credential(NEW.subscription_data);
BEGIN
  IF cred IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notification_subscriptions
     SET enabled = false
   WHERE enabled
     AND id <> NEW.id
     AND public.push_credential(subscription_data) = cred;

  RETURN NEW;
END;
$fn$;

-- A trigger function is not callable through PostgREST, but the platform grants
-- EXECUTE on every new function to PUBLIC, anon, authenticated AND service_role
-- (see 20260807_platform_owner_revoke_public_execute.sql). Revoked so the ACL
-- matches the intent rather than the default.
REVOKE EXECUTE ON FUNCTION public.notification_subscriptions_enforce_single_owner()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_notif_subs_single_owner ON public.notification_subscriptions;
CREATE TRIGGER trg_notif_subs_single_owner
  BEFORE INSERT OR UPDATE OF subscription_data, enabled
  ON public.notification_subscriptions
  FOR EACH ROW
  WHEN (NEW.enabled)
  EXECUTE FUNCTION public.notification_subscriptions_enforce_single_owner();


-- ===========================================================================
-- 5. disown_push_credential — the primitive the client needs for I2
-- ===========================================================================
-- Answers one question and performs one act, together, because "check, then
-- act" across two round trips is another race:
--
--   · disable every enabled row for this credential that is NOT the caller's;
--   · return whether the caller has an enabled row for it.
--
-- 🚨 The caller's identity comes from auth.uid() and from nowhere else. There is
-- deliberately no p_user_id parameter — the same rule the subscribe route's own
-- test pins ("never lets the request body decide who the subscription belongs
-- to"). A parameter would let anyone disown anyone.
--
-- WHAT IT CAN AND CANNOT DO. It only ever DISABLES: it can never enable, create,
-- or move a claim to the caller. So the whole of its power is "silence the
-- device named by this credential".
--
-- 🚨 BE PRECISE ABOUT WHAT AN ENDPOINT IS WORTH — an earlier draft of this
-- comment was wrong about it. A raw Web Push endpoint does NOT let its holder
-- send a push: that needs the VAPID PRIVATE key the subscription was created
-- against, plus the subscription's p256dh/auth keys to encrypt the payload, and
-- none of those is in the endpoint. So the endpoint is not a send capability,
-- and "they could already push anyway" is not an argument this function may
-- lean on.
--
-- It is still a sensitive device identifier, and in THIS context it is precisely
-- the thing that grants the one power above. That makes an unrestricted caller a
-- denial-of-push surface, which is why:
--
--   · EXECUTE is granted to `authenticated` and to nobody else (below), and
--   · 🚨 THAT IS NOT SUFFICIENT ON ITS OWN. A Supabase ANONYMOUS session is a
--     real auth.users row whose JWT role is `authenticated`, so it satisfies
--     this grant and has a non-null auth.uid(). Excluding it is an API-layer
--     decision, made in the route (POST /api/notifications/subscribe/reconcile
--     refuses `is_anonymous` callers with 403). Applying this migration WITHOUT
--     that route leaves the function reachable by any visitor session.
CREATE OR REPLACE FUNCTION public.disown_push_credential(p_credential text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_credential IS NULL OR length(p_credential) = 0 THEN
    RAISE EXCEPTION 'credential required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_subscriptions
     SET enabled = false
   WHERE enabled
     AND user_id <> caller
     AND public.push_credential(subscription_data) = p_credential;

  RETURN EXISTS (
    SELECT 1
      FROM public.notification_subscriptions
     WHERE enabled
       AND user_id = caller
       AND public.push_credential(subscription_data) = p_credential
  );
END;
$fn$;

COMMENT ON FUNCTION public.disown_push_credential(text) IS
  'Release this device credential from any account other than the caller, and report whether the '
  'caller still owns it. Disables only; never enables, creates or transfers to the caller.';

-- Minimum grant: a signed-in user, and nobody else.
--
-- 🚨 service_role MUST be named in the REVOKE. Supabase's
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS
--     TO anon, authenticated, service_role
-- gives this function an EXPLICIT service_role grant at creation, so revoking
-- only PUBLIC/anon/authenticated leaves it callable with the service key. This
-- was caught by the ACL test, not by review — which is the whole reason that
-- test asserts has_function_privilege rather than reading the file.
--
-- Not service_role by design: no server-side path needs this, and the
-- application must not acquire a habit of reaching it with the service key.
REVOKE EXECUTE ON FUNCTION public.disown_push_credential(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disown_push_credential(text) TO authenticated;


-- ---------------------------------------------------------------------------
-- VERIFICATION — run after applying, expect exactly these results
-- ---------------------------------------------------------------------------
-- (a) The index exists and is partial + unique:
--       SELECT indexdef FROM pg_indexes
--        WHERE indexname = 'notification_subscriptions_one_owner_per_credential';
--     → CREATE UNIQUE INDEX ... WHERE (enabled)
--
-- (b) No credential is claimed twice (expect ZERO rows, on any environment):
--       SELECT public.push_credential(subscription_data), count(*)
--         FROM public.notification_subscriptions WHERE enabled
--        GROUP BY 1 HAVING count(*) > 1;
--
-- (c) ACL is the intent, not the default (expect f, f, f, t):
--       SELECT has_function_privilege('anon',          'public.disown_push_credential(text)', 'EXECUTE'),
--              has_function_privilege('public',        'public.disown_push_credential(text)', 'EXECUTE'),
--              has_function_privilege('service_role',  'public.disown_push_credential(text)', 'EXECUTE'),
--              has_function_privilege('authenticated', 'public.disown_push_credential(text)', 'EXECUTE');
--
-- (d) The trigger is attached and enabled (expect 'O'):
--       SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_notif_subs_single_owner';
--
-- KILL SWITCH. If the transfer must be stopped in production, disable the
-- trigger AND drop the index together:
--       ALTER TABLE public.notification_subscriptions DISABLE TRIGGER trg_notif_subs_single_owner;
--       DROP INDEX IF EXISTS notification_subscriptions_one_owner_per_credential;
-- 🚨 Disabling only the trigger is NOT a safe half-measure: the index would then
-- reject the second account's subscribe with a unique violation the route
-- surfaces as a 500, instead of transferring. Both, or neither.
-- ---------------------------------------------------------------------------
