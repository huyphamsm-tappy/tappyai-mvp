'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { EXTENSION_PRIVACY_PATH, type ExtensionStore } from '@/lib/growth/extensionListing'

// The landing page content, in the visitor's language. Server-rendered in the
// product locale, reconciled after hydration (the app-wide pattern; see
// HubBody / AboutBody). Every string is an `ext.*` dictionary key.
//
// `stores` is empty until the owner has published: then the page shows the
// honest state (awaiting review) and the web app as the way in.
export default function ExtensionBody({ stores }: { stores: Array<{ store: ExtensionStore; url: string }> }) {
  const { t } = useTranslation()
  const installLabel: Record<ExtensionStore, string> = {
    chrome: t('ext.installChrome'),
    edge: t('ext.installEdge'),
    firefox: t('ext.installFirefox'),
  }
  return (
    <>
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg">TappyAI</Link>
          <nav aria-label={t('hub.ui.domainsNav')} className="flex gap-3 text-sm">
            {CATEGORIES.map((c) => (
              <Link key={c.id} href={`/${c.id}`} className="text-gray-600 dark:text-gray-300">{c.emoji} {t(`tag.${c.id}`)}</Link>
            ))}
            <Link href="/about" className="text-gray-600 dark:text-gray-300">{t('hub.ui.about')}</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold leading-tight">{t('ext.h1')}</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{t('ext.intro')}</p>

        <div className="mt-6 flex flex-wrap gap-3" data-testid="extension-install">
          {stores.length > 0 ? (
            stores.map((s) => (
              <a key={s.store} href={s.url} rel="noopener" className="inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white" data-store={s.store}>
                {installLabel[s.store]}
              </a>
            ))
          ) : (
            <>
              <p className="w-full text-sm text-gray-600 dark:text-gray-300" data-testid="extension-coming-soon">{t('ext.comingSoon')}</p>
              <Link href="/chat" className="inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">{t('ext.useWeb')}</Link>
            </>
          )}
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('ext.whatTitle')}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
            <li>{t('ext.what1')}</li>
            <li>{t('ext.what2')}</li>
            <li>{t('ext.what3')}</li>
            <li>{t('ext.what4')}</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('ext.privacyTitle')}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
            <li>{t('ext.privacy1')}</li>
            <li>{t('ext.privacy2')}</li>
            <li>{t('ext.privacy3')}</li>
          </ul>
          <p className="mt-3 text-sm"><Link href={EXTENSION_PRIVACY_PATH} className="underline">{t('ext.privacyLink')}</Link></p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('ext.permTitle')}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {(['activeTab', 'contextMenus', 'storage'] as const).map((p) => (
              <div key={p}>
                <dt className="font-mono font-medium">{p}</dt>
                <dd className="mt-0.5 text-gray-700 dark:text-gray-300">{t(`ext.perm.${p}`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('ext.faqTitle')}</h2>
          <dl className="mt-3 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <dt className="font-medium">{t(`ext.faq${i}.q`)}</dt>
                <dd className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t(`ext.faq${i}.a`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </>
  )
}
