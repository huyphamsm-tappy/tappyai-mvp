-- ---------------------------------------------------------------------------
-- Music reuse cleanup — close the direct-PostgREST surface on music_tracks.
--
-- Music reuse/upload is retired (the /api/music/*, /api/sound/*, /api/upload/audio
-- endpoints answer 410, and the web + Android UIs are removed). But music_tracks
-- itself was still reachable directly over PostgREST by ordinary roles:
--   • SELECT — "Anyone can read active music tracks" (USING is_active) + the
--     RESTRICTIVE publication boundary — let anon/authenticated read the whole
--     borrowed-track catalogue (the web feed used this to play attached sounds).
--   • INSERT — "Users publish own original sound" let a signed-in user write a
--     track row directly, bypassing the now-410 upload endpoint.
--   • UPDATE — "Uploader can deactivate own track".
--
-- This removes those policies and revokes the table grants from anon/authenticated,
-- so ordinary roles can neither read nor write music_tracks. THE DATA IS KEPT
-- (retained per the PASS-2 decision: hide from all surfaces, do not delete).
-- service_role is unaffected — it holds BYPASSRLS and its own grants, so every
-- server/admin/moderation read continues to work.
--
-- Applied by hand in the Supabase SQL editor (repo convention). Idempotent.
-- Requires roles anon, authenticated to exist (REVOKE FROM a missing role raises
-- 42704 and aborts, intentionally).
-- ---------------------------------------------------------------------------

-- 1. Remove every ordinary-role policy on music_tracks. RLS stays ENABLED, so
--    with no permissive policy left, anon/authenticated match zero rows.
DROP POLICY IF EXISTS music_tracks_publication_boundary          ON public.music_tracks; -- restrictive SELECT (20260818b)
DROP POLICY IF EXISTS "Anyone can read active music tracks"       ON public.music_tracks; -- permissive SELECT (20260704)
DROP POLICY IF EXISTS "Users publish own original sound"          ON public.music_tracks; -- INSERT (add_original_sound_ugc)
DROP POLICY IF EXISTS "Uploader can deactivate own track"         ON public.music_tracks; -- UPDATE (add_original_sound_ugc)

-- 2. Belt-and-suspenders (ADR-019 form): Supabase's ALTER DEFAULT PRIVILEGES
--    grants tables to anon/authenticated by default, so RLS is not the only gate.
--    Revoke the table privileges too — naming both roles, because a bare
--    REVOKE ... FROM PUBLIC would leave those explicit grants in place.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.music_tracks FROM anon, authenticated;

-- RLS remains enabled; service_role keeps full access (BYPASSRLS).
-- ---------------------------------------------------------------------------
-- VERIFICATION — after applying, expect:
--   (a) SELECT: as anon over PostgREST, GET /rest/v1/music_tracks returns []
--       (or 401/permission-denied), not the catalogue.
--   (b) has_table_privilege('anon','public.music_tracks','SELECT') = false
--       and the same for authenticated / INSERT / UPDATE.
--   (c) The service-role client still reads/writes music_tracks (admin/moderation).
--   (d) No permissive policy remains:
--       SELECT polname, cmd, roles::text FROM pg_policies WHERE tablename='music_tracks';
--       -> zero rows.
-- ---------------------------------------------------------------------------
