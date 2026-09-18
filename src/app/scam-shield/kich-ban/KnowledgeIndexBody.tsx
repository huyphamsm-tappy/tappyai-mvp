'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { KNOWLEDGE_DATASETS, KNOWLEDGE_CATEGORIES, scenariosIn } from '@/lib/scam-shield/knowledge'
import { scenarioPath } from '@/lib/scam-shield/knowledgePages'

// The index body: five official groups, each with its scenarios linked to
// their own page. Group labels and descriptions are the dataset's official
// Vietnamese text; chrome strings come from the dictionary (kb.* / v3.scam.kb.*).
export default function KnowledgeIndexBody() {
  const { t, locale } = useTranslation()
  const dataset = KNOWLEDGE_DATASETS[0]
  const total = KNOWLEDGE_DATASETS.reduce((n, d) => n + d.scenarios.length, 0)
  return (
    <>
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg">TappyAI</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/scam-shield" className="text-gray-600 dark:text-gray-300">Scam Shield</Link>
            <Link href="/about" className="text-gray-600 dark:text-gray-300">{t('hub.ui.about')}</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-gray-500">Scam Shield</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">{t('kb.index.h1')}</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{t('kb.index.intro')}</p>
        <p className="mt-2 text-sm text-gray-500">{t('kb.index.countLine', { n: String(total) })}</p>
        <p className="mt-1 text-sm text-gray-500">
          <a href={dataset.source.url} target="_blank" rel="noopener noreferrer" className="underline" data-kb-source-link>
            {t('kb.index.sourceLine', { org: dataset.source.organization, title: dataset.source.title })}
          </a>
        </p>
        {locale === 'en' && <p className="mt-1 text-xs text-gray-500">{t('v3.scam.kb.contentLanguage')}</p>}

        {KNOWLEDGE_CATEGORIES.map((cat) => {
          const group = dataset.groups.find((g) => g.category === cat)
          const items = scenariosIn(cat)
          if (!group || items.length === 0) return null
          return (
            <section key={cat} className="mt-10" data-kb-group={cat}>
              <h2 className="text-lg font-semibold">{group.officialNumber}. {group.label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{group.description}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {items.map((s) => (
                  <li key={s.id}>
                    <Link href={scenarioPath(s.id)} className="block rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm hover:border-primary-400">
                      <span className="block font-medium leading-snug">{s.officialNumber}. {s.official.title}</span>
                      <span className="mt-1 block text-xs text-gray-500">{s.official.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section className="mt-12 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold">{t('kb.page.checkTitle')}</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('kb.page.checkBody')}</p>
          <Link href="/scam-shield" className="mt-4 inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">{t('kb.page.checkCta')}</Link>
          <p className="mt-3 text-sm"><Link href="/extension" className="underline">{t('kb.page.extensionLine')}</Link></p>
        </section>
      </article>
    </>
  )
}
