'use client'

import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import CungHoangDaoForm from '@/components/boi/CungHoangDaoForm'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Client view for the zodiac screen so all text reacts to the language toggle.
// The server page still does auth + profile fetch and passes user down.
export default function CungHoangDaoView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/boi" title={t('fortune.zodiacHeader')} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <CungHoangDaoForm />

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          {t('fortune.disclaimer')}
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
