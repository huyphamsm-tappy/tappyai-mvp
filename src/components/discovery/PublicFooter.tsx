'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORIES } from '@/lib/utils'
import { SCAM_KB_PATH } from '@/lib/scam-shield/knowledgePages'
import { GOOGLE_PLAY_URL, playBadgeEnabled, APP_STORE_URL, SOCIAL_LINKS } from '@/lib/share/storeListing'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'
import AiDisclaimer from '@/components/AiDisclaimer'

// ─────────────────────────────────────────────────────────────────────────────
// The footer of Home and the public pages (redesigned 21/11/2026 to the owner's mockup:
// a compact app-download banner on top, then the brand + social icons and four link columns).
//
// Plain HTML links, server-rendered (a client component only so the labels follow the visitor's locale after hydration).
//   · Khám phá — the five hubs + "Khác" (it opens the chat — Tappy is not limited to five domains);
//   · Tải ứng dụng — Android and iOS, each with a QR code to its store listing (owner 21/11: QR codes instead of a "Sẵn có" tag).
//     TRUTHFUL state: the QR and the store link exist only while that listing is live (Google Play: on unless
//     NEXT_PUBLIC_PLAY_LISTING_LIVE=0; App Store: the verified listing unless NEXT_PUBLIC_APP_STORE_URL=off). Otherwise "Sắp có", no link, no QR.
//     The QR is drawn in the browser by the project's own encoder (no outside service, nothing sent anywhere);
//   · Về TappyAI and Hỗ trợ — About, Scam Shield, the scenario index, the extension, Community Guidelines, Terms, Privacy, Support;
//   · the global AI disclaimer (UI contract).
// Social icons (Facebook, TikTok, Instagram, Threads, LinkedIn) link to the official accounts in storeListing.ts; an account without a link draws no icon.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_FOOTER_ABOUT_LINKS = ['/about', '/scam-shield', SCAM_KB_PATH, '/extension'] as const
export const PUBLIC_FOOTER_LEGAL_LINKS = ['/community-guidelines', '/terms', '/privacy'] as const

function PlayGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 24" aria-hidden="true">
      <path d="M1 1.2 12.4 12 1 22.8c-.4-.3-.6-.8-.6-1.4V2.6c0-.6.2-1.1.6-1.4Z" fill="#00d7fe" />
      <path d="m16.2 8.2-3.8 3.8L1 1.2c.5-.3 1.2-.3 1.8.1l13.4 6.9Z" fill="#00f076" />
      <path d="m16.2 15.8-13.4 7c-.6.3-1.3.3-1.8.1L12.4 12l3.8 3.8Z" fill="#ff3a44" />
      <path d="m21 12-4.8 3.8L12.4 12l3.8-3.8L21 10.9c.6.3.8.7.8 1.1s-.2.8-.8 1Z" fill="#ffd500" />
    </svg>
  )
}

function AppleGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.7ZM14.2 5.8c.6-.8 1.1-1.9.9-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" />
    </svg>
  )
}

function StoreBadge({ store, href, label, soon }: { store: 'google' | 'apple'; href: string | null; label: string; soon: string }) {
  const inner = (
    <>
      {store === 'google' ? <PlayGlyph /> : <AppleGlyph />}
      <span className="flex flex-col text-left leading-none">
        <span className="text-[10px] font-medium opacity-90">{href ? label : soon}</span>
        <span className="mt-0.5 text-[18px] font-semibold">{store === 'google' ? 'Google Play' : 'App Store'}</span>
      </span>
    </>
  )
  // Both badges share one size, radius and glow (new banner design, 21/11/2026).
  const cls = 'inline-flex h-[50px] w-[168px] shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-[14px] border border-[rgba(96,165,250,0.45)] bg-[#050b1c] px-4 text-white shadow-[0_0_14px_rgba(59,130,246,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]'
  return href
    ? <a href={href} className={`${cls} transition-transform hover:scale-[1.03]`} rel="noopener noreferrer" target="_blank" data-badge={store}>{inner}</a>
    : <span className={`${cls} cursor-default opacity-60`} aria-disabled="true" data-badge={store}>{inner}</span>
}

/** A QR code to `url`, drawn locally as an SVG (white tile so it scans on the dark footer). */
function StoreQr({ url, label }: { url: string; label: string }) {
  const svg = useMemo(() => {
    try { return qrToSvg(encodeQR(url), { size: 84, margin: 2, dark: '#0B0C11', light: '#FFFFFF' }) } catch { return '' }
  }, [url])
  if (!svg) return null
  return (
    <a href={url} rel="noopener noreferrer" target="_blank" aria-label={label} title={label} data-qr
      className="block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-lg bg-white p-0 transition-transform hover:scale-[1.04]"
      dangerouslySetInnerHTML={{ __html: svg }} />
  )
}

const SocialSvg = {
  tiktok: <path d="M16.600 3c.3 2.500 1.700 4 4.200 4.200v3a7 7 0 0 1-4.100-1.300v6.100a6 6 0 1 1-6-6c.3 0 .6 0 .9.100v3.100a3 3 0 1 0 2.100 2.900V3h2.900Z" />,
  facebook: <path d="M13.500 21.500v-8h2.700l.4-3.200h-3.100V8.300c0-.9.300-1.500 1.600-1.500h1.700V4c-.3 0-1.300-.1-2.400-.1-2.400 0-4 1.500-4 4.100v2.300H7.700v3.200h2.700v8h3.100Z" />,
  instagram: <path d="M12 7.500A4.500 4.500 0 1 0 16.500 12 4.500 4.500 0 0 0 12 7.500Zm0 7.400a2.900 2.900 0 1 1 2.900-2.900 2.900 2.900 0 0 1-2.900 2.900ZM16.800 6a1.100 1.100 0 1 0 1.100 1.100A1.100 1.100 0 0 0 16.800 6ZM12 3.500c-2.300 0-2.600 0-3.500.1-2.700.1-4.100 1.500-4.300 4.300-.1.900-.1 1.200-.1 3.500s0 2.600.1 3.500c.2 2.800 1.600 4.200 4.300 4.300.9.100 1.200.1 3.500.1s2.600 0 3.500-.1c2.800-.1 4.200-1.500 4.300-4.300.1-.9.1-1.200.1-3.500s0-2.600-.1-3.500c-.1-2.800-1.500-4.200-4.300-4.300-.9-.1-1.200-.1-3.500-.1Z" fillRule="evenodd" />,
  threads: <path d="M12.200 3c-4.900 0-8 3.200-8 9s3.100 9 8 9c3.800 0 6.200-1.800 6.200-4.600 0-2-1.300-3.300-3.300-3.700.1-1.700-.4-3-1.400-3.900-.8-.7-1.900-1-3.100-1-1.800 0-3.100.8-3.800 2l1.500.9c.5-.8 1.200-1.200 2.200-1.200 1.600 0 2.500.9 2.500 2.400v.3c-.7-.1-1.400-.2-2.200-.1-2 .1-3.300 1.200-3.300 2.800 0 1.700 1.400 2.800 3.300 2.700 2.400-.1 3.600-1.500 3.800-3.800 1.100.3 1.600 1 1.600 1.900 0 1.700-1.500 2.800-4 2.800-3.700 0-5.800-2.300-5.800-7.200s2.100-7.200 5.800-7.200c1.900 0 3.300.5 4.300 1.600.7.800 1.100 1.800 1.300 3l1.800-.4c-.3-1.600-.9-2.900-1.900-3.900C16.600 3.700 14.700 3 12.200 3Zm.2 11.800c-.8 0-1.400-.4-1.400-1 0-.6.600-1 1.500-1.100.6 0 1.100 0 1.600.1-.1 1.400-.7 2-1.700 2Z" />,
  linkedin: <path d="M20.400 20.500h-3.600v-5.600c0-1.300 0-3-1.800-3s-2.100 1.400-2.100 2.900v5.700H9.300V9h3.400v1.600c.5-.9 1.600-1.800 3.400-1.800 3.600 0 4.300 2.400 4.300 5.500v6.200ZM5.300 7.400a2.100 2.100 0 1 1 0-4.200 2.100 2.100 0 0 1 0 4.200Zm1.800 13.100H3.500V9h3.600v11.500ZM22.200 0H1.800C.8 0 0 .8 0 1.700v20.600c0 .9.800 1.700 1.800 1.700h20.400c1 0 1.800-.8 1.800-1.700V1.700C24 .8 23.200 0 22.200 0Z" />,
} as const

/** Drawn only when the account's link exists — an icon that goes nowhere is not shown. */
function SocialIcon({ name, href }: { name: keyof typeof SocialSvg; href: string | null }) {
  if (!href) return null
  return (
    <a href={href} className="text-gray-400 transition-colors hover:text-white" rel="noopener noreferrer" target="_blank" aria-label={name} data-social={name}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{SocialSvg[name]}</svg>
    </a>
  )
}

export default function PublicFooter() {
  const { t } = useTranslation()
  const link = 'text-gray-500 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-white'
  const head = 'text-[15px] font-semibold text-gray-900 dark:text-white'
  const androidLive = playBadgeEnabled()
  const iosLive = !!APP_STORE_URL
  const store = (key: 'android' | 'ios', icon: ReactNode, name: string, url: string | null) => (
    <li data-store={key} className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
      <span className="flex w-[84px] items-center gap-2">{icon}<span>{name}</span></span>
      {url
        ? <StoreQr url={url} label={`${name} · ${key === 'android' ? 'Google Play' : 'App Store'}`} />
        : <span className="rounded-full bg-gray-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-gray-400">{t('footer.soon')}</span>}
    </li>
  )
  return (
    <footer className="mt-16" data-testid="public-footer">
      {/* ── App-download banner (compact, phones overflow the top edge) ───── */}
      <section
        className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 overflow-hidden rounded-[24px] border border-[rgba(96,165,250,0.35)] px-6 py-4 shadow-[0_0_28px_rgba(37,99,235,0.22)] sm:px-9 lg:flex-nowrap"
        style={{ background: 'linear-gradient(100deg, #060f26 0%, #0a1b44 55%, #0d2a62 100%)' }}
        data-footer-banner
      >
        {/* Depth: a blue glow along the bottom edge and a soft wave behind the mascot. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(to top, rgba(37,99,235,0.45), transparent)' }} />
        <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[34%] sm:block">
          <path d="M0 100 C 70 60, 130 40, 200 62 S 330 70, 400 30 L 400 100 Z" fill="rgba(37,99,235,0.28)" />
          <path d="M60 100 C 130 78, 210 70, 280 82 S 360 70, 400 56 L 400 100 Z" fill="rgba(56,139,253,0.30)" />
        </svg>
        {/* Order, left to right: the words (with a small blue accent bar) · the two badges, same size · the mascot as the focal point. */}
        <div className="relative flex min-w-0 flex-1 items-stretch gap-3.5 lg:flex-none">
          <span aria-hidden="true" className="w-[3px] shrink-0 rounded-full" style={{ background: 'linear-gradient(to bottom, #22d3ee, #2563eb)' }} />
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold leading-tight text-white sm:text-[20px] lg:whitespace-nowrap">{t('footer.bannerTitle')}</h2>
            <p className="mt-1 text-[13px] text-blue-100/80 sm:text-[14px]">{t('footer.bannerBody')}</p>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-3 lg:flex-1 lg:justify-center">
          <StoreBadge store="google" href={androidLive ? GOOGLE_PLAY_URL : null} label={t('footer.badgeGetOn')} soon={t('footer.badgeSoon')} />
          <StoreBadge store="apple" href={iosLive ? APP_STORE_URL : null} label={t('footer.badgeDownloadOn')} soon={t('footer.badgeSoon')} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- the mascot from /public, decorative */}
        <img src="/branding/mascot-scooter.webp" alt="" aria-hidden="true" className="pointer-events-none relative ml-auto hidden h-[100px] w-auto shrink-0 object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)] sm:block" data-footer-mascot />
      </section>

      {/* ── Brand + columns ─────────────────────────────────────────────── */}
      <div className="mx-auto mt-10 grid max-w-6xl gap-10 px-2 pt-8 text-[15px] dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.9fr_1.15fr_1fr_1fr]" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="TappyAI">
            {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark from /public */}
            <img src="/branding/otter-logo.png" alt="" width={52} height={52} className="h-[52px] w-[52px] object-contain" />
            <span className="text-[26px] font-bold text-gray-900 dark:text-white">TappyAI</span>
          </Link>
          <p className="mt-3 max-w-[270px] text-[14px] text-gray-500 dark:text-gray-300">{t('footer.brandTagline')}</p>
          <div className="mt-5 flex items-center gap-5" data-footer-social>
            <SocialIcon name="facebook" href={SOCIAL_LINKS.facebook} />
            <SocialIcon name="tiktok" href={SOCIAL_LINKS.tiktok} />
            <SocialIcon name="instagram" href={SOCIAL_LINKS.instagram} />
            <SocialIcon name="threads" href={SOCIAL_LINKS.threads} />
            <SocialIcon name="linkedin" href={SOCIAL_LINKS.linkedin} />
          </div>
        </div>
        <nav aria-label={t('footer.explore')}>
          <p className={head}>{t('footer.explore')}</p>
          <ul className="mt-3 space-y-2.5">
            {CATEGORIES.map((c) => (
              <li key={c.id}><Link href={`/${c.id}`} className={link}>{t(`tag.${c.id}`)}</Link></li>
            ))}
            <li><Link href="/chat" className={link} data-footer-other>{t('footer.other')}</Link></li>
          </ul>
        </nav>
        <div data-footer-download>
          <p className={head}>{t('footer.download')}</p>
          <ul className="mt-3 space-y-3">
            {store('android', <PlayGlyph size={18} />, 'Android', androidLive ? GOOGLE_PLAY_URL : null)}
            {store('ios', <AppleGlyph size={18} />, 'iOS', iosLive ? APP_STORE_URL : null)}
          </ul>
        </div>
        <nav aria-label={t('footer.about')}>
          <p className={head}>{t('footer.about')}</p>
          <ul className="mt-3 space-y-2.5">
            <li><Link href="/about" className={link}>{t('footer.aboutTappy')}</Link></li>
            <li><Link href="/scam-shield" className={link}>Scam Shield</Link></li>
            <li><Link href={SCAM_KB_PATH} className={link}>{t('kb.index.crumb')}</Link></li>
            <li><Link href="/extension" className={link}>{t('footer.extension')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.support')}>
          <p className={head}>{t('footer.support')}</p>
          <ul className="mt-3 space-y-2.5">
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
