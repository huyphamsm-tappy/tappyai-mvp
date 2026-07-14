-- ============================================================================
-- Step 1.0 — Shared Analytics Foundation
-- Bring the existing event pipeline into compliance with Analytics Architecture
-- v1.1 (Analytics §3 envelope, §8A idempotency/ingestion). NOT a redesign.
--
-- RECONCILIATION DECISION: `public.user_events` IS the architecture's unified
-- events table (docs refer to it as "track_events"). The physical name is kept
-- to avoid breaking existing consumers (preference profiling, behavior-rollup).
-- This migration ALIGNS user_events to the v1.1 event model in place.
--
-- Idempotent + backward-compatible: existing rows are untouched; all new columns
-- are nullable/defaulted; the identity CHECK is NOT VALID (new rows only).
-- ============================================================================

-- 1. Allow ANONYMOUS events. user_id was NOT NULL, which blocked pre-auth /
--    unauthenticated events (e.g. login-failed, anonymous usage). §8D / §3.
ALTER TABLE public.user_events ALTER COLUMN user_id DROP NOT NULL;

-- 2. Unified analytics envelope (Analytics §3; doc 04 §7A). All additive.
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS event_id         uuid,
  ADD COLUMN IF NOT EXISTS schema_version   smallint    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS anon_id          uuid,
  ADD COLUMN IF NOT EXISTS platform         text,
  ADD COLUMN IF NOT EXISTS app_version      text,
  ADD COLUMN IF NOT EXISTS build_number     text,
  ADD COLUMN IF NOT EXISTS os_name          text,
  ADD COLUMN IF NOT EXISTS os_version       text,
  ADD COLUMN IF NOT EXISTS device_type      text,
  ADD COLUMN IF NOT EXISTS country          text,
  ADD COLUMN IF NOT EXISTS language         text,
  ADD COLUMN IF NOT EXISTS session_id       text,
  ADD COLUMN IF NOT EXISTS client_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS is_unknown_event boolean     NOT NULL DEFAULT false;

-- 3. Idempotency key (§8A.1). Plain UNIQUE: Postgres allows multiple NULLs, so
--    legacy rows (event_id IS NULL) don't collide; new rows dedup on event_id.
--    Ingestion uses INSERT ... ON CONFLICT (event_id) DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_events_event_id ON public.user_events(event_id);

-- 4. Forward-compatible event_type (§8A.3). Drop the restrictive CHECK allowlist;
--    validation moves to the ingestion layer (accept known, tag unknown, never
--    hard-reject) so future events (incl. auth events) are accepted without a
--    schema change. Security is preserved via app-layer caps + rate limits +
--    service-role-only writes.
ALTER TABLE public.user_events DROP CONSTRAINT IF EXISTS user_events_event_type_check;

-- 5. Integrity: every event has an identity (authenticated OR anonymous).
--    NOT VALID → enforced for new rows only (existing rows all have user_id).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_events_identity_chk') THEN
    ALTER TABLE public.user_events
      ADD CONSTRAINT user_events_identity_chk
      CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- 6. Analytics rollup helpers (per-day / per-type scans by the snapshot cron).
CREATE INDEX IF NOT EXISTS idx_user_events_created      ON public.user_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_type_created ON public.user_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_anon         ON public.user_events(anon_id) WHERE anon_id IS NOT NULL;

-- RLS unchanged: existing "Users manage own events" (auth.uid() = user_id) stays
-- for authenticated self-access. Ingestion writes via the service-role client
-- (bypasses RLS) so anonymous events insert correctly and direct anon client
-- access stays denied-by-default.
