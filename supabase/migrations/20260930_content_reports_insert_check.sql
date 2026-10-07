-- ---------------------------------------------------------------------------
-- security audit 2026-09-30 · a content report can only be filed as yourself, as an open report
--
-- GATE: applied to production ONLY under explicit Owner authorization. No code dependency — the
-- route (POST /api/reviews/[id]/report) already writes exactly what this policy admits.
--
-- WHY. 20260817_content_safety_gate.sql created
--   "Users can file a content report" ... FOR INSERT TO authenticated WITH CHECK (true)
-- and relied on the route to fill the row. PostgREST does not go through the route, so any
-- signed-in user could insert, straight to /rest/v1/content_reports:
--   * any reporter_source_id — N rows with N invented ids read as N DIFFERENT reporters, which is
--     exactly the corroboration count (`distinctSourceCount`) moderators are shown;
--   * verification_state 'VERIFIED' — the one value the schema says "contributes an evidence
--     basis";
--   * status 'closed' / 'reviewing', and a back-dated created_at.
-- Measured on the audit database 2026-09-30 (catalog read only): the policy is WITH CHECK (true)
-- and `authenticated` holds INSERT on every column.
--
-- WHAT.
--   1. The policy pins the row to the caller: reporter_source_id must be the caller's own opaque id,
--      sha256('content_report:' || auth.uid()) in hex — the value the route already computes with
--      node:crypto — and the lifecycle columns must be the defaults. Anonymous sessions may not file
--      (the route refuses them too).
--   2. Column privileges: authenticated may supply only content_id, reporter_source_id, reason and
--      policy_id; id / created_at / verification_state / status always take their defaults.
--   anon keeps nothing. Service role is untouched (the moderation pipeline reads and resolves).
--
-- Idempotent. Rollback: rollback/20260930_content_reports_insert_check_rollback.sql
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.content_reports') IS NULL THEN
    RAISE EXCEPTION 'content_reports_insert_check: public.content_reports is missing (20260817_content_safety_gate.sql not applied)';
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can file a content report" ON public.content_reports;
CREATE POLICY "Users can file a content report"
  ON public.content_reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND reporter_source_id = encode(sha256(convert_to('content_report:' || auth.uid()::text, 'UTF8')), 'hex')
    AND verification_state = 'UNVERIFIED'
    AND status = 'open'
  );

REVOKE INSERT ON TABLE public.content_reports FROM anon, authenticated;
GRANT INSERT (content_id, reporter_source_id, reason, policy_id) ON TABLE public.content_reports TO authenticated;
