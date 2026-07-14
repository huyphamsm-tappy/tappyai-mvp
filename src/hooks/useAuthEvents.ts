'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { emitAuthLoginFromSession } from '@/lib/analytics/authEvents'

// Global auth-event listener — mounted once via TrackingProvider. When a session
// becomes available after a real login attempt (client-side sign-in fires
// SIGNED_IN; cookie-based OAuth/Zalo returns fire INITIAL_SESSION), it emits
// auth_login_completed / auth_signup_completed. Attribution + once-only guarantee
// live in authEvents (pending + emitted markers).
export function useAuthEvents() {
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        emitAuthLoginFromSession(session.user)
      }
    })
    return () => subscription.unsubscribe()
  }, [])
}
