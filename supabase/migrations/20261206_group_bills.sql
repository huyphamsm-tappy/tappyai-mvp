-- Group dining: the bill of the meal (owner 20/11/2026: equal split by default, editable by hand, with optional personal items).
--
-- One bill per group (a participant who paid enters it and is its PAYER). The shares are COMPUTED by the server from these numbers (src/lib/group/splitBill.ts), never stored: what is stored is what a
-- person typed (total, tip, personal items, who is left out) and who has paid the payer back. Whole dong only. Like the votes, the bill is private to the group: the creator and the accepted members
-- read it, nobody else does, and nobody writes it except the server (with the service role, after checking who is asking).
-- Rollback: rollback/20261206_group_bills_rollback.sql.

CREATE TABLE IF NOT EXISTS public.group_bills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL UNIQUE REFERENCES public.groups(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_vnd bigint NOT NULL CHECK (total_vnd BETWEEN 1 AND 1000000000),
  tip_vnd bigint NOT NULL DEFAULT 0 CHECK (tip_vnd BETWEEN 0 AND 1000000000),
  -- personal items [{name, amountVnd, forId}], at most 20
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 20),
  -- the people left out of the shared part (user ids)
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(excluded) = 'array' AND jsonb_array_length(excluded) <= 20),
  -- who has paid the payer back: {user_id: true}
  paid jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(paid) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_bills ENABLE ROW LEVEL SECURITY;
-- ADR-019: a new table in this schema is born open to anon and authenticated: close it, then open only the read for participants.
REVOKE ALL ON public.group_bills FROM anon, authenticated;
GRANT SELECT ON public.group_bills TO authenticated;
DROP POLICY IF EXISTS group_bills_select_participant ON public.group_bills;
CREATE POLICY group_bills_select_participant ON public.group_bills
  FOR SELECT TO authenticated
  USING (public.fn_group_participant(group_id));
-- (no INSERT / UPDATE / DELETE policy and no grant: the server writes the bill with the service role)
