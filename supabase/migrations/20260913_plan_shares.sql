-- ============================================================================
-- Plan shares — the PUBLISHED snapshot behind a `/plan/<shareId>` brochure.
--
-- GATE: NOT YET AUTHORIZED FOR PRODUCTION. Applying this needs its own explicit
--       Owner authorization, preflight and rollback window (ADR-017 pattern).
--       Rollback: supabase/migrations/rollback/20260913_plan_shares_rollback.sql
--
-- Idempotent — safe to re-run.
--
-- ---------------------------------------------------------------------------
-- 🚨 THIS IS NOT A `plans` TABLE, AND IT MUST NOT BECOME ONE.
--
-- A plan lives where it always has: inside `conversations.messages`, as the
-- assistant's own `[TAPPY_PLAN]` reply, under the owner's RLS, mirrored to
-- Android and iOS by the contract in `promptBuilder.ts`. `derivePlans.ts` reads
-- My Plans from there and this table does not change that.
--
-- What a share needs that a conversation cannot give is a PUBLIC, STABLE,
-- UNGUESSABLE identity for one exact plan, readable by a recipient who has no
-- account and must never be able to reach the thread it came from. A row here
-- is that identity: the whitelisted plan snapshot (`planShare.ts` decides the
-- fields — never the raw message), the owner, and a fingerprint so sharing the
-- same plan twice yields the same link.
--
-- The snapshot carries only data the product already persists for the owner
-- (title, days, items, the per-item `photo_url` the enrichment step wrote into
-- the message). Nothing about the conversation — id, other turns, tool
-- results, AI context — has a column to land in.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plan_shares (
  -- 12 URL-safe characters, ~71 bits from a CSPRNG (`newPlanShareId`). The
  -- CHECK is the wire format; a lookup with anything else is refused before
  -- it reaches the index.
  id          TEXT PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9]{12}$'),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- sha256 of the canonical snapshot. Same plan, same owner → same row.
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  -- The public representation, and nothing else. Bounded so a link can never
  -- become a dump.
  plan        JSONB NOT NULL CHECK (jsonb_typeof(plan) = 'object' AND pg_column_size(plan) <= 65536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS plan_shares_owner_idx ON public.plan_shares (owner_id, created_at DESC);

-- ── Row security: the TABLE is owner-only ───────────────────────────────────
--
-- Recipients never touch the table. They read through `plan_share_public`
-- below, which returns exactly the public columns. That split is the whole
-- privacy model: RLS filters rows, not columns, so an anon SELECT on the table
-- would have exposed `owner_id` and `fingerprint` alongside the plan.

ALTER TABLE public.plan_shares ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_shares' AND policyname='plan_shares_select_own') THEN
    CREATE POLICY "plan_shares_select_own" ON public.plan_shares
      FOR SELECT TO authenticated
      USING (owner_id = auth.uid());
  END IF;

  -- 🚨 An anonymous session carries the `authenticated` role with
  -- `is_anonymous: true` in its JWT. `REVOKE FROM anon` does not exclude it;
  -- only reading the claim does. A guest may make a plan; publishing one under
  -- a link that outlives the guest session is reserved for a real account.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_shares' AND policyname='plan_shares_insert_own') THEN
    CREATE POLICY "plan_shares_insert_own" ON public.plan_shares
      FOR INSERT TO authenticated
      WITH CHECK (
        owner_id = auth.uid()
        AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plan_shares' AND policyname='plan_shares_delete_own') THEN
    CREATE POLICY "plan_shares_delete_own" ON public.plan_shares
      FOR DELETE TO authenticated
      USING (owner_id = auth.uid());
  END IF;
END $$;

-- Supabase's default privileges grant `anon` and `authenticated` everything on
-- a new table; close it, then open exactly what the owner path uses. No UPDATE:
-- a published snapshot is immutable — share again to publish a new one.
REVOKE ALL ON TABLE public.plan_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.plan_shares TO authenticated;
GRANT ALL ON TABLE public.plan_shares TO service_role;

-- ── The public read ─────────────────────────────────────────────────────────
/**
 * The one thing a recipient may see: the snapshot behind an id.
 *
 * SECURITY DEFINER so it reads past the owner-only policy, and deliberately
 * narrow so that is all it can do: one row by exact id, three public columns,
 * no owner, no fingerprint, no listing. The id space (62^12) is the access
 * control — this is a capability URL, the same model as a shared document link.
 */
CREATE OR REPLACE FUNCTION public.plan_share_public(p_id TEXT)
RETURNS TABLE (id TEXT, plan JSONB, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.plan, s.created_at
  FROM public.plan_shares s
  WHERE s.id = p_id
$$;

-- ADR-019: declared closed, then granted to the roles that read a public link —
-- a signed-out recipient (`anon`) and a signed-in one. Registered as an
-- intentional anon grant in scripts/architecture/check-sql-grants.mjs.
REVOKE EXECUTE ON FUNCTION public.plan_share_public(TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.plan_share_public(TEXT) TO anon, authenticated, service_role;
