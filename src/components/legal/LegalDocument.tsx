'use client'

import Header from '@/components/Header'
import { SITE_URL, SUPPORT_EMAIL } from '@/components/landing/config'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { LegalBlock, LegalDoc } from './legalDoc'

// Shared renderer for the legal documents (/privacy, /terms). Pages pass the
// document *structure* — which translation keys, in what order — and every
// string comes from the legal dictionary via useTranslation, so the language
// follows the site-wide LanguagePicker like the rest of the app and the two
// editions cannot drift apart structurally.
//
// Header is rendered here for a second reason beyond navigation: Tailwind runs
// darkMode:'class' and Header is the only code that puts `dark` on <html>, so a
// legal page that rendered its own header would have dead dark: variants on a
// direct visit.

export default function LegalDocument({ doc }: { doc: LegalDoc }) {
  const { t, locale } = useTranslation()

  const linkClass =
    'font-medium text-primary-500 underline underline-offset-4 hover:text-primary-600 dark:hover:text-primary-400 break-words'

  const renderBlock = (block: LegalBlock, i: number) => {
    switch (block.kind) {
      case 'lead':
      case 'p':
        return (
          <p key={i} className="text-fluid-body text-gray-600 dark:text-gray-300">
            {t(block.key)}
          </p>
        )
      case 'note':
        return (
          <p key={i} className="text-fluid-body font-semibold text-gray-900 dark:text-white">
            {t(block.key)}
          </p>
        )
      case 'bullets':
        return (
          <ul key={i} className="space-y-2.5">
            {block.keys.map((k) => (
              <li
                key={k}
                className="flex gap-3 text-fluid-body text-gray-600 dark:text-gray-300"
              >
                {/* Decorative marker rather than a native list dot so it can carry
                    the brand accent and stay aligned with the first wrapped line. */}
                <span
                  aria-hidden="true"
                  className="mt-[0.65em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500"
                />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        )
      case 'steps':
        return (
          // A real <ol> so the order is conveyed to assistive tech, not just
          // drawn. The counter is rendered rather than using a native marker so
          // it can carry the brand accent and stay aligned with wrapped lines,
          // matching the bullet treatment above.
          <ol key={i} className="space-y-2.5">
            {block.keys.map((k, n) => (
              <li
                key={k}
                className="flex gap-3 text-fluid-body text-gray-600 dark:text-gray-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.1em] flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-semibold text-white"
                >
                  {n + 1}
                </span>
                <span className="mt-[0.15em]">{t(k)}</span>
              </li>
            ))}
          </ol>
        )
      case 'contact':
        return (
          <dl key={i} className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('legal.contact.email')}
              </dt>
              <dd className="text-fluid-body">
                <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                  {SUPPORT_EMAIL}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('legal.contact.website')}
              </dt>
              <dd className="text-fluid-body">
                <a href={SITE_URL} className={linkClass}>
                  {SITE_URL}
                </a>
              </dd>
            </div>
          </dl>
        )
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      {/* No fixed backHref: these documents are reached from Settings, the login
          screen, the landing footer and the Play Console listing, so no single
          destination is right for everyone. A fixed href pushed Home and stranded
          users who came from Settings. Back now pops history, falling back to
          Home only when the tab opened directly on this page. */}
      <Header showBack backFallbackHref="/" />

      {/* lang follows the active locale so screen readers and translation tools
          pronounce the document correctly when the user switches language. */}
      <main className="container-content py-10 sm:py-14" lang={locale}>
        <header className="mb-8 sm:mb-10">
          <h1 className="text-fluid-display font-bold text-gray-900 dark:text-white">
            {t(doc.titleKey)}
          </h1>
          {/* Decorative accent rule — mirrors the marketing sections */}
          <span aria-hidden="true" className="mt-4 block h-1 w-12 rounded-full bg-accent-500" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t(doc.effectiveKey)}</p>
        </header>

        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10 sm:space-y-10 sm:p-8">
          {doc.sections.map((section) => {
            const headingId = `${section.id}-heading`
            return (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={headingId}
                className="scroll-mt-20 space-y-3"
              >
                <h2
                  id={headingId}
                  className="text-fluid-h3 font-semibold text-gray-900 dark:text-white"
                >
                  {t(section.headingKey)}
                </h2>
                {section.blocks.map(renderBlock)}
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}
