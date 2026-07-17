-- ============================================================================
-- TappyAI Back Office — Phase 0 Foundation (SCHEMA ONLY)
-- Architecture v1.1 (frozen). Implements docs/backoffice/04_Database_Architecture.md
-- §4.1 admin_roles, §4.2 admin_permissions, §4.3 audit_log, §4.7 system_health_log.
--
-- SEED IS SEPARATE: this migration creates NO admin rows. The initial Super Admin
-- UUID(s) are inserted by the owner via supabase/seed/backoffice_super_admins.sql
-- (owner decision, Phase 0). Apply this migration in Supabase, THEN run the seed,
-- BEFORE deploying the Phase 0 code (avoids an admin-lockout window).
--
-- Idempotent DDL (Database Governance §2). RLS enabled deny-by-default; all back
-- office writes use the service-role client which bypasses RLS. audit_log is
-- INSERT-only with no UPDATE/DELETE path (ADR-007).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4.1  admin_roles  (RBAC — replaces the ADMIN_IDS env gate, ADR-003)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'moderator', 'analyst');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS admin_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role        admin_role NOT NULL,
    granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    notes       TEXT,
    UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_admin_roles_user ON admin_roles(user_id);

-- ---------------------------------------------------------------------------
-- 4.2  admin_permissions  (fine-grained overrides beyond role defaults)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    granted     BOOLEAN NOT NULL DEFAULT true,
    granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, permission)
);

-- ---------------------------------------------------------------------------
-- 4.3  audit_log  (immutable; INSERT-only — ADR-007)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id      UUID NOT NULL,
    actor_email   TEXT NOT NULL,
    actor_role    TEXT NOT NULL,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     TEXT,
    before_state  JSONB,
    after_state   JSONB,
    metadata      JSONB,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor  ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_date   ON audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4.7  system_health_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_health_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name  TEXT NOT NULL,
    status      TEXT NOT NULL,
    latency_ms  INTEGER,
    message     TEXT,
    metadata    JSONB,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_log_check ON system_health_log(check_name, checked_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security — deny-by-default (Database Governance §4, Security §4).
-- No anon/authenticated policies are defined => direct client access is denied.
-- The back office uses the service-role client, which bypasses RLS. audit_log
-- therefore has no UPDATE/DELETE path anywhere (ADR-007 immutability).
-- ---------------------------------------------------------------------------
ALTER TABLE admin_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health_log  ENABLE ROW LEVEL SECURITY;
