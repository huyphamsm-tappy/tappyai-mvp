import Link from 'next/link'
import { renderPublicMarkdown } from '@/lib/share/renderPublicMarkdown'
import { publicResultText } from '@/lib/i18n/share'
import { BRAND } from '@/lib/share/openGraph'
import type { PublicSharedResult } from '@/lib/share/sharedResult'
import TripPlanCard from '@/components/TripPlanCard'
import ShoppingDecision from '@/components/chat/ShoppingDecision'
import PublicResultClient from './PublicResultClient'
import PublicPlacesList from './PublicPlacesList'

// The server-rendered body of /r/<slug>. Everything a crawler needs is in this
// markup: the question, the full answer, the outbound actions, the images.
// Interactive pieces (tracking, follow-up, share) mount in PublicResultClient.
export default function PublicResultView({ result }: { result: PublicSharedResult }) {
  const { payload } = result
  const t = (key: Parameters<typeof publicResultText>[1]) => publicResultText(payload.locale, key)
  const heroImage = payload.images[0] ?? null

  return (
    <main className="min-h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/otter-logo.png" alt="" width={28} height={28} className="rounded-lg" />
            <span>{BRAND.name}</span>
          </Link>
          <Link href={`/?src=share_out`} className="rounded-full bg-interactive px-4 py-1.5 text-sm font-semibold text-white">
            {t('publicResult.openTappy')}
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('publicResult.askedTappy')}</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug">{payload.title}</h1>
        {payload.query !== payload.title && (
          <p className="mt-2 rounded-2xl bg-gray-50 dark:bg-gray-900 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">“{payload.query}”</p>
        )}

        {payload.images.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {payload.images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" className="h-40 w-52 flex-shrink-0 rounded-xl object-cover" />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('publicResult.answer')}</p>
        <div
          className="prose-tappy mt-2 whitespace-pre-wrap text-base leading-[1.65] text-gray-800 dark:text-gray-100"
          dangerouslySetInnerHTML={{ __html: renderPublicMarkdown(payload.body) }}
        />

        {payload.plan && <div className="mt-4"><TripPlanCard plan={payload.plan} /></div>}
        {payload.shopping && <div className="mt-4"><ShoppingDecision view={payload.shopping} heroImage={heroImage} /></div>}
        {payload.places && <PublicPlacesList places={payload.places} locale={payload.locale} />}

        {payload.buttons.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" data-public-buttons>
            {payload.buttons.map((btn) => (
              <a
                key={btn.url}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                data-cta-type={btn.type}
                className={btn.primary
                  ? 'inline-flex items-center rounded-xl bg-interactive px-4 py-2 text-sm font-medium text-white'
                  : 'inline-flex items-center rounded-xl border border-primary-300 dark:border-primary-700 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400'}
              >
                {btn.label}
              </a>
            ))}
          </div>
        )}

        <PublicResultClient
          shareId={result.id}
          slug={result.slug}
          locale={payload.locale}
          title={payload.title}
          suggestedQuestions={payload.suggestedQuestions}
        />

        <footer className="mt-10 border-t border-gray-100 dark:border-gray-800 pt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>{t('publicResult.poweredBy')}</p>
          <p className="mt-1">
            <Link href={`/${payload.domain === 'general' ? '' : payload.domain}`} className="underline">{t('publicResult.moreResults')}</Link>
          </p>
        </footer>
      </article>
    </main>
  )
}
