'use client'

import { installAppLanguageFetch } from '@/lib/i18n/appLanguageFetch'

// 🚨 Installed at MODULE scope, not in an effect.
//
// Effects run child-first, so a component that fetches in its own mount effect would run BEFORE a
// root-level installer effect and miss the header on the very first request of the session — which
// is exactly the request whose error message the user is most likely to see. Module evaluation
// happens when the chunk loads, before any render or effect, so nothing can outrun it.
//
// The call is idempotent, so re-evaluation under a hot reload cannot stack wrappers.
if (typeof window !== 'undefined') installAppLanguageFetch()

/** Renders nothing; exists only so the root layout can pull the module in. */
export default function AppLanguageFetch() {
  return null
}
