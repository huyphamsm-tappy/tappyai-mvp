-- ============================================================================
-- ROLLBACK for supabase/migrations/20260901_marketing_governance_foundation.sql
-- V2.2-2 Marketing Phase 2 -- governance foundation.
--
-- !! THIS DROPS THREE TABLES AND EVERYTHING IN THEM. Read the paragraphs below
--    before running it; the tables are not equally safe to lose.
--
-- `marketing_campaigns` and `notification_deliveries` are operational records.
-- Dropping them loses campaign history and the delivery ledger. The ledger is
-- also the frequency cap's history (M-6c) and the idempotency ledger (M-34), so
-- dropping it means an immediately re-run campaign could notify people who were
-- already notified, and the rolling 24h/7d windows would read empty. Do not
-- roll back while a campaign is in flight.
--
-- !! `marketing_consent` IS DIFFERENT IN KIND, AND THIS IS THE PARAGRAPH THAT
--    MATTERS. It records what people AGREED to and what they REVOKED. Dropping
--    it destroys both, and re-applying the migration recreates it EMPTY -- at
--    which point every user reads as opted out. That direction is safe:
--    "absence means opted out" (M-1) means a lost consent table silences
--    marketing rather than unleashing it, and a person who opted in simply has
--    to opt in again.
--
--    What is NOT recoverable is the evidence. A user who unsubscribed leaves
--    `opted_out_at` behind precisely so that revocation can be proved later
--    (M-24); after this rollback that proof is gone, and their state is
--    indistinguishable from someone who never engaged. If there is any chance
--    that evidence will be wanted, dump the table before dropping it:
--
--        \copy public.marketing_consent TO 'marketing_consent_backup.csv' CSV HEADER
--
-- >> ORDER MATTERS AND IS NOT COSMETIC. `notification_deliveries` holds an
--    `ON DELETE RESTRICT` foreign key to `marketing_campaigns` (M-27a).
--    Dropping campaigns first fails. Deliveries are dropped first below for
--    exactly that reason -- the same order the prune job must use.
--
-- IDEMPOTENT: safe to run repeatedly.
-- ============================================================================

-- Deliveries first: they reference campaigns with ON DELETE RESTRICT.
DROP TABLE IF EXISTS public.notification_deliveries;

DROP TABLE IF EXISTS public.marketing_campaigns;

-- Last, and the one worth pausing over. See the paragraph above.
DROP TABLE IF EXISTS public.marketing_consent;


-- ============================================================================
-- VERIFICATION (run after rollback; read-only)
--
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('marketing_consent','marketing_campaigns','notification_deliveries');
--                                            -- 0
-- ============================================================================
