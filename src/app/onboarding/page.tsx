'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { MapPin, ArrowRight, Loader2, Check, Sparkles, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
// Single source: the same lists native clients receive via GET /api/config.
import { ONBOARDING_INTERESTS as INTERESTS, ONBOARDING_CITIES as CITIES } from '@/lib/config/product'

// ─────────────────────────────────────────────────────────────────────────────
// /onboarding — the post-sign-in interests + location setup.
//
// PRESENTATION ONLY (owner redesign 2026-09-11). Every piece of behaviour below
// is unchanged from the previous version: the two-panel `step` machine, the
// `selected` interest toggle, the free-text city, and the single
// `POST /api/onboarding` fired by `handleFinish` with `router.replace(next)`.
// Only the surface changed — from a plain white form to the dark TappyAI
// composition the rest of the V3 flow (login, /age-check) now uses.
//
// The dark shell is deliberately shared by BOTH panels so the flow does not
// flash from dark (interests) to white (location) mid-onboarding. The mascot,
// header and progress bar are shared chrome; only the centre column swaps.
//
// 🔑 Copy comes entirely from the dictionaries via `t()` — this file carries no
//    Vietnamese literal, which is what keeps it under the hardcoded-string
//    ratchet (webHardcodedUiStrings.test.ts). Emoji live in the interest data
//    (`item.emoji`) and in the dictionary values, never here.
//
// 🔑 The otter is the approved artwork `public/branding/otter-mascot.png`
//    (the cropped full-body mascot), used as a file and never redrawn. The
//    header keeps the square lockup `otter-logo.png`, where the brand mark
//    belongs. The two are different assets on purpose.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-interest accent, so each glass tile carries a hint of its own colour
 *  rather than one flat blue. Keyed by the stable interest id. */
const INTEREST_TINT: Record<string, string> = {
  food: 'from-orange-500/25 to-amber-600/10 text-orange-200',
  spa: 'from-pink-500/25 to-fuchsia-600/10 text-pink-200',
  travel: 'from-sky-500/25 to-blue-600/10 text-sky-200',
  shopping: 'from-amber-500/25 to-yellow-600/10 text-amber-200',
  entertainment: 'from-violet-500/25 to-purple-600/10 text-violet-200',
  hotel: 'from-cyan-500/25 to-teal-600/10 text-cyan-200',
}

function OnboardingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleInterest = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleFinish = async () => {
    setLoading(true)
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: selected, city }),
      })
    } catch { /* no-op */ }
    const next = searchParams.get('next') || '/'
    // replace() instead of push() so /onboarding is removed from history.
    // After the full OAuth flow, history has one entry for /onboarding (the
    // entire login chain was collapsed by window.location.replace). push()
    // would leave it there, so pressing Back from the destination returns to
    // the location-selection screen. replace() makes Back skip past onboarding
    // entirely and go to whatever the user was doing before needing to log in.
    router.replace(next)
  }

  // The component has exactly two panels (interests, then location), so the bar
  // has two segments and the label reads "Bước 1/2" / "Bước 2/2".
  const filled = step
  const stepLabel = step === 1 ? t('onboarding.stepInterests') : t('onboarding.stepLocation')

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#070B18] text-white">
      {/* Ambient field — decorative only, aria-hidden, behind everything. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[-10rem] h-[38rem] w-[38rem] rounded-full bg-blue-700/25 blur-[150px]" />
        <div className="absolute -right-48 top-1/4 h-[34rem] w-[34rem] rounded-full bg-violet-700/25 blur-[150px]" />
        <div className="absolute bottom-[-16rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-indigo-600/20 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-5 py-5 sm:px-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/branding/otter-logo.png"
              alt="TappyAI"
              width={52}
              height={52}
              priority
              className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/15"
            />
            <p className="text-lg font-black tracking-tight sm:text-xl">
              Tappy<span className="text-blue-400">AI</span>
            </p>
          </div>
          <p className="hidden text-right text-[13px] text-white/45 sm:block">
            {t('onboarding.tagline')}
          </p>
        </header>

        {/* ── Progress ───────────────────────────────────────────────────── */}
        <div className="mx-auto mt-5 flex w-full max-w-xs shrink-0 flex-col items-center gap-2">
          <div className="flex w-full gap-1.5" role="progressbar" aria-valuenow={filled} aria-valuemin={1} aria-valuemax={2}>
            {[1, 2].map(s => (
              <div
                key={s}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-all',
                  s <= filled ? 'bg-gradient-to-r from-blue-500 to-violet-500' : 'bg-white/10'
                )}
              />
            ))}
          </div>
          <span className="text-[12px] font-medium text-white/50">{stepLabel}</span>
        </div>

        {/* Mascot (compact) — below lg the three-column composition collapses, so
            the otter appears here, small and centred above the content, keeping
            the TappyAI personality on tablet and phone without dominating. Same
            artwork; decorative and aria-hidden. */}
        <div aria-hidden className="mt-5 flex shrink-0 justify-center lg:hidden">
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-2 -z-10 mx-auto h-28 w-28 rounded-full bg-blue-500/25 blur-[45px]" />
            <Image
              src="/branding/otter-mascot.png"
              alt=""
              width={280}
              height={380}
              className="w-full max-w-[110px] object-contain drop-shadow-[0_12px_28px_rgba(37,99,235,0.4)]"
            />
          </div>
        </div>

        {/* ── Main ───────────────────────────────────────────────────────── */}
        <main className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-10">
          {/* Mascot — decorative, aria-hidden, secondary to the content. */}
          <section aria-hidden className="relative hidden select-none lg:flex lg:items-center lg:justify-center">
            <div className="relative w-full max-w-[300px]">
              <div className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-64 w-64 rounded-full bg-blue-500/20 blur-[70px]" />
              <div className="pointer-events-none absolute bottom-6 left-1/2 -z-10 h-10 w-48 -translate-x-1/2 rounded-[50%] bg-violet-500/30 blur-2xl" />

              <Sparkles size={24} className="absolute left-4 top-24 z-10 text-amber-300/90" />
              <Sparkles size={15} className="absolute right-8 top-10 z-10 text-blue-200/70" />
              <Heart size={16} className="absolute left-1 top-1/2 z-10 text-pink-300/70" />

              {/* Speech bubble — subtle, above the character. */}
              <p className="relative mb-3 ml-auto max-w-[210px] rounded-2xl rounded-br-sm border border-white/10 bg-white/[0.07] px-4 py-2.5 text-[12.5px] leading-relaxed text-white/75 shadow-lg shadow-black/20 backdrop-blur-sm">
                {t('onboarding.mascotBubble')}
              </p>

              <Image
                src="/branding/otter-mascot.png"
                alt=""
                width={560}
                height={761}
                priority
                className="relative mx-auto w-full max-w-[260px] object-contain drop-shadow-[0_20px_44px_rgba(37,99,235,0.42)]"
              />

              <p className="relative mt-1 text-center text-[12px] text-white/40">
                {t('onboarding.mascotCaption')}
              </p>
            </div>
          </section>

          {/* Content — the primary interaction. */}
          <section className="w-full">
            {step === 1 ? (
              <>
                <h1 className="text-[28px] font-black leading-tight tracking-tight sm:text-[34px]">
                  {t('onboarding.welcomeTitle')}
                </h1>
                <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-white/55">
                  {t('onboarding.welcomeDesc')}
                </p>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {INTERESTS.map(item => {
                    const isOn = selected.includes(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleInterest(item.id)}
                        aria-pressed={isOn}
                        className={cn(
                          'group relative flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all',
                          isOn
                            ? 'border-blue-400/60 bg-blue-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_30px_-8px_rgba(37,99,235,0.5)]'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br text-2xl',
                            INTEREST_TINT[item.id] ?? 'from-white/10 to-white/5'
                          )}
                        >
                          {item.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-[15px] font-bold', isOn ? 'text-white' : 'text-white/90')}>
                            {t(item.key)}
                          </span>
                        </span>
                        {/* Selected indicator — a mark, not colour alone. */}
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all',
                            isOn
                              ? 'border-transparent bg-gradient-to-br from-blue-500 to-violet-500 text-white'
                              : 'border-white/15 text-transparent group-hover:border-white/30'
                          )}
                        >
                          <Check size={14} strokeWidth={3} />
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-7 flex flex-col items-center gap-3">
                  <button
                    onClick={() => setStep(2)}
                    disabled={selected.length === 0}
                    className="flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:from-blue-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('common.next')} <ArrowRight size={18} />
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="text-sm text-white/40 transition-colors hover:text-white/70"
                  >
                    {t('common.skip')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-[28px] font-black leading-tight tracking-tight sm:text-[34px]">
                  {t('onboarding.locationTitle')}
                </h1>
                <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-white/55">
                  {t('onboarding.locationDesc')}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {CITIES.map(c => {
                    const isOn = city === c
                    return (
                      <button
                        key={c}
                        onClick={() => setCity(c)}
                        aria-pressed={isOn}
                        className={cn(
                          'flex items-center gap-2 rounded-2xl border p-3.5 text-left text-sm transition-all',
                          isOn
                            ? 'border-blue-400/60 bg-blue-500/10 font-semibold text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
                            : 'border-white/10 bg-white/[0.04] text-white/85 hover:border-white/20 hover:bg-white/[0.07]'
                        )}
                      >
                        <MapPin size={15} className={isOn ? 'text-blue-300' : 'text-white/40'} />
                        <span className="truncate">{c}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom city input */}
                <input
                  type="text"
                  placeholder={t('onboarding.otherCity')}
                  value={CITIES.includes(city) ? '' : city}
                  onChange={e => setCity(e.target.value)}
                  className="mt-4 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-white/30 transition-colors focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                />

                <div className="mt-7 flex flex-col items-center gap-3">
                  <button
                    onClick={handleFinish}
                    disabled={loading}
                    className="flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-900/40 transition-all hover:from-blue-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : t('onboarding.start')}
                  </button>
                  <button
                    onClick={handleFinish}
                    className="text-sm text-white/40 transition-colors hover:text-white/70"
                  >
                    {t('common.skip')}
                  </button>
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

// `useSearchParams()` needs a Suspense boundary above it. It used to get one for free from the
// app-root `loading.tsx`; that file now lives in the `(home)` route group, because at the root it
// also swallowed every page's `notFound()` and forced HTTP 200 (see that file's note). The
// boundary this page actually needs is therefore declared here, where it belongs.
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageInner />
    </Suspense>
  )
}
