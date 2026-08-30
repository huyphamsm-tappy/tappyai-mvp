-- ============================================================================
-- ROLLBACK for supabase/migrations/20260830_push_credential_ownership.sql
-- Push credential ownership — one device, one account.
--
-- ⚠️⚠️ THIS ROLLBACK IS DELIBERATELY ASYMMETRIC. IT DOES NOT UNDO THE DATA.
--
-- The migration disables competing claims — in the backfill, and afterwards on
-- every ownership transfer. This file does NOT re-enable them, and must not be
-- edited to.
--
-- Re-enabling them would restore exactly the defect the migration exists to
-- close: a row that says "account A owns this device" on a device that account
-- B is now using, so notifications addressed to A are displayed to B. Removing
-- the enforcement is a decision someone may legitimately make; re-creating the
-- privacy bug is not, and it must not happen as a side effect of undoing a
-- schema change.
--
-- The cost of the asymmetry is small and one-directional: a person whose
-- subscription was disabled by a transfer sees push as OFF and turns it back
-- on. Nothing is deleted — every row is still there, `enabled = false`, and the
-- `push_status` recorded on past notifications still refers to it.
--
-- ----------------------------------------------------------------------------
-- WHAT COMES BACK AFTER THIS FILE
-- ----------------------------------------------------------------------------
-- Nothing stops a device from being claimed by two accounts at once again. The
-- next account switch on a shared browser re-opens the leak. If you are running
-- this to escape a production problem, prefer the KILL SWITCH documented at the
-- bottom of the migration (disable the trigger AND drop the index) — it is
-- reversible and leaves the functions in place.
--
-- ----------------------------------------------------------------------------
-- ORDER MATTERS
-- ----------------------------------------------------------------------------
--   1. revert the application first (PR-2: /api/notifications/subscribe/reconcile
--      calls disown_push_credential; with the function dropped it answers 500)
--   2. then run this file
--
-- The reverse order leaves the reconcile endpoint failing for every signed-in
-- client on every page load.
--
-- ----------------------------------------------------------------------------
-- BEFORE RUNNING — record what the enforcement had done, so the decision to
-- leave those rows disabled is auditable rather than invisible:
--
--     SELECT id, user_id, provider, enabled, created_at, updated_at,
--            left(encode(digest(public.push_credential(subscription_data),'sha256'),'hex'), 8)
--              AS credential_hash
--       FROM public.notification_subscriptions
--      WHERE NOT enabled
--      ORDER BY updated_at DESC;
--
-- 🚨 Export the HASH, never the credential. An endpoint does not by itself let
-- its holder send a push — that needs the VAPID private key and the
-- subscription's encryption keys — but it is a device identifier that names one
-- person's browser, and inside this feature it is exactly what
-- disown_push_credential acts on. An export of raw endpoints is a list of
-- devices plus the means to silence each of them.
-- (`digest` needs pgcrypto; on Supabase it lives in the `extensions` schema —
-- use extensions.digest(...) if the bare name does not resolve.)
-- ============================================================================

-- 1. Stop enforcing the transfer.
DROP TRIGGER IF EXISTS trg_notif_subs_single_owner ON public.notification_subscriptions;
DROP FUNCTION IF EXISTS public.notification_subscriptions_enforce_single_owner();

-- 2. Remove the client-facing primitive. Do this only after the application no
--    longer calls it (see ORDER MATTERS above).
DROP FUNCTION IF EXISTS public.disown_push_credential(text);

-- 3. Drop the backstop.
DROP INDEX IF EXISTS public.notification_subscriptions_one_owner_per_credential;

-- 4. The credential expression goes LAST: the index in step 3 depends on it.
--    Kept until here so a partial run cannot leave an index over a missing
--    function.
DROP FUNCTION IF EXISTS public.push_credential(jsonb);

-- 5. NOT DONE, ON PURPOSE — do not add this:
--        UPDATE public.notification_subscriptions SET enabled = true WHERE ...
--    See the header. Rows disabled by the backfill or by an ownership transfer
--    stay disabled.

-- ----------------------------------------------------------------------------
-- VERIFICATION — expect zero rows from all four
-- ----------------------------------------------------------------------------
--   SELECT 1 FROM pg_trigger  WHERE tgname   = 'trg_notif_subs_single_owner';
--   SELECT 1 FROM pg_indexes  WHERE indexname = 'notification_subscriptions_one_owner_per_credential';
--   SELECT 1 FROM pg_proc     WHERE proname  IN ('disown_push_credential',
--                                                'notification_subscriptions_enforce_single_owner',
--                                                'push_credential');
--   -- and the table itself is untouched: same columns, same RLS policy.
--   SELECT 1 FROM pg_policies WHERE tablename = 'notification_subscriptions'
--          AND policyname <> 'users_manage_own_subscriptions';
-- ----------------------------------------------------------------------------
