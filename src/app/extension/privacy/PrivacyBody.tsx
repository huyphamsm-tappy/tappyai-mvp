'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { SUPPORT_EMAIL } from '@/components/landing/config'
import { EXTENSION_PATH } from '@/lib/growth/extensionListing'

export default function PrivacyBody({ updated }: { updated: string }) {
  const { t } = useTranslation()
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-gray-500"><Link href="/" className="font-bold text-gray-900 dark:text-gray-50">TappyAI</Link> · <Link href={EXTENSION_PATH} className="underline">{t('ext.h1')}</Link></p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">{t('ext.privacyH1')}</h1>
      <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{t('ext.privacyIntro')}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('ext.privacyCollectTitle')}</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('ext.privacyCollect')}</p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('ext.privacySendTitle')}</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('ext.privacySend')}</p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('ext.privacyNoTitle')}</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('ext.privacyNo')}</p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('ext.privacyPermTitle')}</h2>
        <dl className="mt-3 space-y-3 text-sm">
          {(['activeTab', 'contextMenus', 'storage'] as const).map((p) => (
            <div key={p}>
              <dt className="font-mono font-medium">{p}</dt>
              <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{t(`ext.perm.${p}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('ext.privacyContactTitle')}</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('ext.privacyContact', { email: SUPPORT_EMAIL })}</p>
        <p className="mt-4 text-sm"><Link href="/privacy" className="underline">{t('about.linkPrivacy')}</Link></p>
        <p className="mt-6 text-xs text-gray-500">{t('ext.privacyUpdated', { date: updated })}</p>
      </section>
    </article>
  )
}
