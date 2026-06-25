-- Phase 5: Extend user_memory with richer preference signals
-- Safe to run multiple times (IF NOT EXISTS / IF column already exists)

-- Add new columns to capture richer user personality
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS companions  text,   -- e.g. "hay đi với bạn bè", "cặp đôi"
  ADD COLUMN IF NOT EXISTS timing      text,   -- e.g. "thường đi tối cuối tuần"
  ADD COLUMN IF NOT EXISTS personality text;   -- e.g. "thích quán nhỏ local, không thích ồn"

-- Index for faster lookups (morning-brief cron fetches by user_id)
CREATE INDEX IF NOT EXISTS user_memory_user_id_idx
  ON public.user_memory (user_id);
