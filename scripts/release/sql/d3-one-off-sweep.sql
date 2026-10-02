-- DEPLOY-CHECKLIST §1-D3 one-off cleanup, same session as the D3 migration.
-- Deletes ONLY decision_evidence rows whose expires_at has passed; bounded at 5000 per call.
-- Re-run this file while it returns 5000. D2 is DEFERRED in this release, so the checklist's
-- "VALIDATE CONSTRAINT decision_evidence_owner_id_fkey" step does NOT apply (the FK does not exist).
SELECT public.decision_evidence_sweep() AS deleted;
