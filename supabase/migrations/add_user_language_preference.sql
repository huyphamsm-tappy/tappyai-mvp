-- Add UI language preference to profiles (Localization_Architecture.md §3).
-- Nullable — NULL means "not set yet", client falls back to device-locale detection.
-- Deliberately NOT adding ai_language: the AI response language is not stored per
-- user, and this column is never read by the chat route. Still true after ADR-027
-- (2026-09-09), which changed only HOW a request's language is resolved — explicit
-- request, then what the message text clearly says, then the locale the CLIENT sent
-- on that request, then detection. Nothing about it is persisted, so no schema here
-- changes. The older wording ("stays auto-detected per-message, already correct")
-- described the pre-ADR-027 chain and no longer does; see ADR-027 §2, which amends
-- Localization_Architecture.md §2.3.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text;
