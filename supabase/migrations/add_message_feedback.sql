-- ============================================================================
-- message_feedback — per-message 👍/👎/report for chat replies (MessageActionBar)
-- ============================================================================
-- Backs /api/message-feedback (upsert on user_id,conversation_id,message_index,type;
-- delete by the same keys). No FK on conversation_id on purpose: feedback can be
-- given on an unsaved/anonymous conversation that isn't a row in `conversations`.
-- Idempotent; safe to re-run.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.message_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  message_index   integer NOT NULL,
  type            text NOT NULL CHECK (type IN ('like', 'dislike', 'report')),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id, message_index, type)
);

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_feedback" ON public.message_feedback;
CREATE POLICY "users_manage_own_feedback"
  ON public.message_feedback
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS message_feedback_user_idx ON public.message_feedback (user_id);
