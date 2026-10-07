-- Rollback for 20260928c_review_comments_publication_boundary.sql.
-- Deletes no data. Restores the prior behaviour exactly: "Anyone can read comments" USING (true) decides alone.
-- 🚨 Reopens security-audit L3: comments of held reviews are readable by anyone who has the review id.
DROP POLICY IF EXISTS review_comments_publication_boundary ON public.review_comments;
DROP FUNCTION IF EXISTS public.review_comments_readable(uuid);
DROP FUNCTION IF EXISTS public.is_content_moderator();
