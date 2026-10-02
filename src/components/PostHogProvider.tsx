'use client'

import { lazy, Suspense } from 'react'

// Inlined at build time. Absent (UAT, Production today) → posthog-js is never downloaded; the runtime
// (init, identify, pageviews) lives in PostHogRuntime and is fetched only when a key is configured.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const PostHogRuntime = POSTHOG_KEY ? lazy(() => import('./PostHogRuntime')) : null

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {PostHogRuntime && POSTHOG_KEY ? (
        <Suspense fallback={null}>
          <PostHogRuntime apiKey={POSTHOG_KEY} />
        </Suspense>
      ) : null}
      {children}
    </>
  )
}
