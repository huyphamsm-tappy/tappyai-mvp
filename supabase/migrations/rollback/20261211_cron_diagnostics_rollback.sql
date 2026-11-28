-- Rollback of 20261211_cron_diagnostics.sql. The deal importer keeps working: it stores diagnostics best effort and ignores a missing table.
DROP TABLE IF EXISTS public.cron_diagnostics;
