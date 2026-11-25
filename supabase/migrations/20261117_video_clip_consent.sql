-- Explore video: the account's explicit acceptance of the conditions for POSTING A CLIP (owner 05/11/2026: "user phải chấp nhận điều kiện thì mới đăng clip, không thì không được đăng").
-- Separate from ai_data_consent on purpose: that table only gates accounts that have used the iOS app (a web-only account counts as allowed there), but the owner's rule is that EVERY
-- account must accept before a clip is posted: its frames, speech and on-screen text go to an AI provider for moderation. Additive; service-role only (the routes write after the account check).
--
--  video_clip_consents: one row per account: the version of the wording accepted, when, and when it was withdrawn (NULL = in force). A new wording is a new version: the old row stops counting.
-- Rollback: rollback/20261117_video_clip_consent_rollback.sql.

CREATE TABLE IF NOT EXISTS public.video_clip_consents (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version      integer     NOT NULL,
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz NULL,
  CONSTRAINT video_clip_consents_version_check CHECK (version >= 1)
);

ALTER TABLE public.video_clip_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_clip_consents FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.video_clip_consents TO service_role;
