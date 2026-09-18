'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { EXTENSION_PATH, EXTENSION_PRIVACY_PATH } from '@/lib/growth/extensionListing'

export default function WelcomeBody() {
  const { t } = useTranslation()
  return (
    <article className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-sm text-gray-500"><Link href="/" className="font-bold text-gray-900 dark:text-gray-50">TappyAI</Link></p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">{t('ext.welcomeH1')}</h1>
      <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{t('ext.welcomeIntro')}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('ext.welcomePin')}</p>
      <div className="mt-8">
        <Link href="/chat?src=browser_extension" className="inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">
          {t('ext.welcomeTry')}
        </Link>
      </div>
      <p className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href={EXTENSION_PATH} className="underline">{t('ext.h1')}</Link>
        <Link href={EXTENSION_PRIVACY_PATH} className="underline">{t('ext.privacyLink')}</Link>
      </p>
    </article>
  )
}
