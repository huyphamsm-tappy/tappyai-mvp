-- AI usage ledger: what each AI turn cost, per account and plan (owner 01/11/2026: "bảng thống kê chi phí - làm ngay").
--
-- One row per AI turn of a signed-in account, written only by the server (service role) after the turn ends
-- (src/lib/ai/usage/usageLedger.ts, behind AI_USAGE_LEDGER=1). It is for COST REPORTING - what each plan really costs, the
-- heaviest accounts, the quick / thorough search mix - and never decides a limit (the limits live in the shared rate-limit
-- store, src/lib/ai/quota). No question, no answer, no query, no URL is stored: only counts, the mode and the price.
--
-- NOT APPLIED. Written for review; apply only after owner approval. Rollback: rollback/20261101_ai_usage_events_rollback.sql.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- the account's plan when the turn ran: guest | free | trial | pro | promax (and the older plan ids while they last)
  plan TEXT NOT NULL CHECK (char_length(plan) BETWEEN 1 AND 24),
  -- the composer mode: chat | web | think | deep | auto (Tự động, stayed Chat) | auto_think (Tự động, the model turned thinking on)
  mode TEXT NOT NULL CHECK (mode IN ('chat', 'web', 'think', 'deep', 'auto', 'auto_think')),
  -- the deepest web lookup of the turn: none | quick | thorough
  search_depth TEXT NOT NULL DEFAULT 'none' CHECK (search_depth IN ('none', 'quick', 'thorough')),
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0 AND cost_usd < 100),
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  serper_calls INTEGER NOT NULL DEFAULT 0 CHECK (serper_calls >= 0),
  parallel_calls INTEGER NOT NULL DEFAULT 0 CHECK (parallel_calls >= 0),
  -- false = the turn failed and its question was given back
  ok BOOLEAN NOT NULL DEFAULT true
);

-- 02/11 (owner: "bật bảng đo để coi chi phí câu thường, web search, nghiên cứu sâu"): the cost split the decisions need. Added with
-- IF NOT EXISTS so the file applies the same on a fresh table and on one created from the first version of this file. Counts and prices only.
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS llm_usd NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (llm_usd >= 0 AND llm_usd < 100);
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS serper_usd NUMERIC(10, 6) NOT NULL DEFAULT 0 CHECK (serper_usd >= 0 AND serper_usd < 100);
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS cached_tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens_in >= 0);
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0);
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS serper_cache_hits INTEGER NOT NULL DEFAULT 0 CHECK (serper_cache_hits >= 0);
-- the kind of turn the server logged (one_brain, ask, plan, deep_research, ...): short lowercase word
ALTER TABLE public.ai_usage_events ADD COLUMN IF NOT EXISTS turn_type TEXT NOT NULL DEFAULT '' CHECK (char_length(turn_type) <= 24);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_time ON public.ai_usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_time ON public.ai_usage_events (created_at);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- No policy for users: only the server (service role, which bypasses RLS) writes and reads. A user cannot read, write or
-- delete rows, their own included; the rows leave with the account (ON DELETE CASCADE).
REVOKE ALL ON public.ai_usage_events FROM anon, authenticated;
