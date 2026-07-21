-- Comment replies + multi-reaction system.
-- Adds threaded replies to review_comments and a flexible per-comment reaction table
-- (one reaction per user per comment, changeable, extensible reaction types without schema
-- redesign). Idempotent so it is safe to re-run.

-- ── 1) Replies: self-referencing parent on review_comments ──────────────────────────────
ALTER TABLE public.review_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
    REFERENCES public.review_comments(id) ON DELETE CASCADE;

-- Fast lookup of a comment's replies, newest-thread ordering.
CREATE INDEX IF NOT EXISTS review_comments_parent_idx
  ON public.review_comments (parent_comment_id, created_at);

-- ── 2) Reactions: one row per (comment, user); reaction is a free-text key so new types
--        (beyond like/love/haha/wow/sad/angry) can be added later with NO schema change. ──
CREATE TABLE IF NOT EXISTS public.comment_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.review_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction   text NOT NULL CHECK (char_length(reaction) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One reaction per user per comment; changing a reaction is an UPDATE of this row.
  CONSTRAINT comment_reactions_one_per_user UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_reactions_comment_idx
  ON public.comment_reactions (comment_id);
CREATE INDEX IF NOT EXISTS comment_reactions_user_idx
  ON public.comment_reactions (user_id);

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

-- Reads are public (counts are shown to everyone), writes are limited to the owner's own row.
DROP POLICY IF EXISTS "Anyone can read comment reactions" ON public.comment_reactions;
CREATE POLICY "Anyone can read comment reactions"
  ON public.comment_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can add own reaction" ON public.comment_reactions;
CREATE POLICY "Users can add own reaction"
  ON public.comment_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can change own reaction" ON public.comment_reactions;
CREATE POLICY "Users can change own reaction"
  ON public.comment_reactions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own reaction" ON public.comment_reactions;
CREATE POLICY "Users can remove own reaction"
  ON public.comment_reactions FOR DELETE
  USING (auth.uid() = user_id);
