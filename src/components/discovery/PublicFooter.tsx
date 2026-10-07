'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { SCAM_KB_PATH } from '@/lib/scam-shield/knowledgePages'
import { GOOGLE_PLAY_URL, playBadgeEnabled } from '@/lib/share/storeListing'
import AiDisclaimer from '@/components/AiDisclaimer'

// ─────────────────────────────────────────────────────────────────────────────
// The crawlable footer for public pages and Home.
//
// Plain HTML links, server-rendered (the component is a client component only so the labels follow the visitor's locale after
// hydration). Phase 7 closeout CP7:
//   · Khám phá — the five hubs + "Khác" (everything else Tappy answers: it opens the chat — Tappy is not limited to five domains);
//   · Tải TappyAI — Android and iOS with the TRUTHFUL state: a store link only once the public listing is verified live
//     (NEXT_PUBLIC_PLAY_LISTING_LIVE=1 for Google Play); otherwise "Sắp có". No App Store link exists — iOS is "Sắp có";
//   · Về TappyAI — About, Scam Shield, the scenario index, the extension, and the legal pages incl. Community Guidelines;
//   · the global AI disclaimer (UI contract).
// No tracking parameters, no invented store URL.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_FOOTER_ABOUT_LINKS = ['/about', '/scam-shield', SCAM_KB_PATH, '/extension'] as const
export const PUBLIC_FOOTER_LEGAL_LINKS = ['/community-guidelines', '/terms', '/privacy'] as const

export default function PublicFooter() {
  const { t } = useTranslation()
  const link = 'text-gray-600 hover:underline dark:text-gray-300'
  const androidLive = playBadgeEnabled()
  return (
    <footer className="mt-16 border-t border-gray-100 dark:border-gray-800" data-testid="public-footer">
      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <nav aria-label={t('footer.explore')}>
          <p className="font-semibold">{t('footer.explore')}</p>
          <ul className="mt-2 space-y-1">
            {CATEGORIES.map((c) => (
              <li key={c.id}><Link href={`/${c.id}`} className={link}>{t(`tag.${c.id}`)}</Link></li>
            ))}
            <li><Link href="/chat" className={link} data-footer-other>{t('footer.other')}</Link></li>
          </ul>
        </nav>
        <div data-footer-download>
          <p className="font-semibold">{t('footer.download')}</p>
          <ul className="mt-2 space-y-1">
            <li data-store="android">
              {androidLive
                ? <a href={GOOGLE_PLAY_URL} className={link} rel="noopener noreferrer" target="_blank">{t('footer.androidLive')}</a>
                : <span className="text-gray-500 dark:text-gray-400">{t('footer.androidSoon')}</span>}
            </li>
            <li data-store="ios"><span className="text-gray-500 dark:text-gray-400">{t('footer.iosSoon')}</span></li>
          </ul>
        </div>
        <nav aria-label={t('footer.about')}>
          <p className="font-semibold">{t('footer.about')}</p>
          <ul className="mt-2 space-y-1">
            <li><Link href="/about" className={link}>{t('footer.aboutTappy')}</Link></li>
            <li><Link href="/scam-shield" className={link}>Scam Shield</Link></li>
            <li><Link href={SCAM_KB_PATH} className={link}>{t('kb.index.crumb')}</Link></li>
            <li><Link href="/extension" className={link}>{t('footer.extension')}</Link></li>
            <li><Link href="/community-guidelines" className={link}>{t('footer.guidelines')}</Link></li>
            <li><Link href="/terms" className={link}>{t('footer.terms')}</Link></li>
            <li><Link href="/privacy" className={link}>{t('footer.privacy')}</Link></li>
          </ul>
        </nav>
      </div>
      <AiDisclaimer className="px-4 pb-6" />
    </footer>
  )
}
