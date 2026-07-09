'use client'

import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import VietContentForm from '@/components/VietContentForm'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'

// Client view for the caption writer so all text is reactive to the language
// toggle. The server page still does the profile fetch and passes user down.
export default function VietContentView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/" title={t('vietContent.headerTitle')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-6 pb-7 shadow-lg shadow-rose-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 mb-2 rounded-xl overflow-hidden select-none">
              <TappyMascot pose={getTappyPose({ category: 'reading' })} size={48} eager animated />
            </div>
            <p className="text-white/80 text-sm font-medium mb-1">{t('vietContent.heroKicker')}</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              {t('vietContent.heroTitleLine1')}<br />{t('vietContent.heroTitleLine2')}
            </h1>
            <p className="text-white/80 text-sm mt-2">
              {t('vietContent.heroSubtitle')}
            </p>
          </div>
        </div>

        <VietContentForm />
      </main>

      <BottomNav />
    </div>
  )
}
