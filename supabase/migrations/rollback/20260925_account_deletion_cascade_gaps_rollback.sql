-- Rollback for 20260925_account_deletion_cascade_gaps.sql.
-- Drops only the two foreign keys that migration added; no data is touched.
-- After this, deleting an Auth user again leaves decision_evidence and
-- anon_chat_usage rows behind (F-093) — roll back only to unblock a release.
ALTER TABLE public.decision_evidence DROP CONSTRAINT IF EXISTS decision_evidence_owner_id_fkey;
ALTER TABLE public.anon_chat_usage   DROP CONSTRAINT IF EXISTS anon_chat_usage_user_id_fkey;
