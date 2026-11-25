'use client'
// The empty chat: the Tappy mascot and ONE greeting line for the time the person has (owner 20/11: no mood buttons, no suggested questions). The clock is read after the first paint, on the
// device, so the server's render and the browser's agree (the line is empty until then, its place reserved). When the profile holds a name, the line starts with the given name (the first word).
import { useEffect, useState } from 'react'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { greetingKey, givenNameOf, lineWithName } from '@/lib/chat/homeGreeting'

export default function HomeGreeting() {
  const { t } = useTranslation()
  const [key, setKey] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    setKey(greetingKey(new Date()))
    let live = true
    fetch('/api/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(p => { if (live && p) setName(givenNameOf(p.full_name)) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  const line = key ? lineWithName(t(key), name, t('home.greet.withName')) : ''
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 animate-fade-in" data-testid="home-greeting">
      <div className="h-28 w-28 select-none overflow-hidden rounded-3xl shadow-lg sm:h-32 sm:w-32">
        <TappyMascot pose="wave" size={128} eager animated />
      </div>
      <h2 className="min-h-[2.5rem] max-w-xl px-4 text-center text-2xl font-semibold leading-snug text-[#ffc83d] sm:text-3xl" data-testid="home-greeting-line">{line}</h2>
    </div>
  )
}
