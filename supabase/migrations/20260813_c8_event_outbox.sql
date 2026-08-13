-- ============================================================================
-- Controller V2 — Component 8: Event Bus (transactional outbox)
--
-- Contract: docs/controller-v2/08_COMPONENT8_EVENT_BUS_CONTRACT.md
-- Grant policy: docs/architecture/ADR-019-supabase-grant-model.md
--
-- Owner-decided parameters this file implements:
--   P1  max attempts = 3, then DLQ (status 'dead')
--   P2  Vercel Cron drains it, once daily, no exponential backoff
--   P3  ONE ROW PER (event, consumer) — independent status/attempts/error
--   P4  the outbox insert shares the PRODUCER'S transaction
--   D2  a not-ready consumer's row stays `pending`, untouched
--
-- C8 ships the MECHANISM ONLY. It creates no producers and no consumers, and
-- this file deliberately inserts no rows.
--
-- ── WHY THE GRANTS ARE THE ENFORCEMENT (P4) ─────────────────────────────────
-- The app tier speaks only PostgREST (@supabase/supabase-js). There is no `pg`
-- client and no connection pool, so two PostgREST calls are two transactions
-- and no application-level sequence can be atomic. Atomicity is reachable only
-- INSIDE a Postgres function.
--
-- If `fn_outbox_publish` were callable from the app tier, someone could commit
-- a business write and then call it separately — a business fact committed with
-- no event, which is exactly the lost-event window P4 exists to close. Postgres
-- cannot reliably tell whether a function call is nested, so the guarantee is
-- enforced by REMOVING EXECUTE from every PostgREST-reachable role, including
-- `service_role`. What remains is the function owner, which is what a producer
-- SECURITY DEFINER function runs as. The window is closed by construction.
--
-- On Supabase, `REVOKE ... FROM PUBLIC` alone would close NOTHING here:
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon,
-- authenticated AND service_role explicitly, and those are separate ACL entries
-- (F-04 in 20260807_audit_chain.sql, BL-C7-01 in 20260803_platform_owner.sql —
-- both shipped that mistake). Every REVOKE below names the roles.
--
-- Additive and idempotent. Safe to apply section by section, which is how SQL
-- has actually reached production on this project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The outbox table (S2 — one row per event × consumer)
--
-- Every envelope column mirrors the FROZEN ControllerEvent contract
-- (FOUNDATION_01 §6): id, type, version, producer, actor, timestamp,
-- correlationId, securityClass, payload, metadata. Nothing is invented here and
-- no business-specific field appears.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_outbox (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Envelope (frozen fields) ------------------------------------------------
  event_id        UUID        NOT NULL,
  schema_version  SMALLINT    NOT NULL DEFAULT 1,
  type            TEXT        NOT NULL,
  event_version   TEXT        NOT NULL,
  producer        TEXT        NOT NULL,
  actor           JSONB,
  correlation_id  TEXT,
  security_class  TEXT        NOT NULL,
  payload         JSONB,
  metadata        JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL,

  -- Delivery obligation (P3) ------------------------------------------------
  consumer_id     TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  attempts        SMALLINT    NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ,

  CONSTRAINT event_outbox_status_check CHECK (status IN ('pending', 'delivered', 'dead')),
  CONSTRAINT event_outbox_attempts_check CHECK (attempts >= 0)
);

-- THE UNIQUENESS THAT MAKES REPUBLISH IDEMPOTENT.
--
-- One delivery obligation per consumer per event. Re-publishing the same
-- event_id cannot create a second obligation for the same consumer, which is
-- the `user_events.event_id` UNIQUE pattern §7 cites, extended per-consumer
-- because P3 splits an event into one row per consumer.
--
-- Without this constraint a producer retried by its own caller would fan the
-- same fact out twice, and "at-least-once with an idempotency key" would have
-- no key.
DO $uniq$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_event_consumer_key') THEN
    ALTER TABLE event_outbox
      ADD CONSTRAINT event_outbox_event_consumer_key UNIQUE (event_id, consumer_id);
  END IF;
END $uniq$;

-- The claim query's access path: pending rows that are due, oldest first.
-- Partial, because delivered and dead rows are terminal and never selected.
CREATE INDEX IF NOT EXISTS event_outbox_claim_idx
  ON event_outbox (next_attempt_at, created_at)
  WHERE status = 'pending';

-- DLQ triage (Operations Hub, §7 "Failures land in a DLQ").
CREATE INDEX IF NOT EXISTS event_outbox_dead_idx
  ON event_outbox (created_at DESC)
  WHERE status = 'dead';

-- ---------------------------------------------------------------------------
-- 2. RLS — defence in depth
--
-- The grants in section 6 are the actual control. RLS is enabled with NO
-- policies so that if a future `GRANT` is added carelessly, the table still
-- denies every anon/authenticated row read instead of silently opening.
-- SECURITY DEFINER functions below are unaffected (owner bypasses RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. fn_outbox_publish — THE P4 PRIMITIVE
--
-- Designed to be called from INSIDE a producer's own SECURITY DEFINER function.
-- A function call shares the caller's transaction, so the business write and
-- these inserts commit or roll back together. That, and only that, is T1.
--
-- ZERO CONSUMERS (contract §8): p_consumer_ids empty or NULL inserts zero rows
-- and returns 0. Publishing does NOT fail merely because nothing is listening —
-- §7's "modules publish facts; the kernel routes" would be contradicted by
-- rejecting a fact for lack of an audience. The event is still recorded in the
-- C7 audit chain by the producer, independently of this table.
--
-- The consumer list is a PARAMETER rather than a lookup because the authority
-- for it is `ModuleManifest.events.consumes`, which lives in the TypeScript
-- kernel. Building a second consumer registry inside Postgres would create two
-- sources of truth that could disagree.
--
-- ON CONFLICT DO NOTHING makes republish idempotent rather than fatal: a
-- producer whose own transaction is retried must not fail on the second run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_outbox_publish(
  p_event_id       UUID,
  p_type           TEXT,
  p_event_version  TEXT,
  p_producer       TEXT,
  p_security_class TEXT,
  p_occurred_at    TIMESTAMPTZ,
  p_consumer_ids   TEXT[],
  p_actor          JSONB DEFAULT NULL,
  p_correlation_id TEXT  DEFAULT NULL,
  p_payload        JSONB DEFAULT NULL,
  p_metadata       JSONB DEFAULT NULL,
  p_schema_version SMALLINT DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $publish$
DECLARE
  v_inserted INTEGER;
BEGIN
  -- No EXCEPTION handler: it would open an implicit subtransaction, and a
  -- producer that swallowed an outbox failure would commit its business write
  -- with no event — the exact failure P4 exists to prevent. Let it propagate
  -- and roll the producer back.
  INSERT INTO event_outbox (
    event_id, schema_version, type, event_version, producer, actor,
    correlation_id, security_class, payload, metadata, occurred_at, consumer_id
  )
  SELECT
    p_event_id, p_schema_version, p_type, p_event_version, p_producer, p_actor,
    p_correlation_id, p_security_class, p_payload, p_metadata, p_occurred_at, c
  FROM unnest(COALESCE(p_consumer_ids, ARRAY[]::TEXT[])) AS c
  ON CONFLICT (event_id, consumer_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$publish$;

-- ---------------------------------------------------------------------------
-- 4. fn_outbox_claim — the ONLY place FOR UPDATE SKIP LOCKED can live
--
-- PostgREST cannot express row-level locking, so the claim must be a function.
--
-- D2 IS ENFORCED BY THE `p_ready_consumers` FILTER, NOT BY A LATER BRANCH.
-- The caller passes only consumers that are `ready` (C6: enabled && available).
-- A row whose consumer is disabled is therefore never selected at all: its
-- attempts are not incremented, it is not marked delivered, it is not moved to
-- DLQ, and it stays `pending` for the next tick. Filtering at selection makes
-- the disabled case unreachable rather than merely handled — there is no branch
-- that could regress into counting it as a failure.
--
-- ATTEMPTS INCREMENT AT CLAIM TIME, NOT AT SETTLE TIME. This is a derivation
-- from §6 "attempts increments by 1 for every delivery attempt", and the reason
-- is crash safety: if the drain dies mid-delivery, the attempt is already
-- recorded, so a consumer that reliably kills the process still reaches DLQ
-- after 3 ticks. Incrementing on settle would let such a consumer retry
-- forever. Recorded explicitly because it is the one timing question the
-- contract does not spell out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_outbox_claim(
  p_ready_consumers TEXT[],
  p_limit           INTEGER DEFAULT 100
)
RETURNS TABLE(
  id             UUID,
  event_id       UUID,
  type           TEXT,
  event_version  TEXT,
  producer       TEXT,
  actor          JSONB,
  correlation_id TEXT,
  security_class TEXT,
  payload        JSONB,
  metadata       JSONB,
  occurred_at    TIMESTAMPTZ,
  consumer_id    TEXT,
  attempts       SMALLINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $claim$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT o.id
      FROM event_outbox o
     WHERE o.status = 'pending'
       AND o.next_attempt_at <= now()
       AND o.consumer_id = ANY(COALESCE(p_ready_consumers, ARRAY[]::TEXT[]))
     ORDER BY o.created_at
     LIMIT GREATEST(p_limit, 0)
     FOR UPDATE SKIP LOCKED          -- two overlapping drains never contend
  )
  UPDATE event_outbox o
     SET attempts = o.attempts + 1
    FROM claimed
   WHERE o.id = claimed.id
  RETURNING
    o.id, o.event_id, o.type, o.event_version, o.producer, o.actor,
    o.correlation_id, o.security_class, o.payload, o.metadata, o.occurred_at,
    o.consumer_id, o.attempts;
END
$claim$;

-- ---------------------------------------------------------------------------
-- 5. fn_outbox_settle — the terminal state machine (P1)
--
--   success                  -> delivered, delivered_at = now()   [terminal]
--   failure, attempts <  3   -> stays pending, last_error recorded,
--                               next_attempt_at = now()
--   failure, attempts >= 3   -> dead                              [terminal]
--
-- next_attempt_at = now() and NOT an exponential curve: under P2 the daily cron
-- cadence IS the backoff. A backoff schedule finer than the substrate can
-- honour would be decoration that reads as a guarantee.
--
-- The `status = 'pending'` predicate is what makes delivered and dead terminal:
-- a late settle for a row that already reached a terminal state changes
-- nothing, so a duplicate delivery cannot resurrect a dead row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_outbox_settle(
  p_id    UUID,
  p_ok    BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $settle$
DECLARE
  v_status TEXT;
BEGIN
  UPDATE event_outbox o
     SET status       = CASE
                          WHEN p_ok THEN 'delivered'
                          WHEN o.attempts >= 3 THEN 'dead'
                          ELSE 'pending'
                        END,
         delivered_at = CASE WHEN p_ok THEN now() ELSE o.delivered_at END,
         last_error   = CASE WHEN p_ok THEN NULL ELSE p_error END,
         next_attempt_at = CASE WHEN p_ok THEN o.next_attempt_at ELSE now() END
   WHERE o.id = p_id
     AND o.status = 'pending'
  RETURNING o.status INTO v_status;

  RETURN v_status;   -- NULL when the row was already terminal or absent
END
$settle$;

-- ---------------------------------------------------------------------------
-- 6. Grants — the P4 enforcement, plus ADR-019 hygiene
--
-- fn_outbox_publish: EXECUTE removed from EVERY PostgREST-reachable role.
-- `service_role` is in this list deliberately and it is the whole point — it is
-- the role the app tier's admin client authenticates as, so leaving it would
-- leave the lost-event window wide open while the file appeared hardened.
-- Only the function owner retains EXECUTE, which is what a producer
-- SECURITY DEFINER function runs as.
--
-- fn_outbox_claim / fn_outbox_settle: the drain route is app tier, so these DO
-- need service_role. They cannot substitute for publish — neither inserts.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION fn_outbox_publish(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT[], JSONB, TEXT, JSONB, JSONB, SMALLINT)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION fn_outbox_claim(TEXT[], INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_outbox_claim(TEXT[], INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION fn_outbox_settle(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn_outbox_settle(UUID, BOOLEAN, TEXT) TO service_role;

-- Table privileges. Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new
-- tables to anon, authenticated and service_role, so silence here would leave
-- the outbox world-writable through PostgREST.
--
-- service_role keeps SELECT only: DLQ triage in the Operations Hub is a read,
-- and every write path is one of the functions above. A direct UPDATE from the
-- app tier could set `delivered` without a delivery ever happening.
REVOKE ALL ON TABLE event_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE event_outbox FROM service_role;
GRANT  SELECT ON TABLE event_outbox TO service_role;
