-- ============================================================================
-- ROLLBACK for supabase/migrations/20260820_b8_owner_recovery.sql
-- Controller V2 - K-6 / B8 break-glass Owner recovery.
--
-- SAFE ONLY WHILE NO RECOVERY HAS BEEN EXECUTED.
--
-- Dropping the table discards the record of every armed, cancelled and consumed
-- window. The `audit_log` entries survive - they are in a different table and
-- the chain is append-only - but the correlation ids they carry would then
-- point at rows that no longer exist. Check first:
--
--     SELECT id, target_user_id, requested_at, closed_at, outcome
--       FROM public.platform_owner_recovery ORDER BY requested_at;
--
--   * 0 rows            -> rollback is clean.
--   * only 'cancelled'  -> rollback loses the cancellation record. Export first.
--   * any 'consumed'    -> STOP. A recovery has been performed. Do not roll back
--                          without a deliberate decision: ownership itself is
--                          unaffected (it lives in `platform_owner`), but the
--                          evidence of how it moved would be destroyed.
--
-- WHAT THIS ROLLBACK DOES NOT DO, deliberately:
--   * It does NOT revert an ownership change. `platform_owner` is untouched by
--     this file. Undoing a recovery means running the recovery again toward the
--     intended Owner, which is the reversible path the design provides.
--   * It does NOT delete audit rows. Constitution Rule 10: audit entries are
--     never edited or deleted.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_owner_recovery_cancel(UUID, TEXT);
DROP FUNCTION IF EXISTS fn_owner_recovery_execute(UUID);
DROP FUNCTION IF EXISTS fn_owner_recovery_arm(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS fn_owner_recovery_audit(TEXT, UUID, JSONB, JSONB, JSONB);

DROP INDEX IF EXISTS uq_platform_owner_recovery_open;
DROP TABLE IF EXISTS public.platform_owner_recovery;

-- ============================================================================
-- VERIFY (read-only, after rollback)
--
--   SELECT count(*) FROM pg_proc WHERE proname LIKE 'fn_owner_recovery_%';
--   -- Expect: 0.
--
--   SELECT to_regclass('public.platform_owner_recovery');
--   -- Expect: NULL.
--
--   SELECT count(*) FROM platform_owner WHERE active;
--   -- Expect: 1 - ownership is unaffected by this rollback.
-- ============================================================================
