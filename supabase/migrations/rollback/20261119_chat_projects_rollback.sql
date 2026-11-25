-- Rollback of 20261119_chat_projects.sql. Removes the trigger, the project_id column and the chat_projects table. Every conversation and message is kept; they simply stop belonging to a project.

DROP TRIGGER IF EXISTS conversations_project_owner_guard ON public.conversations;
DROP FUNCTION IF EXISTS public.conversations_project_owner_guard();
DROP INDEX IF EXISTS public.conversations_project_idx;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS public.chat_projects;
