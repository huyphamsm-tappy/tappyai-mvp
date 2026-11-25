-- Rollback of 20261204_group_join_approval.sql: back to "the link is the membership". Pending requests are LOST (deleted), accepted members stay.
DELETE FROM public.group_members WHERE status = 'pending';

DROP POLICY IF EXISTS group_members_select_visible ON public.group_members;
CREATE POLICY group_members_select_participant ON public.group_members
  FOR SELECT TO authenticated
  USING (public.fn_group_participant(group_id));

DROP TRIGGER IF EXISTS group_members_force_pending ON public.group_members;
DROP FUNCTION IF EXISTS public.fn_group_member_force_pending();

CREATE OR REPLACE FUNCTION public.fn_group_participant(p_group uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group AND g.creator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = p_group AND m.user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_group_participant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_group_participant(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_group_creator(uuid);
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members DROP COLUMN IF EXISTS status;
