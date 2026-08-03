-- ============================================================================
-- Controller V2 — Phase 1: PLATFORM OWNER BOOTSTRAP
-- ============================================================================
--
-- Run AFTER 20260803_platform_owner.sql, and only once.
--
-- OWNER CONDITION (approved 2026-08-03):
--   "Bootstrap chỉ được phép khi xác minh có đúng một active super_admin."
--
-- This script enforces that condition itself rather than trusting a prior
-- manual check. It DERIVES the Owner from the sole active super_admin and
-- ABORTS if the count is anything other than exactly 1. No UUID is hardcoded
-- and none is guessed — if production state is ambiguous, this stops and the
-- Owner must be assigned deliberately.
--
-- IDEMPOTENT: re-running after a successful bootstrap is a no-op (it detects
-- the existing active owner and returns without changing anything).
--
-- STEP 0 — READ-ONLY VERIFICATION (run this alone first, confirm the output):
--
--     SELECT COUNT(*) AS active_super_admins
--     FROM admin_roles
--     WHERE role = 'super_admin'
--       AND (expires_at IS NULL OR expires_at > NOW());
--
--   Expected: exactly 1. If not 1, STOP and report — do not run this script.
--
-- STEP 2 — after this script succeeds, read the Owner UUID:
--
--     SELECT user_id FROM platform_owner WHERE active = true;
--
--   Set that value as PLATFORM_OWNER_USER_ID in Vercel (all environments).
--   The Controller asserts it at boot and refuses to serve /admin on mismatch.
-- ============================================================================

DO $$
DECLARE
    v_count INT;
    v_user  UUID;
BEGIN
    -- Already bootstrapped? Then this is a no-op (idempotency).
    IF EXISTS (SELECT 1 FROM platform_owner WHERE active = true) THEN
        RAISE NOTICE 'Platform Owner already assigned (user_id=%). No changes made.',
            (SELECT user_id FROM platform_owner WHERE active = true);
        RETURN;
    END IF;

    SELECT COUNT(*), MIN(user_id)
      INTO v_count, v_user
      FROM admin_roles
     WHERE role = 'super_admin'
       AND (expires_at IS NULL OR expires_at > NOW());

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'BOOTSTRAP ABORTED: expected exactly 1 active super_admin, found %. Assign the Platform Owner deliberately instead.',
            v_count;
    END IF;

    INSERT INTO platform_owner (user_id, assigned_by, notes)
    VALUES (
        v_user,
        'bootstrap',
        'Controller V2 Phase 1 bootstrap — derived from the sole active super_admin'
    );

    RAISE NOTICE 'Platform Owner assigned: %', v_user;
END$$;

-- Verification (expect exactly one row, active = true):
SELECT user_id, active, assigned_by, assigned_at, notes
FROM platform_owner
WHERE active = true;
