CREATE TABLE IF NOT EXISTS public.groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  suggestion text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read groups" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Creators manage own groups" ON public.groups FOR ALL USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  budget text,
  food_preferences text,
  dietary_restrictions text,
  area text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read group members" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "Anyone can join a group" ON public.group_members FOR INSERT WITH CHECK (true);
