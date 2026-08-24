-- ---------------------------------------------------------------------------
-- decision_evidence — the minimal server-side store for shopping decision facts
--
-- ADR-024. Additive only: one new table, two new functions, their grants.
-- Nothing existing is altered, and no data is migrated.
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- Production UAT on 7deee03 measured a follow-up turn answering "Trong các lựa
-- chọn trên, bạn chọn cái nào cho tôi?" with:
--
--     "khoảng 28-29 triệu"        — the listing's actual price was 24,490,000
--     "Google Maps 4.8⭐"          — the evidence was a PRODUCT rating of 4.7
--     "các shop khác cao hơn 1-2 triệu" — real deltas were +509k … +5.06M
--
-- That turn made ZERO tool calls, which was the correct behaviour and also the
-- whole problem: `/api/chat` is stateless, and `clientInput` allows a client to
-- send only `user` and `assistant` roles, so the `tool` message carrying the
-- listing table cannot come back. The facts had been deleted from the
-- conversation, and the model was asked to restate them anyway.
--
-- Two earlier attempts (#171, #172) added prompt rules instead. Both shipped and
-- both still failed in production at the same rate. Rules cannot restore data
-- that is not in the context; only carrying the data can.
--
-- ---------------------------------------------------------------------------
-- WHY NOT the `conversations` table
-- ---------------------------------------------------------------------------
-- `conversations.messages` is written by the CLIENT through /api/conversations.
-- Evidence stored there would be client-supplied product facts, which is the one
-- thing this design must never allow — a client could then dictate the price the
-- assistant quotes. This table is written ONLY by the server, from provider data.
--
-- ---------------------------------------------------------------------------
-- SECURITY MODEL — the same lockdown as public.anon_chat_usage
-- ---------------------------------------------------------------------------
-- RLS is ENABLED with ZERO policies, so no role can read or write the table
-- directly; the two SECURITY DEFINER functions below are the only doors.
--
-- 🚨 IDOR is impossible BY CONSTRUCTION, not by convention: neither function
-- accepts an owner argument. Ownership is taken from auth.uid() inside the
-- function body, so a caller who passes somebody else's row id receives NULL --
-- indistinguishable from an id that expired or never existed. There is no list
-- endpoint and no readable policy, so ids cannot be enumerated either.
--
-- Anonymous visitors are first-class here. A Supabase anonymous session is a
-- real auth.uid() carrying the `authenticated` Postgres role — which is why
-- anon_chat_usage_increment() grants EXECUTE to `authenticated` alone and is
-- nonetheless the mechanism that caps anonymous guests. The same holds here, so
-- guests get grounded follow-ups with no new identity infrastructure.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_evidence (
  id         UUID PRIMARY KEY,
  owner_id   UUID NOT NULL,
  evidence   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Lookup is always (owner, recency): the prune step reads it, and it also makes
-- the ownership predicate in _load an index condition rather than a filter.
CREATE INDEX IF NOT EXISTS decision_evidence_owner_created_idx
  ON public.decision_evidence (owner_id, created_at DESC);

-- Kept for a future sweep. There is no pg_cron in this project, so expiry is
-- enforced by the _load predicate and reclaimed by the caller-scoped delete in
-- _save; this index means adding a global sweep later needs no schema change.
CREATE INDEX IF NOT EXISTS decision_evidence_expires_idx
  ON public.decision_evidence (expires_at);

-- Locked down: RLS on, NO policies — only the definer functions below reach it.
ALTER TABLE public.decision_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.decision_evidence FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SAVE — write this turn's evidence, then keep the caller's footprint small.
--
-- TTL is 2 hours. The client holds its id in sessionStorage, which dies with the
-- tab, so retention past the tab session is storage nobody can use; a follow-up
-- arrives seconds to minutes later. Housekeeping is caller-scoped and runs on
-- the write path, so no scheduler is introduced: each caller clears their own
-- expired rows and keeps only their latest 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decision_evidence_save(p_id UUID, p_evidence JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.decision_evidence (id, owner_id, evidence, expires_at)
  VALUES (p_id, auth.uid(), p_evidence, now() + interval '2 hours')
  -- Re-writing an id the caller already owns is a retry, not a takeover: the
  -- owner_id predicate means a second caller can never overwrite the first's row.
  ON CONFLICT (id) DO UPDATE
    SET evidence = EXCLUDED.evidence, expires_at = EXCLUDED.expires_at
    WHERE public.decision_evidence.owner_id = auth.uid();

  DELETE FROM public.decision_evidence
   WHERE owner_id = auth.uid() AND expires_at <= now();

  DELETE FROM public.decision_evidence
   WHERE owner_id = auth.uid()
     AND id NOT IN (
       SELECT id FROM public.decision_evidence
        WHERE owner_id = auth.uid()
        ORDER BY created_at DESC
        LIMIT 3
     );
END;
$$;

REVOKE ALL ON FUNCTION public.decision_evidence_save(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decision_evidence_save(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- LOAD — the caller's own, unexpired evidence, or NULL.
--
-- Both predicates are the security boundary. Dropping either one is the whole
-- vulnerability, which is why the mutation suite kills exactly those two edits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decision_evidence_load(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT evidence INTO found
    FROM public.decision_evidence
   WHERE id = p_id
     AND owner_id = auth.uid()
     AND expires_at > now();

  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.decision_evidence_load(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decision_evidence_load(UUID) TO authenticated;
