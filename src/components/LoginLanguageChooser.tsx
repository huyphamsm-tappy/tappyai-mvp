'use client'

import { useEffect, useState } from 'react'
import { getStoredLocale, setLocale } from '@/lib/i18n/useTranslation'
import type { Locale } from '@/lib/i18n/dictionaries'
import LanguageChoiceModal from '@/components/LanguageChoiceModal'

// The language question on /login and /register, BEFORE the person signs in (owner 18/11/2026: show the
// flags popup first so they know they can choose). Only the sign-in pages mount it: they are the front
// door, not a shared link, so nobody arriving from a share is stopped (src/app/publicBoundary.test.ts
// keeps LanguagePicker itself inside `(app)`). It asks once: as soon as a language is stored — here, in the
// app's own picker or in Settings — it never shows again. Nothing is sent to the server: the person has no
// account yet; the choice lives in localStorage (the same key the whole app reads).
export default function LoginLanguageChooser() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (getStoredLocale() === null) setShow(true)
  }, [])

  const choose = (lang: Locale) => {
    setLocale(lang)
    setShow(false)
  }

  if (!show) return null
  return <LanguageChoiceModal onChoose={choose} />
}
