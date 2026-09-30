-- ---------------------------------------------------------------------------
-- security-audit L3 . comments on a held review are not public
--
-- WHY. 20260818_publication_boundary_rls.sql hides a held review (publication_state UNDER_REVIEW or
-- RESTRICTED) from everyone but its author. Its comments did not follow: review_comments is read
-- through "Anyone can read comments" USING (true) (add_social_week2.sql), so anyone holding the
-- review id could read them with the anon key via /rest/v1/review_comments?review_id=eq.<id>.
--
-- WHAT. One RESTRICTIVE SELECT policy, the same pattern as reviews_publication_boundary: it is ANDed
-- with the existing permissive policy, which it neither reads nor drops. A comment is readable when
--   * its review is publishable (publication_state NULL or PUBLISHED - legacy rows stay public), or
--   * the caller is the review's author, or
--   * the caller is a moderator: a non-expired admin_roles row with role moderator / admin /
--     super_admin (the roles that hold moderation.queue.read in src/lib/admin/permissions/registry.ts),
--     or the active platform owner. Mirrors resolvePrincipal() in src/lib/admin/rbac.ts.
-- The test lives in SECURITY DEFINER helpers because admin_roles and platform_owner are
-- deny-by-default to anon/authenticated, and because the reviews table's own RLS (including the
-- production-only "Read visible reviews" NOT is_hidden) must not silently decide comment visibility.
-- Only publication_state does; nothing about is_hidden changes.
--
-- SIDE EFFECTS (intended):
--   * someone who is not the author can no longer comment on a held review: the route's
--     INSERT ... RETURNING fails, nothing is written and no push goes out (it answered 200 before);
--   * a non-author's own old comment on a held review is invisible to them - and so cannot be
--     deleted - while the review is held. It is back the moment the review is published.
-- NOT changed: comment_count (maintained by a SECURITY DEFINER trigger), comment_reactions, the
-- back office (service_role has BYPASSRLS), and every comment on a published review.
--
-- DEPLOY. No code dependency - apply any time. GATE: production ONLY under explicit Owner
-- authorization. Idempotent. Rollback: rollback/20260928c_review_comments_publication_boundary_rollback.sql
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'publication_state') THEN
    RAISE EXCEPTION 'L3 pre-flight: public.reviews.publication_state is missing (20260817_content_safety_gate.sql not applied)';
  END IF;
  IF to_regclass('public.review_comments') IS NULL
     OR to_regclass('public.admin_roles') IS NULL
     OR to_regclass('public.platform_owner') IS NULL THEN
    RAISE EXCEPTION 'L3 pre-flight: review_comments / admin_roles / platform_owner is missing';
  END IF;
END $$;

-- Is the caller someone who moderates content? Answers only about the caller (auth.uid()).
CREATE OR REPLACE FUNCTION public.is_content_moderator()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.admin_roles a
             WHERE a.user_id = auth.uid()
               AND a.role::text IN ('moderator', 'admin', 'super_admin')
               AND (a.expires_at IS NULL OR a.expires_at > now()))
    OR EXISTS (SELECT 1 FROM public.platform_owner o
                WHERE o.user_id = auth.uid() AND o.active)
  )
$$;

-- May the caller read the comments of this review?
CREATE OR REPLACE FUNCTION public.review_comments_readable(p_review_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.reviews r
                  WHERE r.id = p_review_id
                    AND (r.publication_state IS NULL
                         OR r.publication_state = 'PUBLISHED'
                         OR (auth.uid() IS NOT NULL AND r.user_id = auth.uid())))
      OR public.is_content_moderator()
$$;

-- ADR-019: name every role in the REVOKE (Supabase's default privileges grant anon and
-- authenticated explicitly), then grant back exactly the callers. Both are evaluated inside a
-- RESTRICTIVE policy for anon and authenticated, so both roles must keep EXECUTE.
REVOKE ALL ON FUNCTION public.is_content_moderator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_comments_readable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_moderator() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_comments_readable(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS review_comments_publication_boundary ON public.review_comments;

CREATE POLICY review_comments_publication_boundary
  ON public.review_comments
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (public.review_comments_readable(review_id));

COMMENT ON POLICY review_comments_publication_boundary ON public.review_comments IS
  'security-audit L3. RESTRICTIVE: comments of a held review (UNDER_REVIEW / RESTRICTED) are readable only by the review author and moderators.';
