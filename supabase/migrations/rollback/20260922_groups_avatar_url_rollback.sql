-- Rollback of 20260922_groups_avatar_url.sql. Drops the column (and the URLs in it);
-- the uploaded objects under avatars/group-* are not deleted by this statement.
ALTER TABLE public.groups
  DROP COLUMN IF EXISTS avatar_url;
