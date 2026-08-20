-- ============================================================================
-- Controller V2 — K-6 / B8: BREAK-GLASS OWNER RECOVERY
-- Design: docs/controller-v2/13_BREAK_GLASS_OWNER_RECOVERY_DESIGN.md
-- Decision: ADR-025 (Owner delegation 2026-08-20 — D1, D2, D3, D4)
--
-- GATE: applied to production ONLY under explicit Owner authorization, as its
--       own change with its own preflight, verification and rollback window
--       (ADR-017 pattern). Nothing here runs as part of a batch.
--
-- CLOSES: 01_CONTROLLER_V2_ARCHITECTURE.md §10 R6 — "Owner key loss = permanent
--         lockout", severity Critical. Its stated mitigation is "a DB-level
--         owner-reassignment procedure requiring both database and Vercel env
--         access."
--
-- -- THE SECURITY PROPERTY, STATED FIRST -------------------------------------
--
-- The three functions below hold EXECUTE for **nobody** — not `anon`, not
-- `authenticated`, and NOT `service_role`. This is the same shape C8 gave
-- `fn_outbox_publish` (contract §5, guarantee P4), and here it is what makes
-- "break-glass must never become a hidden super-admin backdoor" STRUCTURAL
-- rather than promised:
--
--     the application has no way to call this at all,
--     so no second authorization path can exist.
--
-- Recovery is a DATABASE operation performed by a human holding direct
-- database access. Combined with the Owner Gate — `checkOwnerGate` already
-- 403s the ENTIRE Controller on a DB-only change (`ENV_MISMATCH`) or an
-- env-only change (`ENV_SET_BUT_NO_OWNER`) — the two accesses R6 names are
-- both genuinely required, and a half-completed recovery FAILS CLOSED.
--
-- -- WHAT IS DELIBERATELY NOT BUILT ------------------------------------------
--
--   * No API route, no service-role path, no application code. See above.
--   * No permanent recovery credential. D3: "Do NOT add an arbitrary permanent
--     recovery credential." The authorization window is short-lived and
--     one-time; there is no standing secret to steal.
--   * No admin role for the new Owner. The Owner is NOT a role (Component 1),
--     and `OWNER_BYPASS` already admits them to the Controller. Granting one
--     would be privilege this procedure does not need.
--   * No column added to `platform_owner`. Its shape, its unique index and its
--     `assigned_by` vocabulary are used exactly as Component 1 shipped them —
--     `'break_glass'` was already a documented value there.
--
-- -- WHAT THE DATABASE CANNOT ENFORCE, STATED RATHER THAN IMPLIED ------------
--
-- D2 makes this RECOVERY-ONLY: permitted only when normal Owner control is
-- unavailable. **No SQL predicate can verify that.** The credential may be lost
-- while the owner row is still perfectly valid — that is the primary scenario.
-- So "recovery-only" is enforced by the three things that CAN be enforced:
-- there is no application surface, a justification is mandatory and stored, and
-- every arm/cancel/execute is audited. The remaining judgement is human, and
-- the control on it is that it cannot be exercised quietly.
--
-- IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK: supabase/migrations/rollback/20260820_b8_owner_recovery_rollback.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The authorization window.
--
--    Two steps — ARM then EXECUTE — rather than one. The window is what makes
--    the operation one-time and short-lived (D3), and it makes an armed
--    recovery VISIBLE and CANCELLABLE before ownership moves. A single-step
--    script that could be re-run at any moment is a permanent backdoor wearing
--    a different name.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_owner_recovery (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, matching platform_owner: the target must be a real profile, and
  -- deleting it must fail loudly rather than orphan a recovery window.
  target_user_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ,
  outcome        TEXT,
  reason         TEXT        NOT NULL,
  CONSTRAINT platform_owner_recovery_window   CHECK (expires_at > requested_at),
  CONSTRAINT platform_owner_recovery_outcome  CHECK (outcome IS NULL OR outcome IN ('consumed', 'cancelled')),
  -- `closed_at` and `outcome` move together or not at all. A closed window with
  -- no outcome would leave the log unable to say what happened.
  CONSTRAINT platform_owner_recovery_closed   CHECK ((closed_at IS NULL) = (outcome IS NULL))
);

-- AT MOST ONE OPEN WINDOW — enforced by the database, not by application code,
-- for the same reason `uq_platform_owner_single_active` is: an application
-- count check races under concurrency and a unique index cannot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_owner_recovery_open
  ON public.platform_owner_recovery ((closed_at IS NULL)) WHERE closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Close it. THIS MUST FOLLOW THE CREATE IMMEDIATELY.
--
--    Production `pg_default_acl` for tables in `public` reads
--      anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
--    so a new table is BORN fully open (ADR-019, extended to tables). Without
--    this REVOKE the window — which names the account about to receive
--    ownership — would be world-readable.
--
--    `service_role` is revoked TOO, unlike every other table in this schema.
--    It is the application's write path, and the application has no business
--    here at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.platform_owner_recovery FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.platform_owner_recovery ENABLE ROW LEVEL SECURITY;
-- Zero policies, deliberately: with RLS enabled a missing policy is a denial,
-- and the only principal that reaches this table is the table owner.

-- ---------------------------------------------------------------------------
-- 3. The audit writer.
--
--    D4: a SYSTEM actor, never a fabricated user. `audit_log.actor_id` is
--    `UUID NOT NULL`, so a sentinel is required; the all-zero UUID is not an id
--    any account can hold, and `.invalid` is RFC 2606 reserved so the address
--    can never be deliverable. `actor_role` is TEXT and never an enum, so
--    'system' needs no migration elsewhere.
--
--    Called INSIDE the caller's transaction. Any failure — a constraint, a
--    permission, a full disk — raises, and the whole recovery rolls back.
--    That inversion is the point: `writeAuditLog` in the application is
--    deliberately fire-and-forget so a failed audit can never break a user
--    action; here an unaudited ownership seizure is worse than a failed
--    recovery.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_owner_recovery_audit(
    p_action   TEXT,
    p_target   UUID,
    p_before   JSONB,
    p_after    JSONB,
    p_metadata JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    INSERT INTO audit_log (actor_id, actor_email, actor_role, action, target_type, target_id,
                           before_state, after_state, metadata)
    VALUES ('00000000-0000-0000-0000-000000000000',
            'break-glass@system.invalid',
            'system',
            p_action, 'platform_owner', p_target::text,
            p_before, p_after, p_metadata);
$$;

-- ---------------------------------------------------------------------------
-- 4. ARM — open a short-lived, one-time authorization window (D1, D3).
--
--    The target is a PARAMETER. It is never derived, and that is the whole of
--    D1: the bootstrap seed derives the Owner from "the sole active
--    super_admin", and production's sole super_admin IS the Owner — so on
--    credential loss that derivation returns the very account that was lost.
--
--    The target is NOT required to hold an admin role. Requiring one would
--    reproduce the lockout for the same reason. The authority here is
--    possession of database AND deployment env, not the target's prior standing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_owner_recovery_arm(
    p_target_user_id UUID,
    p_reason         TEXT,
    p_window_minutes INT DEFAULT 30
)
RETURNS platform_owner_recovery
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row platform_owner_recovery;
BEGIN
    -- A justification is mandatory and stored. It is the only durable record of
    -- WHY normal control was unavailable, and 20 characters is the same floor
    -- 19_Security.md §5 sets for an administrative sanction.
    IF p_reason IS NULL OR length(btrim(p_reason)) < 20 THEN
        RAISE EXCEPTION 'CONFLICT: reason must be at least 20 characters'
            USING ERRCODE = '23514';
    END IF;

    -- Bounded window. Too short is unusable under pressure; too long is a
    -- standing authorization, which is the thing D3 forbids.
    IF p_window_minutes IS NULL OR p_window_minutes < 5 OR p_window_minutes > 120 THEN
        RAISE EXCEPTION 'CONFLICT: window must be between 5 and 120 minutes'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'NOT_FOUND: replacement Owner has no profile'
            USING ERRCODE = 'P0002';
    END IF;

    -- Recovering TO the current Owner recovers nothing, and would silently
    -- succeed. This is the structural guard against the derivation defect above
    -- being repeated by hand.
    IF fn_is_platform_owner(p_target_user_id) THEN
        RAISE EXCEPTION 'CONFLICT: target is already the active Platform Owner'
            USING ERRCODE = '23514';
    END IF;

    -- Checked explicitly for a clear message; the partial unique index is the
    -- authority and still refuses a concurrent second window.
    IF EXISTS (SELECT 1 FROM platform_owner_recovery WHERE closed_at IS NULL) THEN
        RAISE EXCEPTION 'CONFLICT: a recovery window is already open'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO platform_owner_recovery (target_user_id, expires_at, reason)
    VALUES (p_target_user_id, now() + make_interval(mins => p_window_minutes), btrim(p_reason))
    RETURNING * INTO v_row;

    -- Arming is itself security-relevant: it names an account that is about to
    -- receive ownership. Auditing only the execution would leave a cancelled or
    -- expired attempt invisible.
    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_armed',
        p_target_user_id,
        NULL,
        jsonb_build_object('target_user_id', p_target_user_id, 'expires_at', v_row.expires_at),
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_row.id,
                           'window_minutes', p_window_minutes, 'reason', v_row.reason,
                           'outcome', 'armed')
    );

    RETURN v_row;
END$$;

-- ---------------------------------------------------------------------------
-- 5. EXECUTE — move ownership, once, inside one transaction.
--
--    Everything below is all-or-nothing. If the audit insert at the end fails,
--    the revoke, the insert and the window consumption all roll back with it
--    (D4). There is no ordering trick here — a plpgsql exception aborts the
--    statement, and that is precisely the behaviour wanted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_owner_recovery_execute(p_recovery_id UUID)
RETURNS platform_owner
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_win      platform_owner_recovery;
    v_previous UUID;
    v_new      platform_owner;
BEGIN
    -- FOR UPDATE: two concurrent executions of the same window must not both
    -- pass the "still open" check.
    SELECT * INTO v_win FROM platform_owner_recovery WHERE id = p_recovery_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: no such recovery window'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_win.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'CONFLICT: recovery window already %', v_win.outcome
            USING ERRCODE = '23514';
    END IF;

    IF now() > v_win.expires_at THEN
        RAISE EXCEPTION 'CONFLICT: recovery window expired at %', v_win.expires_at
            USING ERRCODE = '23514';
    END IF;

    -- May be NULL: the platform can be ownerless (row deleted, or bootstrap
    -- never ran), and that is a lockout this procedure must also recover from.
    SELECT user_id INTO v_previous FROM platform_owner WHERE active;

    -- Revoke rather than delete — the previous Owner's tenure stays in the
    -- record. The partial unique index requires this to happen before the
    -- insert below.
    UPDATE platform_owner SET active = false, revoked_at = now() WHERE active;

    INSERT INTO platform_owner (user_id, assigned_by, notes)
    VALUES (v_win.target_user_id, 'break_glass', v_win.reason)
    RETURNING * INTO v_new;

    UPDATE platform_owner_recovery
       SET closed_at = now(), outcome = 'consumed'
     WHERE id = v_win.id;

    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_recovery',
        v_win.target_user_id,
        jsonb_build_object('owner_user_id', v_previous),
        jsonb_build_object('owner_user_id', v_win.target_user_id, 'assigned_by', 'break_glass'),
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_win.id,
                           'reason', v_win.reason, 'outcome', 'consumed',
                           'window_expires_at', v_win.expires_at)
    );

    RETURN v_new;
END$$;

-- ---------------------------------------------------------------------------
-- 6. CANCEL — close an armed window without using it.
--
--    Reversible design over irreversible: an operator who arms the wrong target
--    must be able to close it deliberately rather than wait it out or execute
--    it. Cancelling frees the single open slot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_owner_recovery_cancel(p_recovery_id UUID, p_reason TEXT)
RETURNS platform_owner_recovery
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_win platform_owner_recovery;
BEGIN
    SELECT * INTO v_win FROM platform_owner_recovery WHERE id = p_recovery_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: no such recovery window'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_win.closed_at IS NOT NULL THEN
        RAISE EXCEPTION 'CONFLICT: recovery window already %', v_win.outcome
            USING ERRCODE = '23514';
    END IF;

    UPDATE platform_owner_recovery
       SET closed_at = now(), outcome = 'cancelled'
     WHERE id = v_win.id
    RETURNING * INTO v_win;

    PERFORM fn_owner_recovery_audit(
        'owner.break_glass_cancelled',
        v_win.target_user_id,
        jsonb_build_object('target_user_id', v_win.target_user_id),
        NULL,
        jsonb_build_object('mechanism', 'break_glass', 'correlation_id', v_win.id,
                           'reason', p_reason, 'outcome', 'cancelled')
    );

    RETURN v_win;
END$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges — the security property of this migration.
--
--    EXECUTE is revoked from every PostgREST role INCLUDING `service_role`, and
--    granted to nobody. PostgreSQL grants EXECUTE to PUBLIC on a new function
--    by default (ADR-019: silence is not "closed"), so these REVOKEs are what
--    actually closes them.
--
--    There is deliberately NO matching GRANT. The only principals that can call
--    these are the table owner and a superuser — i.e. a human with direct
--    database access, which is exactly the authority R6's mitigation names.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_owner_recovery_audit(TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION fn_owner_recovery_arm(UUID, TEXT, INT)                   FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION fn_owner_recovery_execute(UUID)                          FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION fn_owner_recovery_cancel(UUID, TEXT)                     FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- VERIFY (read-only, after apply)
--
--   -- 1. No PostgREST role can execute anything here.
--   SELECT has_function_privilege('service_role','fn_owner_recovery_arm(uuid,text,integer)','EXECUTE') AS svc_arm,
--          has_function_privilege('authenticated','fn_owner_recovery_execute(uuid)','EXECUTE')         AS auth_exec,
--          has_function_privilege('anon','fn_owner_recovery_cancel(uuid,text)','EXECUTE')              AS anon_cancel;
--   -- Expect: false, false, false.
--
--   -- 2. The table is closed and RLS is on with zero policies.
--   SELECT grantee FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='platform_owner_recovery';
--   -- Expect: no anon / authenticated / service_role rows.
--
--   -- 3. At most one open window is structurally impossible to violate.
--   SELECT indexdef FROM pg_indexes WHERE indexname='uq_platform_owner_recovery_open';
--
--   -- 4. Nothing was armed by applying this migration.
--   SELECT count(*) FROM platform_owner_recovery;   -- Expect: 0.
--
--   -- 5. platform_owner is untouched — still 7 columns, still one active owner.
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='platform_owner';   -- Expect: 7.
--   SELECT count(*) FROM platform_owner WHERE active;               -- Expect: 1.
-- ============================================================================
