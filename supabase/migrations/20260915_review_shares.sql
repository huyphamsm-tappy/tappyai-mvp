-- 20260915_review_shares.sql
--
-- Persistent share history — the self profile's "Đã share" collection (web /profile, Android Tôi).
--
-- Until now a share left no user-visible trace: the web ShareMenu only emitted a `review_share`
-- telemetry event into `user_events` (append-only analytics, never rendered as history), and the
-- Android system share recorded nothing. This table is the product contract the collection reads.
--
-- Shape follows `review_likes` / `review_saves` (add_review_social.sql,
-- 20260712_prod_baseline_and_review_saves_indexes.sql) with two deliberate differences:
--
--   • NO UNIQUE (review_id, user_id): a share is an ACTIVITY, not a relationship. Sharing the
--     same post again is a new row; the read route collapses rows per review for the grid.
--   • `channel`: which target completed — the web ShareMenu's target id ('copy', 'native',
--     'facebook', 'zalo', 'tiktok') or the Android chooser's chosen package ('android:<pkg>').
--     Free text bounded by length, so a new target never needs a migration.
--
-- Written only by the API routes AFTER a share succeeded (see POST /api/reviews/[id]/share);
-- RLS additionally pins every row to the bearer and shuts anonymous sessions out at the
-- database, so a client that talks to PostgREST directly gains nothing.
--
-- Fully idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.review_shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    text NOT NULL DEFAULT 'unknown' CHECK (char_length(channel) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Owner + chronological read (GET /api/reviews/shared): one range scan, newest first.
CREATE INDEX IF NOT EXISTS review_shares_user_created_idx ON public.review_shares (user_id, created_at DESC);
-- FK cascade / per-review lookups.
CREATE INDEX IF NOT EXISTS review_shares_review_id_idx ON public.review_shares (review_id);

ALTER TABLE public.review_shares ENABLE ROW LEVEL SECURITY;

-- Own rows only, and never for an anonymous session: the anonymous tier is chat + browsing
-- (B17, src/lib/auth/socialWriteAccess.ts) and that boundary is enforced HERE as well, not
-- only in the API. Supabase stamps `is_anonymous` into the JWT for anonymous sign-ins.
DROP POLICY IF EXISTS review_shares_select_own ON public.review_shares;
CREATE POLICY review_shares_select_own ON public.review_shares
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

DROP POLICY IF EXISTS review_shares_insert_own ON public.review_shares;
CREATE POLICY review_shares_insert_own ON public.review_shares
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

DROP POLICY IF EXISTS review_shares_delete_own ON public.review_shares;
CREATE POLICY review_shares_delete_own ON public.review_shares
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy: history is append-only. No policy for `anon`: nothing is visible to it.
