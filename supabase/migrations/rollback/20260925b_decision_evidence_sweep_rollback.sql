-- Rollback for 20260925b_decision_evidence_sweep.sql: drops the sweep function only.
-- Expired decision_evidence rows then accumulate again (F-097); the cron route answers 500 until re-applied.
DROP FUNCTION IF EXISTS public.decision_evidence_sweep(INTEGER);
