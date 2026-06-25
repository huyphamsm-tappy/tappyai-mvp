-- Add bio and updated_at columns to profiles for profile edit feature
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio         text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();
