'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { SCAM_KB_PATH } from '@/lib/scam-shield/knowledgePages'
import { GOOGLE_PLAY_URL, playBadgeEnabled, APP_STORE_URL } from '@/lib/share/storeListing'
import AiDisclaimer from '@/components/AiDisclaimer'

// ─────────────────────────────────────────────────────────────────────────────
// The footer of Home and the public pages (redesigned 21/11/2026 from the owner's reference:
// an app-download banner on top, then the brand + four link columns).
//
// Plain HTML links, server-rendered (a client component only so the labels follow the visitor's locale after hydration).
//   · Khám phá — the five hubs + "Khác" (it opens the chat — Tappy is not limited to five domains);
//   · Tải ứng dụng — TRUTHFUL state: a store link, and the "Sẵn có" tag, only when that listing is verified live
//     (Google Play: NEXT_PUBLIC_PLAY_LISTING_LIVE=1; App Store: NEXT_PUBLIC_APP_STORE_URL set). Otherwise "Sắp có", no link.
//     The same state drives the two badges in the banner. No invented store URL, no tracking parameters;
//   · Về TappyAI and Hỗ trợ — About, Scam Shield, the scenario index, the extension, Community Guidelines, Terms, Privacy, Support;
//   · the global AI disclaimer (UI contract).
// No social-media icons: no official account URL exists in the product yet, and an icon that goes nowhere is worse than none.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_FOOTER_ABOUT_LINKS = ['/about', '/scam-shield', SCAM_KB_PATH, '/extension'] as const
export const PUBLIC_FOOTER_LEGAL_LINKS = ['/community-guidelines', '/terms', '/privacy'] as const

function PlayGlyph() {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
      <path d="M1 1.2 12.4 12 1 22.8c-.4-.3-.6-.8-.6-1.4V2.6c0-.6.2-1.1.6-1.4Z" fill="#00d7fe" />
      <path d="m16.2 8.2-3.8 3.8L1 1.2c.5-.3 1.2-.3 1.8.1l13.4 6.9Z" fill="#00f076" />
      <path d="m16.2 15.8-13.4 7c-.6.3-1.3.3-1.8.1L12.4 12l3.8 3.8Z" fill="#ff3a44" />
      <path d="m21 12-4.8 3.8L12.4 12l3.8-3.8L21 10.9c.6.3.8.7.8 1.1s-.2.8-.8 1Z" fill="#ffd500" />
    </svg>
  )
}

function AppleGlyph() {
  return (
    <svg width="22" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.7ZM14.2 5.8c.6-.8 1.1-1.9.9-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" />
    </svg>
  )
}

function StoreBadge({ store, href, label, soon }: { store: 'google' | 'apple'; href: string | null; label: string; soon: string }) {
  const inner = (
    <>
      {store === 'google' ? <PlayGlyph /> : <AppleGlyph />}
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[10px] font-medium opacity-80">{href ? label : soon}</span>
        <span className="text-[17px] font-semibold">{store === 'google' ? 'Google Play' : 'App Store'}</span>
      </span>
    </>
  )
  const cls = 'inline-flex h-12 items-center gap-2.5 rounded-lg border border-white/30 bg-black px-4 text-white'
  return href
    ? <a href={href} className={`${cls} transition-transform hover:scale-[1.03]`} rel="noopener noreferrer" target="_blank" data-badge={store}>{inner}</a>
    : <span className={`${cls} cursor-default opacity-60`} aria-disabled="true" data-badge={store}>{inner}</span>
}

export default function PublicFooter() {
  const { t } = useTranslation()
  const link = 'text-gray-500 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-white'
  const head = 'text-sm font-semibold text-gray-900 dark:text-white'
  const androidLive = playBadgeEnabled()
  const iosLive = !!APP_STORE_URL
  const pill = 'rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-300'
  const pillOff = 'rounded-full bg-gray-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400'
  return (
    <footer className="mt-16" data-testid="public-footer">
      {/* ── App-download banner ─────────────────────────────────────────── */}
      <section
        className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 overflow-hidden rounded-2xl border border-white/10 px-6 py-6 sm:px-9"
        style={{ background: 'linear-gradient(100deg, #0f2a5c 0%, #123a7a 55%, #1b3f86 100%)' }}
        data-footer-banner
      >
        <div className="min-w-[260px] flex-1">
          <h2 className="text-xl font-bold text-white sm:text-2xl">{t('footer.bannerTitle')}</h2>
          <p className="mt-1 text-sm text-blue-100/80">{t('footer.bannerBody')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <StoreBadge store="google" href={androidLive ? GOOGLE_PLAY_URL : null} label={t('footer.badgeGetOn')} soon={t('footer.badgeSoon')} />
            <StoreBadge store="apple" href={iosLive ? APP_STORE_URL : null} label={t('footer.badgeDownloadOn')} soon={t('footer.badgeSoon')} />
          </div>
        </div>
        <div className="relative hidden h-[150px] w-[260px] shrink-0 sm:block" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative phone screens from /public */}
          <img src="/landing/screen-chat.webp" alt="" className="absolute bottom-[-40px] left-2 h-[190px] w-[96px] -rotate-6 rounded-2xl border-4 border-black object-cover object-top shadow-xl" />
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative phone screens from /public */}
          <img src="/landing/screen-home.webp" alt="" className="absolute bottom-[-30px] right-2 h-[200px] w-[100px] rotate-6 rounded-2xl border-4 border-black object-cover object-top shadow-xl" />
        </div>
      </section>

      {/* ── Brand + columns ─────────────────────────────────────────────── */}
      <div className="mx-auto mt-8 grid max-w-6xl gap-8 border-t border-gray-100 px-2 pt-8 text-sm dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="TappyAI">
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark from /public */}
            <img src="/branding/otter-logo.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">TappyAI</span>
          </Link>
          <p className="mt-3 max-w-[260px] text-gray-500 dark:text-gray-300">{t('footer.brandTagline')}</p>
        </div>
        <nav aria-label={t('footer.explore')}>
          <p className={head}>{t('footer.explore')}</p>
          <ul className="mt-3 space-y-2">
            {CATEGORIES.map((c) => (
              <li key={c.id}><Link href={`/${c.id}`} className={link}>{t(`tag.${c.id}`)}</Link></li>
            ))}
            <li><Link href="/chat" className={link} data-footer-other>{t('footer.other')}</Link></li>
          </ul>
        </nav>
        <div data-footer-download>
          <p className={head}>{t('footer.download')}</p>
          <ul className="mt-3 space-y-2.5">
            <li data-store="android" className="flex items-center gap-2.5 text-gray-500 dark:text-gray-300">
              <span>Android</span>
              {androidLive
                ? <a href={GOOGLE_PLAY_URL} className={pill} rel="noopener noreferrer" target="_blank">{t('footer.available')}</a>
                : <span className={pillOff}>{t('footer.soon')}</span>}
            </li>
            <li data-store="ios" className="flex items-center gap-2.5 text-gray-500 dark:text-gray-300">
              <span>iOS</span>
              {iosLive
                ? <a href={APP_STORE_URL!} className={pill} rel="noopener noreferrer" target="_blank">{t('footer.available')}</a>
                : <span className={pillOff}>{t('footer.soon')}</span>}
            </li>
          </ul>
        </div>
        <nav aria-label={t('footer.about')}>
          <p className={head}>{t('footer.about')}</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/about" className={link}>{t('footer.aboutTappy')}</Link></li>
            <li><Link href="/scam-shield" className={link}>Scam Shield</Link></li>
            <li><Link href={SCAM_KB_PATH} className={link}>{t('kb.index.crumb')}</Link></li>
            <li><Link href="/extension" className={link}>{t('footer.extension')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.support')}>
          <p className={head}>{t('footer.support')}</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/community-guidelines" className={link}>{t('footer.guidelines')}</Link></li>
            <li><Link href="/terms" className={link}>{t('footer.terms')}</Link></li>
            <li><Link href="/privacy" className={link}>{t('footer.privacy')}</Link></li>
            <li><Link href="/support" className={link}>{t('footer.contactSupport')}</Link></li>
          </ul>
        </nav>
      </div>
      <AiDisclaimer className="px-4 pb-6 pt-8 text-center" />
    </footer>
  )
}
