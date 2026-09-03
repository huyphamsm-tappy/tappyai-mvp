-- ============================================================================
-- Security Issue (High): group membership is readable by ANYONE, in bulk
-- ============================================================================
--
-- WHAT IS EXPOSED
-- ---------------
-- `add_groups.sql` created two policies that were never narrowed:
--
--   CREATE POLICY "Anyone can read groups"        ... FOR SELECT USING (true);
--   CREATE POLICY "Anyone can read group members" ... FOR SELECT USING (true);
--
-- `group_members` holds, per person: `name`, `area`, `budget`,
-- `food_preferences` and `dietary_restrictions` — and since
-- `add_group_members_auth.sql`, a `user_id` that ties all of it to an account.
-- Dietary restrictions are health- and religion-adjacent data about a named
-- person in a named neighbourhood.
--
-- WHY `USING (true)` IS NOT "SHARE BY LINK"
-- -----------------------------------------
-- 🚨 The anon key is PUBLIC — it ships in the browser bundle and in the iOS
-- app (05_DATABASE_CONTRACT.md §Clients). RLS is therefore the ONLY thing
-- between the open internet and this table, and `USING (true)` does not mean
-- "readable by someone holding the link". PostgREST takes a filter from the
-- CALLER, so it means:
--
--     GET /rest/v1/group_members?select=name,area,budget,dietary_restrictions
--
-- returns every member of every group ever created, to anyone, with no account.
-- Row-level security cannot distinguish "asked for one id" from "asked for all
-- rows" — only the policy predicate decides, and `true` decides nothing.
--
-- This is not hypothetical for this codebase. On 2026-08-18 an anonymous
-- PostgREST client was MEASURED reading `reviews` rows that the application
-- believed were held (20260818_publication_boundary_rls.sql). Same key, same
-- mechanism, different table. And `add_group_members_auth.sql` already fixed
-- the INSERT half of this very table under the heading "Security Issue (High)"
-- — it simply did not touch SELECT.
--
-- WHAT REPLACES IT
-- ----------------
-- Reads are scoped to the people with a relationship to the group: its creator,
-- and the members who joined it. `TO authenticated` removes `anon` from the
-- policy entirely, so the unauthenticated bulk path returns nothing at all.
--
-- THE PRODUCT IS UNCHANGED. Share-by-link still works, because it never needed
-- this policy: `/api/group?id=…` serves the link holder, and that route now
-- reads through the service-role client keyed by the id it was given. The
-- capability stays the UUID in the link — which is what the feature always
-- meant — instead of "everyone, always".
--
-- WHY A SECURITY DEFINER HELPER RATHER THAN AN INLINE `EXISTS`
-- -----------------------------------------------------------
-- 🚨 "Members of my group may read the group" and "members of my group may read
-- the membership" reference each other. Written inline, the `groups` policy
-- queries `group_members`, whose policy queries `groups`, and PostgreSQL raises
-- `infinite recursion detected in policy for relation`. A SECURITY DEFINER
-- function runs as the table owner, so the lookups inside it are not themselves
-- policy-checked and the cycle is broken.
--
-- It answers only about the CALLER (`auth.uid()`), so it discloses nothing: the
-- worst an authenticated caller learns is whether they themselves belong to a
-- group id they already had to know to ask about.
-- ============================================================================

-- 1. The participant test ----------------------------------------------------
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

-- ADR-019: a new function in this schema is BORN granted to anon and
-- authenticated. Revoke both, then grant back only the role that evaluates the
-- policies — `authenticated`. `anon` must never be able to probe membership.
REVOKE EXECUTE ON FUNCTION public.fn_group_participant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_group_participant(uuid) TO authenticated;

-- 2. Groups: participants only ----------------------------------------------
DROP POLICY IF EXISTS "Anyone can read groups" ON public.groups;
DROP POLICY IF EXISTS groups_select_participant ON public.groups;
CREATE POLICY groups_select_participant ON public.groups
  FOR SELECT TO authenticated
  USING (public.fn_group_participant(id));

-- 3. Membership: participants only -------------------------------------------
DROP POLICY IF EXISTS "Anyone can read group members" ON public.group_members;
DROP POLICY IF EXISTS group_members_select_participant ON public.group_members;
CREATE POLICY group_members_select_participant ON public.group_members
  FOR SELECT TO authenticated
  USING (public.fn_group_participant(group_id));
