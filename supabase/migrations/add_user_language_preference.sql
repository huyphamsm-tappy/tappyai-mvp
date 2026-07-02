-- Add UI language preference to profiles (Localization_Architecture.md §3).
-- Nullable — NULL means "not set yet", client falls back to device-locale detection.
-- Deliberately NOT adding ai_language: AI response language stays auto-detected
-- per-message (already correct, see src/lib/ai/intent.ts detectLang) and is not
-- stored per-user, per Localization_Architecture.md §2.3.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text;
