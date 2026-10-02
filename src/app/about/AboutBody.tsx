'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { SUPPORT_EMAIL } from '@/components/landing/config'
import PublicFooter from '@/components/discovery/PublicFooter'

// The /about content, in the visitor's language. A client component on
// purpose and still fully server-rendered: during SSR `useTranslation` reports
// the product locale (vi), so a crawler receives the complete Vietnamese page;
// after hydration the store reconciles to the stored locale. Same pattern as
// the discovery hubs (HubBody). Every string is an `about.*` dictionary key.
export default function AboutBody() {
  const { t } = useTranslation()
  return (
    <>
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg">TappyAI</Link>
          <nav aria-label={t('hub.ui.domainsNav')} className="flex gap-3 text-sm">
            {CATEGORIES.map((c) => (
              <Link key={c.id} href={`/${c.id}`} className="text-gray-600 dark:text-gray-300">
                {c.emoji} {t(`tag.${c.id}`)}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold leading-tight">{t('about.h1')}</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{t('about.intro')}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('about.whatTitle')}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
            <li>
              {t('about.whatDomains')}{' '}
              <span className="inline-flex flex-wrap gap-x-2">
                {CATEGORIES.map((c) => (
                  <Link key={c.id} href={`/${c.id}`} className="underline">{t(`tag.${c.id}`)}</Link>
                ))}
              </span>
            </li>
            <li>{t('about.whatScam')} <Link href="/scam-shield" className="underline">{t('about.linkScam')}</Link></li>
            <li>{t('about.whatShare')}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('about.howTitle')}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
            <li>{t('about.howSources')}</li>
            <li>{t('about.howHonesty')}</li>
            <li>{t('about.howAffiliate')}</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('about.privacyTitle')}</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('about.privacyBody')}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('about.whoTitle')}</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('about.whoBody', { email: SUPPORT_EMAIL })}</p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('about.linksTitle')}</h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <li><Link href="/how-to-use" className="underline">{t('about.linkHowTo')}</Link></li>
            <li><Link href="/scam-shield" className="underline">{t('about.linkScam')}</Link></li>
            <li><Link href="/extension" className="underline">{t('about.linkExtension')}</Link></li>
            <li><Link href="/startup" className="underline">{t('about.linkStartup')}</Link></li>
            <li><Link href="/privacy" className="underline">{t('about.linkPrivacy')}</Link></li>
            <li><Link href="/terms" className="underline">{t('about.linkTerms')}</Link></li>
          </ul>
        </section>

        <div className="mt-10">
          <Link href="/chat" className="inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">
            {t('about.cta')}
          </Link>
        </div>
      </article>
      <PublicFooter />
    </>
  )
}
