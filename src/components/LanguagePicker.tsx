'use client'

import { useEffect, useState } from 'react'
import { getStoredLocale, setLocale } from '@/lib/i18n/useTranslation'
import type { Locale } from '@/lib/i18n/dictionaries'
import LanguageChoiceModal from '@/components/LanguageChoiceModal'

// WHERE THIS RENDERS — only inside the app: `src/app/(app)/layout.tsx` mounts it, and nothing
// else may (src/app/publicBoundary.test.ts). A shared link, a public result, the hubs, the legal
// pages and the Controller's public home (which asks the language question in its own header) all
// live outside `(app)`, so a stranger is never stopped by this modal and no path list is needed
// here. Public pages follow the browser's language instead (lib/i18n/appSurface.ts).
// The sign-in pages ask the same question BEFORE signing in with their own component (LoginLanguageChooser).

// First-visit language chooser. Shows once — the moment a locale is stored
// (either here or later in Settings) getStoredLocale() stops returning null and
// this never renders again. Anonymous users just get localStorage; the PATCH is a
// best-effort sync for logged-in accounts and is ignored (401) otherwise.
export default function LanguagePicker() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (getStoredLocale() === null) setShow(true)
  }, [])

  const choose = (lang: Locale) => {
    setLocale(lang)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {})
    setShow(false)
  }

  if (!show) return null
  return <LanguageChoiceModal onChoose={choose} />
}
