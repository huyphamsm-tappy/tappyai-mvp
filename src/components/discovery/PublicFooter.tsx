'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { SCAM_KB_PATH } from '@/lib/scam-shield/knowledgePages'

// ─────────────────────────────────────────────────────────────────────────────
// The minimal crawlable footer for public discovery pages.
//
// Plain HTML links, server-rendered (the component is a client component only
// so the labels follow the visitor's locale after hydration — same pattern as
// every public page). Two columns: Explore (the five hubs) and About (About,
// Scam Shield, the scenario index, the extension). No tracking parameters, no
// external links, no design change to the pages that mount it.
//
// It is mounted on the discovery cluster (hubs, /about, /extension, the scam
// pages). It is NOT mounted on the Home page: Home is the owner-locked V3
// surface (docs/growth/HOME_FOOTER_DECISION.md shows the one-line change).
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_FOOTER_ABOUT_LINKS = ['/about', '/scam-shield', SCAM_KB_PATH, '/extension'] as const

export default function PublicFooter() {
  const { t } = useTranslation()
  return (
    <footer className="mt-16 border-t border-gray-100 dark:border-gray-800" data-testid="public-footer">
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8 text-sm sm:grid-cols-2">
        <nav aria-label={t('footer.explore')}>
          <p className="font-semibold">{t('footer.explore')}</p>
          <ul className="mt-2 space-y-1">
            {CATEGORIES.map((c) => (
              <li key={c.id}><Link href={`/${c.id}`} className="text-gray-600 hover:underline dark:text-gray-300">{t(`tag.${c.id}`)}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('footer.about')}>
          <p className="font-semibold">{t('footer.about')}</p>
          <ul className="mt-2 space-y-1">
            <li><Link href="/about" className="text-gray-600 hover:underline dark:text-gray-300">{t('footer.aboutTappy')}</Link></li>
            <li><Link href="/scam-shield" className="text-gray-600 hover:underline dark:text-gray-300">Scam Shield</Link></li>
            <li><Link href={SCAM_KB_PATH} className="text-gray-600 hover:underline dark:text-gray-300">{t('kb.index.crumb')}</Link></li>
            <li><Link href="/extension" className="text-gray-600 hover:underline dark:text-gray-300">{t('footer.extension')}</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
