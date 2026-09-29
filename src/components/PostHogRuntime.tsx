'use client'

// The PostHog runtime — loaded ONLY when NEXT_PUBLIC_POSTHOG_KEY is set at build time (PostHogProvider).
// Split out 2026-09-29: the key is deliberately absent on UAT and Production (RELEASE-PLAN §2d), yet the
// root layout shipped posthog-js (68 KB compressed) to every page, competing on slow 4G with the
// render-blocking CSS (/reviews first paint 3–4 s).
import posthog from 'posthog-js'
import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function PostHogRuntime({ apiKey }: { apiKey: string }) {
  const initialized = useRef(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    posthog.init(apiKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false,
      autocapture: true,
      person_profiles: 'identified_only',
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return

    const supabase = createBrowserClient(supabaseUrl, supabaseKey)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) posthog.identify(user.id, { email: user.email ?? undefined })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        posthog.identify(session.user.id, { email: session.user.email ?? undefined })
      } else if (event === 'SIGNED_OUT') {
        posthog.reset()
      }
    })

    return () => subscription.unsubscribe()
  }, [apiKey])

  useEffect(() => {
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [pathname, searchParams])

  return null
}
