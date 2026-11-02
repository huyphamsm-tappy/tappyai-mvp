-- Rollback of 20261101_ai_usage_events.sql: the ledger is reporting only (no limit reads it), so dropping it changes no behaviour.
DROP TABLE IF EXISTS public.ai_usage_events;
