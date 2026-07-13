-- 20260712_prod_baseline_and_review_saves_indexes.sql
--
-- Two production-readiness gaps closed here:
--
--   1. `review_saves` and `subscriptions` exist in the live production database
--      but have NO CREATE TABLE migration (they were applied out-of-band in the
--      SQL editor). A fresh / disaster-recovery environment therefore cannot be
--      provisioned from the migration set. Defined below with IF NOT EXISTS so
--      this file is a no-op against the existing prod schema.
--
--   2. `review_saves` has NO indexes, yet it is queried by `user_id` on every
--      feed load (reviews/feed) and the saved-list (reviews/saved), and by
--      `review_id` in the save-count trigger. Every such query is a full table
--      scan today. `review_likes` already has these indexes (add_review_social).
--
-- Fully idempotent: safe to run against the existing production database.

-- ── review_saves ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_saves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_saves_user_idx      ON public.review_saves (user_id);
CREATE INDEX IF NOT EXISTS review_saves_review_id_idx ON public.review_saves (review_id);

ALTER TABLE public.review_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_saves_select_own ON public.review_saves;
CREATE POLICY review_saves_select_own ON public.review_saves
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS review_saves_insert_own ON public.review_saves;
CREATE POLICY review_saves_insert_own ON public.review_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS review_saves_delete_own ON public.review_saves;
CREATE POLICY review_saves_delete_own ON public.review_saves
  FOR DELETE USING (auth.uid() = user_id);

-- ── subscriptions ─────────────────────────────────────────────────────────────
-- Column set mirrors the live production schema (see
-- supabase/_prod_schema_partial_introspection.md): stripe_sub_id + plan, NOT
-- stripe_subscription_id / price_id.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id   text,
  stripe_sub_id        text,
  plan                 text,
  status               text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)   -- required by the ON CONFLICT (user_id) upserts in Stripe + Apple IAP
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions (user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users may read ONLY their own subscription. There is deliberately NO
-- INSERT/UPDATE/DELETE policy for authenticated users: all writes go through the
-- service-role client (Stripe webhook + Apple IAP verify), which bypasses RLS.
-- Without RLS enabled, a raw anon PostgREST call could enumerate every user's
-- billing status — this migration closes that exposure on a DR-provisioned DB.
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
