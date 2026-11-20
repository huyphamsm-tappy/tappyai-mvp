'use client'
// The empty chat: the Tappy mascot and ONE greeting line for the time the person has (owner 20/11: no mood buttons, no suggested questions). The clock is read after the first paint, on the
// device, so the server's render and the browser's agree (the line is empty until then, its place reserved).
import { useEffect, useState } from 'react'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { greetingKey } from '@/lib/chat/homeGreeting'

export default function HomeGreeting() {
  const { t } = useTranslation()
  const [key, setKey] = useState<string | null>(null)
  useEffect(() => { setKey(greetingKey(new Date())) }, [])
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 animate-fade-in" data-testid="home-greeting">
      <div className="h-14 w-14 select-none overflow-hidden rounded-2xl shadow-lg">
        <TappyMascot pose="wave" size={56} eager animated />
      </div>
      <h2 className="min-h-[2.5rem] max-w-xl px-4 text-center text-2xl font-semibold leading-snug text-gray-900 dark:text-white sm:text-3xl" data-testid="home-greeting-line">{key ? t(key) : ''}</h2>
    </div>
  )
}
