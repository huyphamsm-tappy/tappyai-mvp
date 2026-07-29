'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { Locale } from '@/lib/i18n/dictionaries'
import { BRAND_NAME, LOGO } from './config'

const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'vi', label: 'VI' },
]

export default function LandingHeader() {
  const { t, locale, setLocale } = useTranslation()

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-container-wide items-center justify-between px-5 sm:px-8">
        <Link href="/startup" className="flex items-center gap-2.5" aria-label={BRAND_NAME}>
          <Image src={LOGO} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-tight">{BRAND_NAME}</span>
        </Link>

        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label={t('landing.nav.langLabel')}
            className="flex rounded-full border border-white/15 p-0.5 text-xs font-semibold"
          >
            {LOCALES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={locale === value}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  locale === value ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Link
            href="/"
            className="hidden rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 xs:inline-flex"
          >
            {t('landing.nav.openApp')}
          </Link>
        </div>
      </div>
    </header>
  )
}
