-- Group dining: the suggestion as cards, the vote, the decision (owner 20/11/2026).
--
--   groups.suggestion_options  the up-to-3 suggested places as cards [{id, name, address, rating, why, maps_link, photo_url}] (the text column `suggestion` stays: the mobile apps read it)
--   groups.chosen_option       the id of the place the group decided on (a majority of the participants, or the leader's choice when everyone voted and nobody has a majority)
--   groups.decided_at          when
--   group_votes                one vote per person per group, changeable until the decision
--
-- Votes are written by the SERVER only (it counts the majority and writes the decision in the same step); a caller can only READ the votes of a group they take part in (the creator and the accepted
-- members). Pending requests, strangers and anon read nothing. Rollback: rollback/20261205_group_suggestion_votes_rollback.sql.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS suggestion_options jsonb;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS chosen_option text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS decided_at timestamptz;

CREATE TABLE IF NOT EXISTS public.group_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id text NOT NULL CHECK (char_length(option_id) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_votes ENABLE ROW LEVEL SECURITY;
-- ADR-019: a new table in this schema is born open to anon and authenticated: close it, then open only the read for participants.
REVOKE ALL ON public.group_votes FROM anon, authenticated;
GRANT SELECT ON public.group_votes TO authenticated;
DROP POLICY IF EXISTS group_votes_select_participant ON public.group_votes;
CREATE POLICY group_votes_select_participant ON public.group_votes
  FOR SELECT TO authenticated
  USING (public.fn_group_participant(group_id));
-- (no INSERT / UPDATE / DELETE policy and no grant: the server writes the votes with the service role)
