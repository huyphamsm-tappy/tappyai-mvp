'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { MapPin, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
// Single source: the same lists native clients receive via GET /api/config.
import { ONBOARDING_INTERESTS as INTERESTS, ONBOARDING_CITIES as CITIES } from '@/lib/config/product'

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const toggleInterest = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleFinish = async () => {
    setLoading(true)
    setSaveError(false)
    const next = searchParams.get('next') || '/'
    // fetch() only rejects on a network failure — a 401 or 500 RESOLVES. The old
    // `catch {}` therefore never fired on the failures that actually happen, and
    // we navigated away as if the profile had been marked onboarded. It hadn't:
    // auth/callback re-reads profiles.onboarded on every login and sends anyone
    // still false straight back here, so a single silent failure loops the user
    // through onboarding on every login with no way out.
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: selected, city }),
      })
      // No readable session — retrying here can't help. Send them to log in;
      // auth/callback re-checks onboarded and routes back with `next` intact.
      if (res.status === 401) {
        router.replace(`/login?returnTo=${encodeURIComponent(next)}`)
        return
      }
      if (!res.ok) throw new Error(`onboarding save failed: ${res.status}`)
    } catch {
      setSaveError(true)
      setLoading(false)
      return
    }
    // replace() instead of push() so /onboarding is removed from history.
    // After the full OAuth flow, history has one entry for /onboarding (the
    // entire login chain was collapsed by window.location.replace). push()
    // would leave it there, so pressing Back from the destination returns to
    // the location-selection screen. replace() makes Back skip past onboarding
    // entirely and go to whatever the user was doing before needing to log in.
    router.replace(next)
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <Image src="/logo.png" alt="TappyAI" width={100} height={34} className="h-8 w-auto mb-8" />

        {/* Progress */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2].map(s => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-all', s <= step ? 'bg-primary-500' : 'bg-gray-100 dark:bg-gray-800')} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-8">
        {step === 1 && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-1">
              {t('onboarding.welcomeTitle')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              {t('onboarding.welcomeDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-8">
              {INTERESTS.map(item => (
                <button
                  key={item.id}
                  onClick={() => toggleInterest(item.id)}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left',
                    selected.includes(item.id)
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                  )}
                >
                  <span className="text-2xl">{item.emoji}</span>
                  <span className={cn('text-sm font-medium', selected.includes(item.id) ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200')}>
                    {t(item.key)}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={selected.length === 0}
              className="w-full py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {t('common.next')} <ChevronRight size={18} />
            </button>
            <button onClick={() => setStep(2)} className="w-full mt-3 text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              {t('common.skip')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-1">
              {t('onboarding.locationTitle')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              {t('onboarding.locationDesc')}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {CITIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={cn(
                    'flex items-center gap-2 p-4 rounded-2xl border-2 transition-all text-left text-sm',
                    city === c
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium'
                      : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200'
                  )}
                >
                  <MapPin size={14} className={city === c ? 'text-primary-500' : 'text-gray-400'} />
                  {c}
                </button>
              ))}
            </div>

            {/* Custom city input */}
            <input
              type="text"
              placeholder={t('onboarding.otherCity')}
              value={CITIES.includes(city) ? '' : city}
              onChange={e => setCity(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 mb-6"
            />

            {saveError && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400 text-center">
                {t('onboarding.saveError')}
              </p>
            )}

            <button
              onClick={handleFinish}
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : t('onboarding.start')}
            </button>
            <button onClick={handleFinish} className="w-full mt-3 text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              {t('common.skip')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
