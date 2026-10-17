-- AI data consent record (App Review 5.1.1(i) / 5.1.2(i)).
--
-- One row per signed-in account, written only by the server (POST /api/ai-consent, service role) after the account
-- check. Two facts are kept apart:
--   * ios_used — the account has used the iOS app. Set by any call from the app (a decision or the "asked" heartbeat).
--     Accounts that never used iOS have no iOS data to protect and keep today's behaviour (web-only, status quo).
--   * the decision — granted / decision / version. An iOS account's personal data may go to the AI provider in a
--     background task only while the decision is 'agreed' for the current disclosure version.
-- The cron jobs read it with the service role (src/lib/ai/consent/aiDataConsent.ts).
--
-- NOT APPLIED. Written for review; apply only after owner approval. Rollback: drop table public.ai_data_consent.

CREATE TABLE IF NOT EXISTS public.ai_data_consent (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- True once the iOS app has contacted the server for this account.
  ios_used BOOLEAN NOT NULL DEFAULT false,
  -- NULL = shown but not answered (or never answered). true = agreed. false = refused or withdrawn.
  granted BOOLEAN,
  -- 'agreed' | 'refused' | 'withdrawn' | NULL (no answer yet).
  decision TEXT CHECK (decision IN ('agreed', 'refused', 'withdrawn')),
  -- The disclosure version the decision was made on. An older version does not count: the user is asked again.
  version INTEGER,
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_data_consent ENABLE ROW LEVEL SECURITY;

-- A signed-in user may read their own record.
CREATE POLICY "ai_data_consent_select_own"
  ON public.ai_data_consent FOR SELECT
  USING (auth.uid() = user_id);

-- No client writes. Users cannot change their own row, so they cannot clear the iOS-use flag or re-grant consent by a
-- direct API call. Only the server writes it. There is no DELETE: the record leaves only with the account.
REVOKE INSERT, UPDATE, DELETE ON public.ai_data_consent FROM authenticated, anon;
