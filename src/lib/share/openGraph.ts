// Social preview metadata — one place that decides what a crawler sees.
//
// Crawlers do not run JavaScript. Everything a Zalo, Facebook or Messenger
// preview shows has to be present in the server-rendered HTML, which means it
// has to be decidable here, from data alone.
//
// Two live defects this exists to close:
//
//  1. The root layout declared og:type/title/description and nothing else — no
//     image, no url, no site_name, no twitter card — so a pasted link rendered
//     as bare text with no branding.
//
//  2. /reviews/[id] built og:image from `review.photos[0]`. Those are Vercel
//     Blob URLs, the store is suspended, and they 403; and a review with no
//     photo produced an empty array. Either way the preview was broken.
//
// The rule both share: an OG image must be a public, absolute HTTPS URL a
// crawler can fetch with no credentials, and there must always be a branded
// fallback rather than nothing.

import type { Metadata } from 'next'
import { mediaProviderOf } from '@/lib/media/servableMedia'

export const BRAND = {
  name: 'TappyAI',
  tagline: {
    vi: 'Chạm đến mọi dịch vụ – AI Agent cá nhân hóa',
    en: 'Touch Every Service – Your Personal AI Agent',
  },
  title: {
    vi: 'TappyAI – Trợ lý AI thuần Việt',
    en: 'TappyAI – Your Personal AI Agent',
  },
} as const

export type ShareLocale = 'vi' | 'en'

/**
 * The generic branded preview image.
 *
 * A stable path on purpose: social platforms cache OG images per URL, so a
 * per-request query string would defeat their cache and still not guarantee a
 * refresh. To publish a new design, bump the version segment — that is the
 * documented way to make a platform re-fetch.
 */
export const OG_IMAGE_PATH = '/og/tappyai-v2.png'
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

const FALLBACK_SITE_URL = 'https://www.tappyai.com'

/** The canonical public origin, without a trailing slash. */
function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL).trim()
  return raw.replace(/\/+$/, '')
}

/**
 * Absolute, canonical, https URL for a path.
 *
 * Any query string is dropped: a shared link must never carry a token or
 * session parameter, and OG URLs are canonical identifiers rather than
 * per-visitor links.
 */
export function absoluteUrl(pathOrUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const [path] = pathOrUrl.split('?')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteOrigin(env)}${normalized}`
}

export interface OgImage {
  url: string
  width: number
  height: number
  alt: string
}

/** The branded 1200×630 image every page can fall back to. */
export function brandedOgImage(env: NodeJS.ProcessEnv = process.env): OgImage {
  return {
    url: absoluteUrl(OG_IMAGE_PATH, env),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt: BRAND.name,
  }
}

/**
 * A content image if it is genuinely fetchable by a crawler, else the brand.
 *
 * Reuses the media host classifier rather than inventing a second rule, so a
 * Vercel Blob URL — the exact thing that made review previews break — can never
 * be published as an OG image. `blob:`, `data:`, relative paths and plain http
 * all fall back too: a crawler cannot resolve any of them.
 */
export function safeOgImageUrl(
  candidate: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fallback = brandedOgImage(env).url
  if (typeof candidate !== 'string' || candidate.length === 0) return fallback
  if (!candidate.startsWith('https://')) return fallback

  const provider = mediaProviderOf(candidate)
  // 'none' covers anything that is not an absolute http(s) URL; 'vercel-blob'
  // is reachable-looking but suspended.
  if (provider === 'none' || provider === 'vercel-blob') return fallback

  return candidate
}

function ogBase(locale: ShareLocale, path: string, env: NodeJS.ProcessEnv) {
  return {
    type: 'website' as const,
    siteName: BRAND.name,
    url: absoluteUrl(path, env),
    locale: locale === 'vi' ? 'vi_VN' : 'en_US',
    images: [brandedOgImage(env)],
  }
}

/** Site-wide metadata: the preview for any page without something better. */
export function buildSiteMetadata(
  locale: ShareLocale = 'vi',
  env: NodeJS.ProcessEnv = process.env,
  path = '/'
): Metadata {
  const title = BRAND.title[locale]
  const description = BRAND.tagline[locale]

  return {
    metadataBase: new URL(siteOrigin(env)),
    title,
    description,
    openGraph: { ...ogBase(locale, path, env), title, description },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [brandedOgImage(env).url],
    },
  }
}

/**
 * Metadata for a page whose content is private.
 *
 * Takes no content parameter at all. That is the design: a function that cannot
 * be handed a conversation cannot leak one, so "did we remember to sanitise
 * this?" stops being a question anyone has to answer per call site.
 */
export function buildPrivateMetadata(
  locale: ShareLocale = 'vi',
  env: NodeJS.ProcessEnv = process.env
): Metadata {
  const title = BRAND.title[locale]
  const description = BRAND.tagline[locale]

  return {
    title,
    description,
    // Private URLs are not canonical destinations worth indexing.
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: BRAND.name,
      locale: locale === 'vi' ? 'vi_VN' : 'en_US',
      title,
      description,
      images: [brandedOgImage(env)],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [brandedOgImage(env).url],
    },
  }
}

/**
 * The site title for a locale, and the test for whether a title IS the site title.
 *
 * ============================================================================
 * WHY THESE LIVE HERE — R03
 * ============================================================================
 * `document.title` stayed Vietnamese for the whole session no matter what language the user
 * picked. `buildSiteMetadata` is a server function evaluated once at build time with a hardcoded
 * `'vi'`, so the `<title>` in every response is the Vietnamese one — the browser tab, the bookmark
 * name, the entry in the history menu and the label an OS task-switcher shows were all in a
 * language the user had explicitly switched away from.
 *
 * The client half of that fix needs two things: what the title should be for a locale, and
 * whether the title currently in the DOM is one this module produced. Both are questions about
 * BRAND, so both belong next to BRAND rather than in a component — the alternative is a component
 * with its own copy of the brand strings, which is exactly how the two would drift.
 */
export function siteTitle(locale: ShareLocale): string {
  return BRAND.title[locale]
}

/**
 * True only for a title this module produced for SOME locale.
 *
 * 🚨 This is the guard that keeps the client-side retitle from clobbering pages that set their
 * own title. Eleven routes do — `/privacy`, `/terms`, `/reviews/[id]` and the rest — and a review
 * page's title is the review's own subject, which must survive a language switch untouched.
 * Rewriting it to the brand title would be a worse bug than the one being fixed.
 */
export function isSiteTitle(title: string): boolean {
  return (Object.values(BRAND.title) as string[]).includes(title)
}

/**
 * Titles for the STATIC routes that set their own, in both languages.
 *
 * ============================================================================
 * WHY ONLY THESE ROUTES — B05
 * ============================================================================
 * R03 fixed the site title. It deliberately left every route-specific title alone, because
 * `/reviews/[id]` sets the review's own subject and overwriting that would have been a worse bug
 * than the one being fixed. The UAT then found the other half of the problem: the routes that set
 * a FIXED title set it in one language only, and the eight of them do not even agree on which —
 * `/privacy` and `/terms` are English, `/copyright` and `/viet-content` are Vietnamese. So a
 * Vietnamese user reads "Privacy Policy" in their tab and an English user reads
 * "Chính sách bản quyền âm nhạc".
 *
 * 🚨 This map is an ALLOW-LIST, and that is the whole safety property. A route is reconciled only
 * if it appears here, so `/reviews/[id]`, `/chat/[id]` and anything else that computes a title
 * from content is untouched by construction rather than by a heuristic that might misfire.
 *
 * 🚨 It also does NOT touch the server metadata. `generateMetadata` still emits exactly what it
 * emitted before, so og:title, twitter:title and everything a crawler or a share preview reads are
 * unchanged — this only reconciles the visible tab title on the client, where the locale is
 * actually known.
 */
export const ROUTE_TITLES: Record<string, { vi: string; en: string }> = {
  '/access-denied': { en: 'Access denied — TappyAI', vi: 'Không có quyền truy cập — TappyAI' },
  '/copyright': { en: 'Music Copyright Policy — TappyAI', vi: 'Chính sách bản quyền âm nhạc — TappyAI' },
  '/delete-account': { en: 'Delete Your TappyAI Account — TappyAI', vi: 'Xoá tài khoản TappyAI — TappyAI' },
  '/how-to-use': { en: 'How to use TappyAI', vi: 'Hướng dẫn sử dụng TappyAI' },
  '/privacy': { en: 'Privacy Policy — TappyAI', vi: 'Chính sách bảo mật — TappyAI' },
  '/terms': { en: 'Terms of Service — TappyAI', vi: 'Điều khoản dịch vụ — TappyAI' },
  '/viet-content': { en: 'Social media content writer — TappyAI', vi: 'Viết content mạng xã hội — TappyAI' },
  '/game/supertux': { en: 'SuperTux — TappyAI Games', vi: 'SuperTux — Trò chơi TappyAI' },
}

/**
 * The title this pathname should show in `locale`, or null if the route is not ours to retitle.
 *
 * Returns null unless the title currently in the DOM is one of the two this module knows for that
 * route. That second condition matters: it means a route whose title has been changed by anything
 * else — a future dynamic segment, an A/B test, a nested layout — is left alone rather than
 * stamped over.
 */
export function routeTitleFor(pathname: string, locale: ShareLocale, currentTitle: string): string | null {
  const entry = ROUTE_TITLES[pathname]
  if (!entry) return null
  if (currentTitle !== entry.vi && currentTitle !== entry.en) return null
  return entry[locale]
}
