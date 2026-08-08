-- ---------------------------------------------------------------------------
-- handle_new_user — do not create a profiles row for ANONYMOUS auth users
--
-- CORRECTIVE migration. No historical migration is modified. Trigger
-- `on_auth_user_created` on auth.users is NOT touched (same function name and
-- signature, so the existing trigger keeps working unchanged).
--
-- ---------------------------------------------------------------------------
-- WHY (the finding this closes)
-- ---------------------------------------------------------------------------
-- Enabling Supabase Anonymous Sign-ins makes every anonymous session insert an
-- auth.users row, and `on_auth_user_created` copies each one into public.profiles.
-- public.profiles is anon-readable (has_table_privilege('anon', …, 'SELECT') = true
-- plus an anon/public policy), so every throwaway anonymous identity would become a
-- publicly enumerable profile via GET /rest/v1/profiles, polluting the user list and
-- the social graph. Rated HIGH: no PII is exposed (anonymous rows carry no email or
-- name) but the table is public and mass-inflatable — GoTrue's /auth/v1/signup is
-- reachable directly with the publishable key, bypassing the per-IP limits on our own
-- /api/auth/anonymous route.
--
-- Owner decision (Phase 2): an anonymous identity exists ONLY as a Supabase auth
-- identity, a chat-quota identity and the owner of its own conversations. A profile
-- appears when — and only when — the identity becomes a real account.
--
-- ---------------------------------------------------------------------------
-- WHY `new.is_anonymous` IS THE RIGHT SIGNAL (verified, not assumed)
-- ---------------------------------------------------------------------------
-- auth.users in THIS project really does expose the column (measured 2026-08-08):
--     attnum 35 · is_anonymous boolean
-- It is a first-class column on the row the trigger receives, so the guard needs no
-- JWT, no claims and no session context — unlike auth.jwt()->>'is_anonymous', which is
-- unavailable inside a trigger fired by GoTrue's own insert.
--
-- COALESCE(..., false) is deliberate: if the column is ever NULL the function behaves
-- exactly as it does today and still creates the profile. The guard can only ever
-- SKIP a row it is certain is anonymous — it can never withhold a profile from a real
-- account.
--
-- ---------------------------------------------------------------------------
-- DEPENDENCY AUDIT — nothing requires a profile for an anonymous identity
-- ---------------------------------------------------------------------------
--   conversations.user_id  → FK targets auth.users, NOT profiles. Anonymous history
--                            (the whole point of the feature) is unaffected.
--   /api/profile GET       → ignores the .single() error and uses `profile?.` with
--                            user_metadata fallbacks; a missing row degrades cleanly.
--   /api/chat              → the is_anonymous branch returns before any profile,
--                            memory or preferences lookup.
--   user_acquisition       → FKs profiles, but the analytics cron sources signups from
--                            user_events, and an anonymous session emits none.
--                            fn_sync_last_login only UPDATEs rows that already exist.
--   reviews / admin_roles / admin_permissions / platform_owner / subscriptions
--                          → FK profiles, all authenticated-only surfaces an anonymous
--                            identity cannot reach.
--
-- Everything else below is byte-for-byte the production definition captured from
-- pg_get_functiondef() — only the IF/END IF wrapper is new.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Anonymous identities get no public profile. Everything else is unchanged.
  IF NOT COALESCE(new.is_anonymous, false) THEN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
      new.id,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name  = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = now();
  END IF;

  RETURN new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- NOTES
-- ---------------------------------------------------------------------------
-- * Idempotent: CREATE OR REPLACE, re-runnable.
-- * Destroys nothing: no DELETE, no UPDATE of existing profiles, no schema change,
--   no RLS change, no grant change. Profiles that already exist are untouched.
-- * Google/Zalo/email signup are unaffected — those rows have is_anonymous = false,
--   so they take the identical INSERT ... ON CONFLICT path as before.
-- * When an anonymous identity later signs in with Google/Zalo, that sign-in creates a
--   NEW non-anonymous auth.users row, which gets its profile here as usual; the
--   anonymous identity's conversations are carried over by
--   fn_claim_anonymous_conversations (20260808b).
--
-- VERIFICATION after applying:
--   SELECT pg_get_functiondef(p.oid) LIKE '%is_anonymous%' AS guard_present
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
--   -- expect: true
-- ---------------------------------------------------------------------------
