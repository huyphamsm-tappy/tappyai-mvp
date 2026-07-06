'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

const FEATURES = [
  {
    href: '/boi/tarot',
    emoji: '🔮',
    titleKey: 'fortune.tarotTitle',
    descKey: 'fortune.tarotDesc',
    gradient: 'from-violet-500/15 to-violet-500/5',
  },
  {
    href: '/boi/tu-vi',
    emoji: '🧧',
    titleKey: 'fortune.tuviTitle',
    descKey: 'fortune.tuviDesc',
    gradient: 'from-amber-500/15 to-amber-500/5',
  },
  {
    href: '/boi/cung-hoang-dao',
    emoji: '✨',
    titleKey: 'fortune.zodiacTitle',
    descKey: 'fortune.zodiacDesc',
    gradient: 'from-sky-500/15 to-sky-500/5',
  },
]

// Client view for the fortune-telling hub so all text reacts to the language
// toggle. The server page still does auth + profile fetch and passes user down.
export default function BoiLandingView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/" title={t('fortune.headerTitle')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-accent-500 p-6 pb-7 shadow-lg shadow-purple-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">{t('fortune.heroEyebrow')}</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              {t('fortune.heroTitleLine1')}<br />{t('fortune.heroTitleLine2')}
            </h1>
            <p className="text-white/80 text-sm mt-2">
              {t('fortune.heroDesc')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`group flex items-center gap-4 rounded-2xl bg-gradient-to-br ${f.gradient} bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`}
            >
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
                {f.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {t(f.titleKey)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t(f.descKey)}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
            </Link>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
