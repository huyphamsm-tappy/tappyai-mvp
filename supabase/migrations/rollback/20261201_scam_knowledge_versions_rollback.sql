-- Rollback of 20261201_scam_knowledge_versions.sql. Safe at any time: the reader fails open to the static dataset when the table is absent.
-- Data loss: the stored official pages (they can be re-read by the weekly job).
DROP TABLE IF EXISTS public.scam_knowledge_versions;
