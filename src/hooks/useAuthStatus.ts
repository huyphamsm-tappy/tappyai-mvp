'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'

// ── Is the person at this browser a MEMBER, or a visitor? ───────────────────
//
// 🚨 "HAS A SESSION" IS NOT "IS SIGNED IN", AND CONFLATING THEM BROKE BOTH ENDS
// OF THE AUTH FLOW.
//
// Every browser here gets a real Supabase session: `ensureAnonymousSession`
// mints one so the 5 free questions can be scoped to somebody. It is a genuine
// `auth.users` row on the `authenticated` role, with `is_anonymous = true` — so
// `getUser()` returns a user for a visitor who has never signed in. Measured on
// localhost: the browser held `sb-…-auth-token` carrying
// `"email":"", "amr":[{"method":"anonymous"}], "is_anonymous":true`.
//
// Anything that asked only "is there a user?" therefore answered "signed in" for
// everyone, forever. The login page bounced visitors away from its own form, and
// the sidebar offered Logout to people who had never logged in.
//
// So the question this hook answers is the one the UI actually needs, and
// `isAnonymousUser` — the shipped helper that already draws this line for social
// writes — is what draws it here too. One definition, three surfaces.
//
// The server stays authoritative for authorization and quota: this is for
// RENDERING only. Nothing here is passed to an API as a claim about identity.

export type AuthStatus = 'loading' | 'member' | 'visitor'

/**
 * The auth status of this browser, kept live.
 *
 * Starts at `'loading'` and never guesses: a surface that must not flicker
 * between Login and Logout can render neither until the first answer arrives.
 *
 * Subscribes to `onAuthStateChange` so a sign-in or a sign-out anywhere in the
 * app updates every consumer — which is what makes "click Logout, land on Home,
 * see Login" true without a full page load.
 */
export function useAuthStatus(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let alive = true

    /**
     * 🚨 CREATING THE CLIENT CAN THROW, AND IT TAKES THE WHOLE SHELL WITH IT.
     * `createBrowserClient` raises when the Supabase URL/key are absent — a build
     * with the env unset, or any test that renders the shell without them. This
     * hook decides one word in a sidebar; it must never be the reason a page
     * fails to render.
     */
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      setStatus('visitor')
      return
    }

    const resolve = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!alive) return
        setStatus(user && !isAnonymousUser(user) ? 'member' : 'visitor')
      } catch {
        // Unreachable auth service: a visitor is the safe rendering, because it
        // offers a way IN. Claiming "member" would offer a Logout that cannot work.
        if (alive) setStatus('visitor')
      }
    }

    resolve()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      const user = session?.user
      setStatus(user && !isAnonymousUser(user) ? 'member' : 'visitor')
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  return status
}
