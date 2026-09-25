-- ---------------------------------------------------------------------------
-- Account deletion — the two remaining per-user stores that outlive their owner
--
-- F-093 (P1). Additive only: two foreign keys. No column, policy, grant or
-- function changes; no row is deleted by this file.
--
-- GATE: applied to production ONLY under explicit Owner authorization, and only
-- after 20260911b_user_memory_auth_fk.sql (the same defect class, same review).
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- Account deletion is manual: support verifies the request, an operator deletes
-- the Auth user, and every per-user store is expected to follow through its
-- foreign key. /delete-account promises "AI memory" and "Other user-generated
-- content associated with your account" are removed.
--
-- A catalog sweep of the audit database (2026-09-25) found three per-user
-- stores whose owner column carries NO foreign key, so deleting the Auth user
-- deletes nothing in them:
--
--   public.user_memory.user_id        -> fixed by 20260911b (text -> uuid + FK)
--   public.decision_evidence.owner_id -> this file
--   public.anon_chat_usage.user_id    -> this file
--
-- Measured, not inferred: DELETE FROM auth.users inside a rolled-back
-- transaction for four real audit accounts left their decision_evidence rows
-- (3 each) and user_memory row behind; every other per-user table emptied.
-- The audit database already holds 9 decision_evidence rows whose 5 owners no
-- longer exist — the defect has been producing leftovers in normal use.
--
-- decision_evidence documents a 2-hour TTL, but expiry is enforced only on read
-- and reclaimed only by the SAME owner's next save. A deleted owner never saves
-- again, so the TTL never reclaims their rows.
--
-- ---------------------------------------------------------------------------
-- WHY NOT VALID, THEN A CONDITIONAL VALIDATE
-- ---------------------------------------------------------------------------
-- A NOT VALID foreign key is enforced for every new row and its ON DELETE
-- action fires for every future Auth deletion — which is the promise being
-- repaired. VALIDATE additionally proves the rows already present, and fails
-- if any orphan exists. This file does NOT delete orphans: they are data of
-- accounts already deleted, and removing them is an Owner-run purge (below),
-- not a side effect of a schema change. If no orphan exists the constraint is
-- validated here; otherwise it stays NOT VALID and a WARNING names the count.
--
-- OWNER-RUN PURGE (not executed by this file), then re-validate:
--   DELETE FROM public.decision_evidence d
--    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.owner_id);
--   DELETE FROM public.anon_chat_usage a
--    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);
--   ALTER TABLE public.decision_evidence VALIDATE CONSTRAINT decision_evidence_owner_id_fkey;
--   ALTER TABLE public.anon_chat_usage   VALIDATE CONSTRAINT anon_chat_usage_user_id_fkey;
--
-- ---------------------------------------------------------------------------
-- WHAT THE WRITERS SEE
-- ---------------------------------------------------------------------------
-- Both tables are written only by SECURITY DEFINER functions that take the
-- owner from auth.uid(), so the owner always exists at write time. The one new
-- failure is a JWT that outlives its deleted account: the insert now raises
-- 23503 instead of writing an unreachable row. /api/chat already treats a
-- failed decision_evidence_save as non-fatal (route.ts logs and continues).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_orphans bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.decision_evidence'::regclass
                    AND conname  = 'decision_evidence_owner_id_fkey') THEN
    ALTER TABLE public.decision_evidence
      ADD CONSTRAINT decision_evidence_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
    RAISE NOTICE 'deletion gaps: decision_evidence_owner_id_fkey added (ON DELETE CASCADE).';
  END IF;

  SELECT count(*) INTO v_orphans FROM public.decision_evidence d
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.owner_id);
  IF v_orphans = 0 THEN
    ALTER TABLE public.decision_evidence VALIDATE CONSTRAINT decision_evidence_owner_id_fkey;
    RAISE NOTICE 'deletion gaps: decision_evidence_owner_id_fkey validated.';
  ELSE
    RAISE WARNING 'deletion gaps: % decision_evidence row(s) belong to already-deleted accounts; constraint left NOT VALID until the Owner-run purge.', v_orphans;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.anon_chat_usage'::regclass
                    AND conname  = 'anon_chat_usage_user_id_fkey') THEN
    ALTER TABLE public.anon_chat_usage
      ADD CONSTRAINT anon_chat_usage_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
    RAISE NOTICE 'deletion gaps: anon_chat_usage_user_id_fkey added (ON DELETE CASCADE).';
  END IF;

  SELECT count(*) INTO v_orphans FROM public.anon_chat_usage a
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);
  IF v_orphans = 0 THEN
    ALTER TABLE public.anon_chat_usage VALIDATE CONSTRAINT anon_chat_usage_user_id_fkey;
    RAISE NOTICE 'deletion gaps: anon_chat_usage_user_id_fkey validated.';
  ELSE
    RAISE WARNING 'deletion gaps: % anon_chat_usage row(s) belong to already-deleted accounts; constraint left NOT VALID until the Owner-run purge.', v_orphans;
  END IF;
END $$;
