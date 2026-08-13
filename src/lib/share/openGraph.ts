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
export const OG_IMAGE_PATH = '/og/tappyai-v1.png'
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
