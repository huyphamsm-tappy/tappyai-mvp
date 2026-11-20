-- Group dining is PRIVATE: a person needs a Tappy account AND the group leader's acceptance (owner 20/11/2026: "can co tai khoan Tappy va phai duoc truong nhom moi va chap nhan vi day la rieng tu,
-- dau phai thong tin public").
--
-- Until now the invite link WAS the membership: anyone holding it, with any account, wrote their name, budget and dietary restrictions into the group and then read everyone else's. Now opening the
-- link only files a REQUEST (a group_members row with status 'pending'); the leader accepts it (status 'member') or declines it (the row is deleted), both done by the server with the service role,
-- never by the caller. Who reads what:
--   creator            the group and every row, pending requests included (to decide on them)
--   accepted member    the group and the ACCEPTED members only (never another person's pending request)
--   pending person     their own request row and nothing else
--   anyone else        nothing
-- Members who joined before this migration keep working: the new column defaults to 'member'.
-- Rollback: rollback/20261204_group_join_approval_rollback.sql.

ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'member';
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_status_check;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_status_check CHECK (status IN ('pending', 'member'));

-- 1. A participant is the creator or an ACCEPTED member (a pending request is not a membership) ----------------
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
    WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.status = 'member'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_group_participant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_group_participant(uuid) TO authenticated;

-- 2. Is the caller the creator? (the creator alone reads the pending requests of others) ------------------------
CREATE OR REPLACE FUNCTION public.fn_group_creator(p_group uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups g WHERE g.id = p_group AND g.creator_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.fn_group_creator(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_group_creator(uuid) TO authenticated;

-- 3. A caller can only file a REQUEST for themselves: never a membership ---------------------------------------
-- The existing insert policy (add_group_members_auth.sql: only a row for yourself) is NOT redefined here: the undated add_*.sql files replay after every dated migration when a database is
-- built by file name, and would silently put the old policy back. A TRIGGER survives any replay order: whatever status a caller writes, the row a caller inserts is 'pending'. Only the server
-- (service role / owner: the leader's accept) writes a 'member' row.
CREATE OR REPLACE FUNCTION public.fn_group_member_force_pending()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS group_members_force_pending ON public.group_members;
CREATE TRIGGER group_members_force_pending
  BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.fn_group_member_force_pending();

-- 4. Who reads which row ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS group_members_select_participant ON public.group_members;
DROP POLICY IF EXISTS group_members_select_visible ON public.group_members;
CREATE POLICY group_members_select_visible ON public.group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.fn_group_creator(group_id)
    OR (public.fn_group_participant(group_id) AND status = 'member')
  );
-- (no UPDATE policy exists: nobody can change their own status; the leader's accept is made by the server)
