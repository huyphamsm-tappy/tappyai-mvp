-- Cron diagnostics (owner 28/11/2026): the Vercel log of a cron lives about an hour, so what a run saw is kept here. First user: /api/cron/deal-ingest records why an Accesstrade
-- answer produced no usable offer (counts by reason, key names, host names; never a key, a code or a full link).
-- Service-role only: RLS on, no policy, every grant to PUBLIC / anon / authenticated revoked. Additive; nothing else reads or writes it. Rollback in supabase/migrations/rollback/.

CREATE TABLE IF NOT EXISTS public.cron_diagnostics (
  id         bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  job        text NOT NULL CHECK (length(job) BETWEEN 1 AND 60),
  partner    text CHECK (partner IS NULL OR length(partner) <= 60),
  kind       text NOT NULL CHECK (length(kind) BETWEEN 1 AND 60),
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(detail) <= 16384)
);

CREATE INDEX IF NOT EXISTS cron_diagnostics_job_created_idx ON public.cron_diagnostics (job, created_at DESC);

ALTER TABLE public.cron_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_diagnostics FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cron_diagnostics TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cron_diagnostics_id_seq TO service_role;
