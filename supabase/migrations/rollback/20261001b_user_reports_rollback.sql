-- Rollback for 20261001b_user_reports.sql. content_reports was never touched. Drops the reports about comments/users.
BEGIN;
DROP TABLE IF EXISTS public.user_reports;
COMMIT;
