'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { scenariosIn, type ScamScenario } from '@/lib/scam-shield/knowledge'
import { SCAM_KB_PATH, scenarioPath } from '@/lib/scam-shield/knowledgePages'
import { ScenarioDetail } from '@/app/scam-shield/ScamKnowledgeSection'

// One scenario as a page. The detail block is the SAME component the Scam
// Shield knowledge section renders (official text / TappyAI guidance / source
// prevention measures, visibly separated) — reused, not re-implemented.
export default function ScenarioPageBody({ scenario }: { scenario: ScamScenario }) {
  const { t, locale } = useTranslation()
  const siblings = scenariosIn(scenario.category).filter((s) => s.id !== scenario.id)
  return (
    <>
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg">TappyAI</Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/scam-shield" className="text-gray-600 dark:text-gray-300">Scam Shield</Link>
            <Link href={SCAM_KB_PATH} className="text-gray-600 dark:text-gray-300">{t('kb.index.crumb')}</Link>
          </nav>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-gray-500">{t(`v3.scam.kb.cat.${scenario.category}`)} · {t('v3.scam.kb.officialNumber', { n: String(scenario.officialNumber) })}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">{scenario.official.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{scenario.official.summary}</p>
        {locale === 'en' && <p className="mt-1 text-xs text-gray-500">{t('v3.scam.kb.contentLanguage')}</p>}

        <ScenarioDetail scenario={scenario} />

        <section className="mt-10 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-lg font-semibold">{t('kb.page.checkTitle')}</h2>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{t('kb.page.checkBody')}</p>
          <Link href="/scam-shield" className="mt-4 inline-block rounded-2xl bg-interactive px-6 py-3 font-semibold text-white">{t('kb.page.checkCta')}</Link>
          <p className="mt-3 text-sm"><Link href="/extension" className="underline">{t('kb.page.extensionLine')}</Link></p>
        </section>

        {siblings.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t('kb.page.otherInGroup')}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {siblings.map((s) => (
                <li key={s.id}>
                  <Link href={scenarioPath(s.id)} className="block rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm hover:border-primary-400">
                    {s.officialNumber}. {s.official.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 text-sm"><Link href={SCAM_KB_PATH} className="underline">{t('kb.page.backToIndex')}</Link></p>
      </article>
    </>
  )
}
