-- Public count functions for the sound page's "N người đã lưu" / follower total.
-- SECURITY DEFINER so anonymous/any visitor gets the aggregate WITHOUT a public
-- SELECT policy on the rows (never exposes WHO saved/followed) and WITHOUT
-- depending on a service-role key. Additive & idempotent.

CREATE OR REPLACE FUNCTION public.music_saved_count(p_track UUID)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT count(*) FROM public.music_saved WHERE track_id = p_track; $$;
GRANT EXECUTE ON FUNCTION public.music_saved_count(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.music_followed_count(p_track UUID)
  RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT count(*) FROM public.music_followed WHERE track_id = p_track; $$;
GRANT EXECUTE ON FUNCTION public.music_followed_count(UUID) TO anon, authenticated;
