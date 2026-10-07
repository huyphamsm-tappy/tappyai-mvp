'use client'

import type { ComponentProps } from 'react'
import { Sparkles } from 'lucide-react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import VietContentForm, { InstagramMark } from '@/components/VietContentForm'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'

// Client view for the caption writer so all text is reactive to the language
// toggle. The server page still does the profile fetch and passes user down.
//
// Layout follows the approved "Viết content" design (2026-09-28): a blue→purple
// hero with the mascot and the three platform marks, then the form cards.
export default function VietContentView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Back pops in-app history (Smart Tools, Home, …); a deep link falls back to /tools. */}
      <Header user={user} showBack backFallbackHref={SMART_TOOLS_HREF} title={t('vietContent.headerTitle')} />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Hero */}
        <section
          data-vc-hero
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary-900 via-indigo-800 to-violet-600 p-5 sm:p-6 shadow-lg shadow-primary-900/30"
        >
          <div className="pointer-events-none absolute -right-10 -bottom-16 h-56 w-56 rounded-full bg-accent-400/30 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-primary-400/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary-200">
                <Sparkles size={16} className="text-primary-300" aria-hidden />
                {t('vietContent.heroKicker')}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight text-white">
                {t('vietContent.heroTitleLine1')}
                <br />
                {t('vietContent.heroTitleLine2Lead')}{' '}
                <span data-vc-accent className="bg-gradient-to-r from-accent-300 via-pink-400 to-violet-400 bg-clip-text text-transparent">
                  {t('vietContent.heroTitleAccent')}
                </span>{' '}
                <span aria-hidden className="text-accent-300">✦</span>
              </h1>
              <p className="mt-2 text-sm text-white/80 leading-relaxed">{t('vietContent.heroSubtitle')}</p>
            </div>
            <div className="relative h-28 w-28 sm:h-36 sm:w-36 flex-shrink-0 select-none" aria-hidden>
              <TappyMascot pose={getTappyPose({ category: 'reading' })} size={144} eager animated className="h-full w-full" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brands/share/facebook.svg" alt="" className="absolute -top-1 right-0 h-7 w-7 rotate-6 drop-shadow" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brands/share/tiktok.svg" alt="" className="absolute bottom-6 -right-1 h-7 w-7 -rotate-6 drop-shadow" />
              <InstagramMark className="absolute top-8 -left-2 h-7 w-7 -rotate-12 drop-shadow" />
            </div>
          </div>
        </section>

        <VietContentForm />
      </main>

      <BottomNav />
    </div>
  )
}
