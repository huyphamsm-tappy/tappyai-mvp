'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { reconcilePushIdentity } from '@/lib/notifications/pushIdentity'

/**
 * App-wide push identity lifecycle. Mounted ONCE, in NotificationProvider.
 *
 * 🚨 THIS IS THE HALF THAT ACTUALLY FIXES THE 2026-08-29 INCIDENT. The database
 * work guarantees one credential has one owner, but it cannot know who is signed
 * in on a given browser — so a browser whose previous owner walked away keeps a
 * live claim until somebody says otherwise. That somebody is this hook, at the
 * moment the next person's session appears.
 *
 * It must be app-wide rather than living in usePushNotifications: that hook is
 * only mounted where a push toggle is on screen, and the person who arrives on
 * a shared browser has no reason to open notification settings.
 *
 * WHAT IT DOES NOT DO — it never subscribes anybody. Consent is per account:
 * B is told the truth and opts in themselves, or does not. `reconcilePushIdentity`
 * can only release a claim, never create one.
 *
 * No timeout, deliberately: nothing is waiting on the answer, so there is no
 * navigation to unblock. A failure is simply unknown, and the UI stays OFF.
 */
export function usePushIdentityReconcile() {
  // `undefined` = no session observed yet, distinct from `null` = signed out.
  const lastUid = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Sign-out is the other surface's job (performSignOut releases the claim
      // while the session still exists — afterwards there is no identity left to
      // authorise the call).
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return

      const uid = session?.user?.id ?? null
      // Supabase re-emits these on tab focus and token refresh. Reconciling on
      // every emission would write on a timer rather than on a real event.
      if (uid === lastUid.current) return
      lastUid.current = uid
      if (!uid) return

      // Fire and forget: reconcilePushIdentity never throws, returns null on
      // failure, and skips the request entirely when this browser holds no push
      // credential.
      void reconcilePushIdentity()
    })
    return () => data.subscription.unsubscribe()
  }, [])
}
