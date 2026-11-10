-- TVI core (R13 §8, slice 2a, owner 10/11/2026): the store for FACTS WITH PROVENANCE — entities, facts, immutable fact versions, a lifecycle state, an append-only
-- lifecycle log, evidence and the fact-evidence relation. It is NOT a search cache: nothing here is written or read by the chat until a later, flagged slice wires it.
-- Service-role only (RLS on, no policy, no grant to anon/authenticated), like the other server-side tables.
--
--  * A fact is (entity, fact type, subject key). Its VALUE lives in knowledge_fact_versions: append-only (no UPDATE; DELETE only inside an explicit purge), one row per distinct
--    content hash. A changed value is a new version, never an overwrite.
--  * knowledge_fact_state is the mutable projection: the current version, an optional pending CANDIDATE version, status (CANDIDATE/ACTIVE/SUPERSEDED/EXPIRED/REJECTED) and
--    verification (UNVERIFIED/PARTIALLY_VERIFIED/VERIFIED/DISPUTED), with a row_version for compare-and-set.
--  * knowledge_fact_events is the append-only history of every transition (no UPDATE, no DELETE).
--  * tvi_stage_fact / tvi_promote_fact / tvi_retire_fact are the ONLY write paths: each is one transaction under an advisory lock per fact, so two concurrent writers cannot
--    publish the same fact twice (R13 ADR-019 / ADR-033), and an identical re-ingest is a no-op.
-- Rollback: rollback/20261120_tvi_core_rollback.sql.

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type        text        NOT NULL,
  canonical_domain   text        NULL,
  publisher_name     text        NULL,
  independence_group text        NULL,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_verified_at   timestamptz NULL,
  CONSTRAINT knowledge_sources_type_check   CHECK (source_type IN ('GOVERNMENT','OFFICIAL_BUSINESS','NEWS','PROVIDER_API','KOL','COMMUNITY','UGC','OTHER')),
  CONSTRAINT knowledge_sources_domain_check CHECK (canonical_domain IS NULL OR canonical_domain = lower(canonical_domain))
);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_domain_uidx ON public.knowledge_sources (canonical_domain) WHERE canonical_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id      text             NOT NULL DEFAULT 'VN',
  entity_type    text             NOT NULL,
  entity_key     text             NOT NULL,
  canonical_name text             NOT NULL,
  original_name  text             NULL,
  city           text             NULL,
  lat            double precision NULL,
  lng            double precision NULL,
  created_at     timestamptz      NOT NULL DEFAULT now(),
  updated_at     timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_entities_key_check  CHECK (char_length(entity_key) BETWEEN 3 AND 200),
  CONSTRAINT knowledge_entities_name_check CHECK (char_length(btrim(canonical_name)) BETWEEN 1 AND 300),
  CONSTRAINT knowledge_entities_geo_check  CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)),
  CONSTRAINT knowledge_entities_uniq UNIQUE (market_id, entity_key)
);

CREATE TABLE IF NOT EXISTS public.knowledge_facts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid        NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  fact_type   text        NOT NULL,
  subject_key text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_facts_type_check CHECK (char_length(fact_type) BETWEEN 1 AND 80),
  CONSTRAINT knowledge_facts_uniq UNIQUE (entity_id, fact_type, subject_key)
);

CREATE TABLE IF NOT EXISTS public.knowledge_fact_versions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id             uuid        NOT NULL REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
  version_number      integer     NOT NULL,
  value               jsonb       NOT NULL,
  value_unit          text        NULL,
  observed_at         timestamptz NOT NULL,
  retrieved_at        timestamptz NOT NULL,
  published_at        timestamptz NULL,
  valid_from          timestamptz NULL,
  valid_until         timestamptz NULL,
  freshness_policy_id text        NOT NULL,
  content_hash        text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_fact_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT knowledge_fact_versions_hash_check   CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT knowledge_fact_versions_valid_check  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT knowledge_fact_versions_number_uniq  UNIQUE (fact_id, version_number),
  CONSTRAINT knowledge_fact_versions_hash_uniq    UNIQUE (fact_id, content_hash)
);

CREATE TABLE IF NOT EXISTS public.knowledge_fact_state (
  fact_id               uuid        PRIMARY KEY REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
  current_version_id    uuid        NOT NULL REFERENCES public.knowledge_fact_versions(id),
  candidate_version_id  uuid        NULL REFERENCES public.knowledge_fact_versions(id),
  status                text        NOT NULL,
  verification_status   text        NOT NULL DEFAULT 'UNVERIFIED',
  superseded_by_fact_id uuid        NULL REFERENCES public.knowledge_facts(id),
  status_updated_at     timestamptz NOT NULL DEFAULT now(),
  row_version           integer     NOT NULL DEFAULT 1,
  CONSTRAINT knowledge_fact_state_status_check       CHECK (status IN ('CANDIDATE','ACTIVE','SUPERSEDED','EXPIRED','REJECTED')),
  CONSTRAINT knowledge_fact_state_verification_check CHECK (verification_status IN ('UNVERIFIED','PARTIALLY_VERIFIED','VERIFIED','DISPUTED'))
);
CREATE INDEX IF NOT EXISTS knowledge_fact_state_status_idx ON public.knowledge_fact_state (status, status_updated_at);

CREATE TABLE IF NOT EXISTS public.knowledge_fact_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The order of the history. occurred_at is the transaction's time, so several events of one transaction share it; seq is what orders them.
  seq             bigint      GENERATED ALWAYS AS IDENTITY,
  fact_id         uuid        NOT NULL REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
  fact_version_id uuid        NOT NULL REFERENCES public.knowledge_fact_versions(id) ON DELETE CASCADE,
  from_status     text        NULL,
  to_status       text        NOT NULL,
  reason_code     text        NOT NULL,
  actor_type      text        NOT NULL,
  actor_id        text        NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  evidence_ids    uuid[]      NULL,
  CONSTRAINT knowledge_fact_events_actor_check  CHECK (actor_type IN ('INGESTION_PIPELINE','VERIFIER','ADMIN','SYSTEM')),
  CONSTRAINT knowledge_fact_events_status_check CHECK (to_status IN ('CANDIDATE','ACTIVE','SUPERSEDED','EXPIRED','REJECTED') AND (from_status IS NULL OR from_status IN ('CANDIDATE','ACTIVE','SUPERSEDED','EXPIRED','REJECTED'))),
  CONSTRAINT knowledge_fact_events_reason_check CHECK (char_length(reason_code) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS knowledge_fact_events_fact_idx ON public.knowledge_fact_events (fact_id, seq);

CREATE TABLE IF NOT EXISTS public.knowledge_evidence (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid        NOT NULL REFERENCES public.knowledge_sources(id),
  external_reference  text        NULL,
  content_hash        text        NULL,
  excerpt             text        NULL,
  excerpt_locator     text        NULL,
  source_published_at timestamptz NULL,
  retrieved_at        timestamptz NOT NULL,
  storage_permission  text        NOT NULL DEFAULT 'REFERENCE_ONLY',
  policy_version      text        NOT NULL,
  CONSTRAINT knowledge_evidence_permission_check CHECK (storage_permission IN ('REFERENCE_ONLY','EXCERPT_ALLOWED','CONTENT_ALLOWED','UNKNOWN')),
  -- An excerpt may be stored only where the source's terms allow it: the default (REFERENCE_ONLY / UNKNOWN) stores a reference and a hash, never text.
  CONSTRAINT knowledge_evidence_excerpt_check CHECK (excerpt IS NULL OR storage_permission IN ('EXCERPT_ALLOWED','CONTENT_ALLOWED')),
  CONSTRAINT knowledge_evidence_excerpt_len_check CHECK (excerpt IS NULL OR char_length(excerpt) <= 2000)
);

CREATE TABLE IF NOT EXISTS public.knowledge_fact_evidence (
  fact_version_id   uuid        NOT NULL REFERENCES public.knowledge_fact_versions(id) ON DELETE CASCADE,
  evidence_id       uuid        NOT NULL REFERENCES public.knowledge_evidence(id),
  relation          text        NOT NULL,
  assertion_scope   text        NULL,
  evaluator_version text        NOT NULL,
  evaluated_at      timestamptz NOT NULL DEFAULT now(),
  status            text        NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (fact_version_id, evidence_id, relation),
  CONSTRAINT knowledge_fact_evidence_relation_check CHECK (relation IN ('SUPPORTS','REFUTES','QUALIFIES','CONTEXT_ONLY')),
  CONSTRAINT knowledge_fact_evidence_status_check   CHECK (status IN ('ACTIVE','RETRACTED'))
);
CREATE INDEX IF NOT EXISTS knowledge_fact_evidence_evidence_idx ON public.knowledge_fact_evidence (evidence_id);

-- Immutability: a version's content never changes; the log never changes. DELETE is allowed only inside an explicit purge (SET LOCAL tvi.purge = 'on'), which is also how
-- the ON DELETE CASCADE of a removed entity passes.
CREATE OR REPLACE FUNCTION public.tvi_guard_immutable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only: it cannot be updated', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND COALESCE(current_setting('tvi.purge', true), '') <> 'on' THEN
    RAISE EXCEPTION '% is append-only: rows are removed only by an explicit purge', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS knowledge_fact_versions_immutable ON public.knowledge_fact_versions;
CREATE TRIGGER knowledge_fact_versions_immutable BEFORE UPDATE OR DELETE ON public.knowledge_fact_versions FOR EACH ROW EXECUTE FUNCTION public.tvi_guard_immutable();
DROP TRIGGER IF EXISTS knowledge_fact_events_immutable ON public.knowledge_fact_events;
CREATE TRIGGER knowledge_fact_events_immutable BEFORE UPDATE OR DELETE ON public.knowledge_fact_events FOR EACH ROW EXECUTE FUNCTION public.tvi_guard_immutable();

-- ── write path 1: stage a fact version (always a CANDIDATE; an identical re-ingest does nothing) ─────────────────────────────────────────────────────────────────
-- outcome: 'created' (new fact, version 1, CANDIDATE) · 'staged' (new content for a fact that already has a current version: pending as the candidate)
--          'unchanged' (same content as the current or the pending version: nothing written)
CREATE OR REPLACE FUNCTION public.tvi_stage_fact(
  p_market text, p_entity_type text, p_entity_key text, p_canonical_name text, p_city text,
  p_fact_type text, p_subject_key text, p_value jsonb, p_value_unit text,
  p_observed_at timestamptz, p_retrieved_at timestamptz, p_published_at timestamptz,
  p_valid_from timestamptz, p_valid_until timestamptz,
  p_policy text, p_content_hash text, p_actor text
)
RETURNS TABLE (fact_id uuid, version_id uuid, version_number integer, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
#variable_conflict use_column
DECLARE
  v_entity uuid; v_fact uuid; v_ver uuid; v_num integer; v_state public.knowledge_fact_state%ROWTYPE; v_existing uuid;
BEGIN
  IF p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'tvi_stage_fact: content hash must be 64 hex characters' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(p_market, 'VN') || '|' || p_entity_key || '|' || p_fact_type || '|' || COALESCE(p_subject_key, ''), 0));

  INSERT INTO public.knowledge_entities (market_id, entity_type, entity_key, canonical_name, city)
  VALUES (COALESCE(p_market, 'VN'), p_entity_type, p_entity_key, p_canonical_name, p_city)
  ON CONFLICT (market_id, entity_key) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_entity;

  INSERT INTO public.knowledge_facts (entity_id, fact_type, subject_key) VALUES (v_entity, p_fact_type, COALESCE(p_subject_key, ''))
  ON CONFLICT (entity_id, fact_type, subject_key) DO NOTHING;
  SELECT id INTO v_fact FROM public.knowledge_facts WHERE entity_id = v_entity AND fact_type = p_fact_type AND subject_key = COALESCE(p_subject_key, '');

  SELECT * INTO v_state FROM public.knowledge_fact_state WHERE knowledge_fact_state.fact_id = v_fact FOR UPDATE;

  -- the same content already stored for this fact: nothing to write
  SELECT id INTO v_existing FROM public.knowledge_fact_versions WHERE knowledge_fact_versions.fact_id = v_fact AND content_hash = p_content_hash;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_fact, v_existing, (SELECT fv.version_number FROM public.knowledge_fact_versions fv WHERE fv.id = v_existing), 'unchanged'::text;
    RETURN;
  END IF;

  SELECT COALESCE(max(fv.version_number), 0) + 1 INTO v_num FROM public.knowledge_fact_versions fv WHERE fv.fact_id = v_fact;
  INSERT INTO public.knowledge_fact_versions (fact_id, version_number, value, value_unit, observed_at, retrieved_at, published_at, valid_from, valid_until, freshness_policy_id, content_hash)
  VALUES (v_fact, v_num, p_value, p_value_unit, p_observed_at, p_retrieved_at, p_published_at, p_valid_from, p_valid_until, p_policy, p_content_hash)
  RETURNING id INTO v_ver;

  IF NOT FOUND OR v_state.fact_id IS NULL THEN
    INSERT INTO public.knowledge_fact_state (fact_id, current_version_id, status) VALUES (v_fact, v_ver, 'CANDIDATE');
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (v_fact, v_ver, NULL, 'CANDIDATE', 'staged', 'INGESTION_PIPELINE', p_actor);
    RETURN QUERY SELECT v_fact, v_ver, v_num, 'created'::text;
    RETURN;
  END IF;

  -- a pending candidate that is replaced is rejected (its version row stays: history is never rewritten)
  IF v_state.candidate_version_id IS NOT NULL THEN
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (v_fact, v_state.candidate_version_id, 'CANDIDATE', 'REJECTED', 'replaced_by_newer_candidate', 'INGESTION_PIPELINE', p_actor);
  END IF;
  -- a fact whose only version is still an unpromoted CANDIDATE is simply carried forward by the newer one
  IF v_state.status = 'CANDIDATE' THEN
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (v_fact, v_state.current_version_id, 'CANDIDATE', 'REJECTED', 'replaced_by_newer_candidate', 'INGESTION_PIPELINE', p_actor);
    UPDATE public.knowledge_fact_state SET current_version_id = v_ver, candidate_version_id = NULL, status_updated_at = now(), row_version = row_version + 1 WHERE knowledge_fact_state.fact_id = v_fact;
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (v_fact, v_ver, NULL, 'CANDIDATE', 'staged', 'INGESTION_PIPELINE', p_actor);
    RETURN QUERY SELECT v_fact, v_ver, v_num, 'staged'::text;
    RETURN;
  END IF;

  UPDATE public.knowledge_fact_state SET candidate_version_id = v_ver, status_updated_at = now(), row_version = row_version + 1 WHERE knowledge_fact_state.fact_id = v_fact;
  INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (v_fact, v_ver, NULL, 'CANDIDATE', 'staged', 'INGESTION_PIPELINE', p_actor);
  RETURN QUERY SELECT v_fact, v_ver, v_num, 'staged'::text;
END
$fn$;

-- ── write path 2: promote a pending version to ACTIVE (compare-and-set on row_version) ───────────────────────────────────────────────────────────────────────
-- outcome: 'promoted' · 'conflict' (row_version moved: re-read and retry) · 'not_pending' (that version is neither the candidate nor an unpromoted current)
CREATE OR REPLACE FUNCTION public.tvi_promote_fact(
  p_fact_id uuid, p_version_id uuid, p_expected_row_version integer, p_verification text, p_reason text, p_actor_type text, p_actor text, p_evidence_ids uuid[]
)
RETURNS TABLE (outcome text, row_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
#variable_conflict use_column
DECLARE v_state public.knowledge_fact_state%ROWTYPE;
BEGIN
  IF p_verification NOT IN ('PARTIALLY_VERIFIED','VERIFIED') THEN RAISE EXCEPTION 'tvi_promote_fact: a promotion needs a PARTIALLY_VERIFIED or VERIFIED result' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_state FROM public.knowledge_fact_state s WHERE s.fact_id = p_fact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_pending'::text, 0; RETURN; END IF;
  IF v_state.row_version <> p_expected_row_version THEN RETURN QUERY SELECT 'conflict'::text, v_state.row_version; RETURN; END IF;

  IF v_state.status = 'CANDIDATE' AND v_state.current_version_id = p_version_id THEN
    UPDATE public.knowledge_fact_state s SET status = 'ACTIVE', verification_status = p_verification, status_updated_at = now(), row_version = s.row_version + 1 WHERE s.fact_id = p_fact_id;
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id, evidence_ids) VALUES (p_fact_id, p_version_id, 'CANDIDATE', 'ACTIVE', p_reason, p_actor_type, p_actor, p_evidence_ids);
  ELSIF v_state.candidate_version_id = p_version_id THEN
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (p_fact_id, v_state.current_version_id, v_state.status, 'SUPERSEDED', 'superseded_by_promotion', p_actor_type, p_actor);
    UPDATE public.knowledge_fact_state s SET current_version_id = p_version_id, candidate_version_id = NULL, status = 'ACTIVE', verification_status = p_verification, status_updated_at = now(), row_version = s.row_version + 1 WHERE s.fact_id = p_fact_id;
    INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id, evidence_ids) VALUES (p_fact_id, p_version_id, 'CANDIDATE', 'ACTIVE', p_reason, p_actor_type, p_actor, p_evidence_ids);
  ELSE
    RETURN QUERY SELECT 'not_pending'::text, v_state.row_version; RETURN;
  END IF;
  RETURN QUERY SELECT 'promoted'::text, v_state.row_version + 1;
END
$fn$;

-- ── write path 3: retire the current version (EXPIRED or REJECTED), compare-and-set ──────────────────────────────────────────────────────────────────────────
-- outcome: 'retired' · 'conflict' · 'not_current'
CREATE OR REPLACE FUNCTION public.tvi_retire_fact(
  p_fact_id uuid, p_expected_row_version integer, p_to_status text, p_reason text, p_actor_type text, p_actor text
)
RETURNS TABLE (outcome text, row_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
#variable_conflict use_column
DECLARE v_state public.knowledge_fact_state%ROWTYPE;
BEGIN
  IF p_to_status NOT IN ('EXPIRED','REJECTED') THEN RAISE EXCEPTION 'tvi_retire_fact: the target status must be EXPIRED or REJECTED' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_state FROM public.knowledge_fact_state s WHERE s.fact_id = p_fact_id FOR UPDATE;
  IF NOT FOUND OR v_state.status IN ('EXPIRED','REJECTED','SUPERSEDED') THEN RETURN QUERY SELECT 'not_current'::text, COALESCE(v_state.row_version, 0); RETURN; END IF;
  IF v_state.row_version <> p_expected_row_version THEN RETURN QUERY SELECT 'conflict'::text, v_state.row_version; RETURN; END IF;
  UPDATE public.knowledge_fact_state s SET status = p_to_status, status_updated_at = now(), row_version = s.row_version + 1 WHERE s.fact_id = p_fact_id;
  INSERT INTO public.knowledge_fact_events (fact_id, fact_version_id, from_status, to_status, reason_code, actor_type, actor_id) VALUES (p_fact_id, v_state.current_version_id, v_state.status, p_to_status, p_reason, p_actor_type, p_actor);
  RETURN QUERY SELECT 'retired'::text, v_state.row_version + 1;
END
$fn$;

-- Service-role only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_sources','knowledge_entities','knowledge_facts','knowledge_fact_versions','knowledge_fact_state','knowledge_fact_events','knowledge_evidence','knowledge_fact_evidence'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.tvi_stage_fact(text,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tvi_stage_fact(text,text,text,text,text,text,text,jsonb,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.tvi_promote_fact(uuid,uuid,integer,text,text,text,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tvi_promote_fact(uuid,uuid,integer,text,text,text,text,uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.tvi_retire_fact(uuid,integer,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.tvi_retire_fact(uuid,integer,text,text,text,text) TO service_role;
