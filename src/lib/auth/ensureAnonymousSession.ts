import { createClient } from '@/lib/supabase/client'

/**
 * Give a signed-out browser a real (anonymous) identity, so the server can scope
 * things to it — today, the consultative conversation state (Task 3C/3D).
 *
 * WHY VIA OUR OWN ENDPOINT rather than `supabase.auth.signInAnonymously()`
 * directly: `POST /api/auth/anonymous` is the documented cross-client contract
 * (Android and iOS already use it) AND it carries the abuse controls — 5 mints
 * per minute and 30 per day per IP. Calling Supabase straight from the browser
 * would mint `auth.users` rows with no such cap.
 *
 * The returned tokens are handed to the SSR browser client, which persists them
 * the same way a normal sign-in does (cookies). That is what makes them visible
 * to `getRequestUser`'s cookie path — no Authorization header plumbing, and no
 * hand-rolled token storage in localStorage.
 *
 * FAIL-OPEN, matching Android's `AuthRepository`: if the mint fails (offline,
 * rate-limited, anonymous sign-ins disabled) the caller carries on without an
 * identity. Chat still works; server-side state simply stays off for that
 * visitor rather than being shared with anyone else.
 */
export async function ensureAnonymousSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return true // already signed in (anonymous or not) — never re-mint

    const res = await fetch('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return false

    const body = (await res.json()) as { access_token?: string; refresh_token?: string }
    if (!body.access_token || !body.refresh_token) return false

    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    })
    return !error
  } catch {
    return false
  }
}
