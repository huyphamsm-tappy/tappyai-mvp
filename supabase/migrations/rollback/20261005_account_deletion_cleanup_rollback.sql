-- Rollback for 20261005_account_deletion_cleanup.sql.
--
-- Removes the trigger and the two functions, which switches in-app deletion off (account_deletion_ready()
-- no longer exists, so the app answers 404 not_available). The queue table is KEPT: it may still hold
-- jobs for accounts that were already deleted (files and Google grants not yet cleaned), and dropping it
-- would lose them. Drop it by hand only once it is empty:
--   SELECT count(*) FROM public.account_deletion_jobs WHERE done_at IS NULL;   -- must be 0
--   DROP TABLE public.account_deletion_jobs;
--
-- Data that the trigger already removed (user_memory, decision_evidence, anon_chat_usage, notifications)
-- belonged to accounts that were deleted on purpose; there is nothing to restore.

DROP TRIGGER IF EXISTS trg_enqueue_account_deletion ON auth.users;
DROP FUNCTION IF EXISTS public.fn_enqueue_account_deletion();
DROP FUNCTION IF EXISTS public.account_deletion_ready();
