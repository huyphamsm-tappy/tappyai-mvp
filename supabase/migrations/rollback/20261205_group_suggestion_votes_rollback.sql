-- Rollback of 20261205_group_suggestion_votes.sql: the votes, the cards and the decision are LOST; the text suggestion stays.
DROP TABLE IF EXISTS public.group_votes;
ALTER TABLE public.groups DROP COLUMN IF EXISTS decided_at;
ALTER TABLE public.groups DROP COLUMN IF EXISTS chosen_option;
ALTER TABLE public.groups DROP COLUMN IF EXISTS suggestion_options;
