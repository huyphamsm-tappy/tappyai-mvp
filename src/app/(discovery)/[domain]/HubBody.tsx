'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { hubCopy } from '@/lib/discovery/domainHubs'
import { CATEGORIES, type CategoryId } from '@/lib/utils'
import type { PublicSharedResultSummary } from '@/lib/share/sharedResult'

// The hub's content, in the visitor's language.
//
// A client component ON PURPOSE, and still fully server-rendered: during SSR
// `useTranslation` reports the product locale (vi), so a crawler receives the
// complete Vietnamese page; after hydration the store reconciles to the stored
// locale and an English visitor reads English. That is the app-wide pattern
// (see layout.tsx / HtmlLangSync) — not a second translation mechanism.
// Every string is a `hub.*` key from src/lib/i18n/discovery.ts.
export default function HubBody({ domain, results }: { domain: CategoryId; results: PublicSharedResultSummary[] }) {
  const { t, locale } = useTranslation()
  const copy = hubCopy(domain, locale, t)
  const category = CATEGORIES.find((c) => c.id === domain)!

  return (
    <>
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg">TappyAI</Link>
          <nav aria-label={t('hub.ui.domainsNav')} className="flex gap-3 text-sm">
            {CATEGORIES.map((c) => (
              <Link key={c.id} href={`/${c.id}`} className={c.id === domain ? 'font-semibold underline' : 'text-gray-600 dark:text-gray-300'}>
                {c.emoji} {t(`tag.${c.id}`)}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-gray-500">{category.emoji} {t(`tag.${domain}`)}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">{copy.h1}</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{copy.intro}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">{t('hub.ui.tryNow')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {copy.examples.map((q) => (
              <li key={q}>
                <Link href={`/chat?category=${domain}&q=${encodeURIComponent(q)}`} className="block rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm hover:border-primary-400">
                  {q}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {results.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t('hub.ui.sharedResults')}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {results.map((r) => (
                <li key={r.slug} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-3">
                  <Link href={`/r/${r.slug}`} className="flex gap-3">
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" loading="lazy" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{r.title}</span>
                      <span className="mt-1 block text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('hub.ui.faq')}</h2>
          <dl className="mt-3 space-y-4">
            {copy.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-sm text-gray-700 dark:text-gray-300">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-10">
          <Link href={`/chat?category=${domain}`} className="inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">
            {t('hub.ui.askAbout', { domain: t(`tag.${domain}`).toLowerCase() })}
          </Link>
        </div>
      </article>
    </>
  )
}
