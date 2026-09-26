-- Phase 7 (item 4): a GROUP avatar — the group's own picture, not the creator's.
--
-- `groups` had no image column; the group page drew a static glyph. The picture is
-- uploaded through the existing avatar pipeline (`POST /api/group/[id]/avatar`:
-- magic-byte sniff, 3 MB cap, `putMedia('avatars/group-<id>-<suffix>.<ext>')`) and
-- only its public URL is stored here. Who may set it is the existing policy
-- "Creators manage own groups" (auth.uid() = creator_id) — the creator is the only
-- admin role the group model has, so no new policy is introduced.
--
-- Additive and idempotent. Rollback: 20260922_groups_avatar_url_rollback.sql.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS avatar_url text;
