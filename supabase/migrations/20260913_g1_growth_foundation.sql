-- ============================================================================
-- TappyAI G1 Growth — foundation: shared results + anonymous identity stitching
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Additive only (two new tables, one
--       new function); touches no existing table, policy or function. Apply per
--       docs/architecture/ADR-014-migration-apply-checklist.md after Owner
--       authorization. IDEMPOTENT: safe to run repeatedly.
-- ROLLBACK: supabase/migrations/rollback/20260913_g1_growth_foundation_rollback.sql
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
-- ---------------------------------------------------------------------------
-- 1. `shared_results` — a FROZEN, SANITIZED public snapshot of one AI result,
--    created only when the user explicitly shares. The public page /r/<slug>
--    renders from `payload` and nothing else: no LLM, no session, no memory.
--    100 or 100,000 views cost reads, never inference.
--
-- 2. `anon_identity_map` — the anon_id → user_id stitch (Analytics Architecture
--    §8D, previously documented but never built). Lets funnels and cohorts
--    follow a visitor across signup without ever rewriting historical events.
--
-- ---------------------------------------------------------------------------
-- ACCESS MODEL (ADR-019 / ADR-017)
-- ---------------------------------------------------------------------------
-- · Every WRITE goes through the application (service_role): the API route is
--   where sanitization, slug minting, rate limiting and ownership are decided.
--   A client can never INSERT a row, so nothing unsanitized can be published.
-- · PUBLIC READS are performed by the server-rendered page with the
--   service-role client, projecting ONLY the public columns (slug, query,
--   payload, og_version, counters, created_at). `owner_id` is therefore never
--   readable through PostgREST by anyone but the owner — the table has no
--   anon SELECT policy at all, on purpose. RLS is not the public boundary
--   here; the projection in `src/lib/share/sharedResultStore.ts` is.
-- · The OWNER may read and withdraw (status → 'removed') their own rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. shared_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_results (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL-safe, short, unguessable-enough (minted by the app, 10 chars base62).
  slug        TEXT        NOT NULL UNIQUE,
  -- ON DELETE SET NULL: a deleted account withdraws nothing it chose to make
  -- public; the snapshot carries no identity anyway (sanitized before write).
  owner_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The PUBLIC (sanitized) question — never the raw prompt.
  query       TEXT        NOT NULL,
  -- The frozen public payload. Schema: `SharedResultPayload` (src/lib/share/sharedResult.ts).
  payload     JSONB       NOT NULL,
  -- Product domain for discovery hubs (/food, /travel …) and sitemap grouping.
  domain      TEXT        NOT NULL DEFAULT 'general',
  locale      TEXT        NOT NULL DEFAULT 'vi',
  -- 'public' | 'removed'. Removed rows 404 and drop out of the sitemap.
  status      TEXT        NOT NULL DEFAULT 'public' CHECK (status IN ('public', 'removed')),
  -- Bumped to cache-bust the OG image (`?v=`) without touching the payload.
  og_version  INTEGER     NOT NULL DEFAULT 1,
  view_count  INTEGER     NOT NULL DEFAULT 0,
  ask_count   INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when status changes; the payload itself is never updated after insert.
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_results_owner_idx
  ON public.shared_results (owner_id, created_at DESC) WHERE owner_id IS NOT NULL;
-- Sitemap / discovery hubs: newest public results per domain.
CREATE INDEX IF NOT EXISTS shared_results_public_domain_idx
  ON public.shared_results (domain, created_at DESC) WHERE status = 'public';

ALTER TABLE public.shared_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_results' AND policyname = 'shared_results_owner_select') THEN
    CREATE POLICY "shared_results_owner_select" ON public.shared_results
      FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shared_results' AND policyname = 'shared_results_owner_withdraw') THEN
    -- The owner may change status only. Column-level: UPDATE is granted on
    -- `status` and `updated_at` alone (see GRANT below), so the frozen payload
    -- cannot be edited even by its owner — a share is a snapshot, not a document.
    CREATE POLICY "shared_results_owner_withdraw" ON public.shared_results
      FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- ADR-019: `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated`
-- would otherwise leave this table open. Revoke by NAME, then grant back only
-- what the model above needs.
REVOKE ALL ON TABLE public.shared_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.shared_results TO authenticated;
GRANT UPDATE (status, updated_at) ON TABLE public.shared_results TO authenticated;
GRANT ALL ON TABLE public.shared_results TO service_role;

-- ---------------------------------------------------------------------------
-- 2. anon_identity_map — Analytics §8D stitching
-- ---------------------------------------------------------------------------
-- One anon_id may map to one user (the account it converted into); one user
-- may own several anon_ids (several devices). Written by the ingestion route
-- when an AUTHENTICATED event arrives carrying an anon_id — the server sets
-- user_id from the verified session, the client never names it.
CREATE TABLE IF NOT EXISTS public.anon_identity_map (
  anon_id    UUID        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anon_id, user_id)
);
CREATE INDEX IF NOT EXISTS anon_identity_map_user_idx ON public.anon_identity_map (user_id);

ALTER TABLE public.anon_identity_map ENABLE ROW LEVEL SECURITY;
-- No policies: nothing reads or writes this over PostgREST. Service role only.
REVOKE ALL ON TABLE public.anon_identity_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.anon_identity_map TO service_role;

-- ---------------------------------------------------------------------------
-- 3. fn_shared_result_bump — the counters, atomically
-- ---------------------------------------------------------------------------
-- Called by the ingestion route when a `share_viewed` / follow-up `query`
-- event lands. One UPDATE, no read-modify-write race. Counts RAW views; unique
-- viewers are computed from `user_events` (distinct anon_id), never here.
CREATE OR REPLACE FUNCTION public.fn_shared_result_bump(p_slug TEXT, p_kind TEXT, p_by INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_by IS NULL OR p_by < 1 OR p_by > 1000 THEN
    RAISE EXCEPTION 'invalid increment';
  END IF;
  IF p_kind = 'view' THEN
    UPDATE public.shared_results SET view_count = view_count + p_by WHERE slug = p_slug AND status = 'public';
  ELSIF p_kind = 'ask' THEN
    UPDATE public.shared_results SET ask_count = ask_count + p_by WHERE slug = p_slug AND status = 'public';
  ELSE
    RAISE EXCEPTION 'unknown counter kind: %', p_kind;
  END IF;
END;
$$;

-- ADR-019: revoke from every role the platform's default ACL names, then grant
-- to the one caller. Not reachable by anon or authenticated over PostgREST.
REVOKE EXECUTE ON FUNCTION public.fn_shared_result_bump(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_shared_result_bump(TEXT, TEXT, INTEGER) TO service_role;
