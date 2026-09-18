-- Rollback for 20260915_review_shares.sql
--
-- 🚨 DESTRUCTIVE: drops the share-history table and every row in it. The forward migration is
-- additive (a new table with its own indexes and policies; nothing else touched), so undoing it
-- is exactly this drop. Policies and indexes go with the table.
--
-- Run only on a project where the history can be lost (the audit project), never on production
-- unless the owner has decided the "Đã share" collection is being withdrawn.

DROP TABLE IF EXISTS public.review_shares;
