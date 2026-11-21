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
// Social icons link only to accounts configured in NEXT_PUBLIC_SOCIAL_* (see storeListing.ts); an unset one is drawn but not a link.
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
  const cls = 'inline-flex h-[46px] items-center gap-2.5 rounded-lg border border-white/40 bg-black px-4 text-white'
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
  youtube: <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.900.5A3 3 0 0 0 1 7.200C.5 9.100.5 12 .5 12s0 2.900.5 4.800a3 3 0 0 0 2.100 2.100c1.900.5 8.900.5 8.900.5s7 0 8.900-.5a3 3 0 0 0 2.100-2.100c.5-1.900.5-4.800.5-4.800s0-2.900-.5-4.800ZM9.800 15.400V8.600L15.700 12l-5.900 3.400Z" />,
  tiktok: <path d="M16.600 3c.3 2.500 1.700 4 4.200 4.200v3a7 7 0 0 1-4.100-1.300v6.100a6 6 0 1 1-6-6c.3 0 .6 0 .9.100v3.100a3 3 0 1 0 2.100 2.900V3h2.900Z" />,
  facebook: <path d="M13.500 21.500v-8h2.700l.4-3.200h-3.100V8.300c0-.9.300-1.500 1.600-1.500h1.700V4c-.3 0-1.300-.1-2.400-.1-2.400 0-4 1.500-4 4.100v2.300H7.700v3.200h2.700v8h3.100Z" />,
  instagram: <path d="M12 7.500A4.500 4.500 0 1 0 16.500 12 4.500 4.500 0 0 0 12 7.500Zm0 7.400a2.900 2.900 0 1 1 2.900-2.900 2.900 2.900 0 0 1-2.900 2.900ZM16.800 6a1.100 1.100 0 1 0 1.100 1.100A1.100 1.100 0 0 0 16.800 6ZM12 3.500c-2.300 0-2.600 0-3.500.1-2.700.1-4.100 1.500-4.300 4.300-.1.900-.1 1.200-.1 3.500s0 2.600.1 3.500c.2 2.800 1.600 4.200 4.300 4.300.9.100 1.200.1 3.500.1s2.600 0 3.500-.1c2.800-.1 4.200-1.500 4.300-4.300.1-.9.1-1.200.1-3.500s0-2.600-.1-3.500c-.1-2.800-1.500-4.200-4.300-4.300-.9-.1-1.200-.1-3.500-.1Z" fillRule="evenodd" />,
  x: <path d="M17.800 3h3.100l-6.800 7.700L22 21h-6.200l-4.900-6.300L5.300 21H2.200l7.300-8.300L2 3h6.400l4.400 5.800L17.800 3Zm-1.100 16.200h1.700L7.300 4.700H5.500l11.200 14.500Z" />,
} as const

function SocialIcon({ name, href }: { name: keyof typeof SocialSvg; href: string | null }) {
  const svg = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{SocialSvg[name]}</svg>
  const cls = 'text-gray-400 transition-colors dark:text-gray-400'
  return href
    ? <a href={href} className={`${cls} hover:text-white`} rel="noopener noreferrer" target="_blank" aria-label={name} data-social={name}>{svg}</a>
    : <span className={cls} aria-hidden="true" data-social={name}>{svg}</span>
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
        className="relative mx-auto flex min-h-[112px] max-w-6xl items-center overflow-visible rounded-2xl border border-white/10 px-6 py-5 sm:px-10"
        style={{ background: 'linear-gradient(95deg, #0e2756 0%, #123a7a 60%, #1a438f 100%)' }}
        data-footer-banner
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-bold leading-tight text-white sm:text-[26px]">{t('footer.bannerTitle')}</h2>
          <p className="mt-1 text-[15px] text-blue-100/85">{t('footer.bannerBody')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <StoreBadge store="google" href={androidLive ? GOOGLE_PLAY_URL : null} label={t('footer.badgeGetOn')} soon={t('footer.badgeSoon')} />
            <StoreBadge store="apple" href={iosLive ? APP_STORE_URL : null} label={t('footer.badgeDownloadOn')} soon={t('footer.badgeSoon')} />
          </div>
        </div>
        <div className="pointer-events-none relative ml-6 hidden h-[130px] w-[330px] shrink-0 self-end sm:block md:w-[390px]" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative phone screens from /public */}
          <img src="/landing/screen-chat.webp" alt="" className="absolute -top-8 left-2 h-[215px] w-[108px] -rotate-[7deg] rounded-[22px] border-[5px] border-black object-cover object-top shadow-2xl md:left-8" />
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed decorative phone screens from /public */}
          <img src="/landing/screen-home.webp" alt="" className="absolute -top-14 right-2 h-[235px] w-[118px] rotate-[7deg] rounded-[22px] border-[5px] border-black object-cover object-top shadow-2xl md:right-8" />
        </div>
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
            <SocialIcon name="youtube" href={SOCIAL_LINKS.youtube} />
            <SocialIcon name="tiktok" href={SOCIAL_LINKS.tiktok} />
            <SocialIcon name="facebook" href={SOCIAL_LINKS.facebook} />
            <SocialIcon name="instagram" href={SOCIAL_LINKS.instagram} />
            <SocialIcon name="x" href={SOCIAL_LINKS.x} />
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
