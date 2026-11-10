-- Chat workspace (desktop), slice 3: PROJECTS (owner 10/11/2026) — a person groups their own conversations under a named project. One new table and one nullable column; nothing reads
-- or writes them until the chat workspace flag (NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED) is on, and every existing conversation stays "not in a project".
--
--  chat_projects: id, owner, title (1-80 characters), optional description (up to 300), timestamps. Row-level security, owner-only, same shape as "Users can manage own conversations".
--  conversations.project_id: nullable, ON DELETE SET NULL (deleting a project never deletes a conversation). A trigger refuses a project that belongs to someone else, because a foreign key
--  alone would accept any existing project id.
-- Requires 20261118 only for the order of the changelog; independent of it. Rollback: rollback/20261119_chat_projects_rollback.sql.

CREATE TABLE IF NOT EXISTS public.chat_projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_projects_title_check       CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT chat_projects_description_check CHECK (description IS NULL OR char_length(description) <= 300)
);

CREATE INDEX IF NOT EXISTS chat_projects_user_idx ON public.chat_projects (user_id, updated_at DESC);

ALTER TABLE public.chat_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own chat projects" ON public.chat_projects;
CREATE POLICY "Users can manage own chat projects" ON public.chat_projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.chat_projects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_projects TO authenticated;
GRANT ALL ON public.chat_projects TO service_role;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.chat_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_project_idx ON public.conversations (project_id) WHERE project_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.conversations_project_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chat_projects p WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'a conversation can only be put in a project of the same account' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.conversations_project_owner_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conversations_project_owner_guard ON public.conversations;
CREATE TRIGGER conversations_project_owner_guard
  BEFORE INSERT OR UPDATE OF project_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_project_owner_guard();
