// Metadata for a public shared result — the crawler-facing half of /r/<slug>.
//
// Extends `openGraph.ts` (one place that decides what a crawler sees) rather
// than re-deciding it: absolute https URLs, the branded fallback, canonical
// path with no query string. The OG image is the per-share card, versioned by
// `og_version` in the query (`?v=`) so a redesign or a withdrawal can bust
// the platforms' caches without changing the canonical page URL.

import type { Metadata } from 'next'
import { BRAND, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, absoluteUrl } from './openGraph'
import type { PublicSharedResult } from './sharedResult'

export function sharedResultPath(slug: string): string {
  return `/r/${slug}`
}

/** The versioned OG image URL. Absolute — platforms need a fetchable URL, not a path. */
export function sharedResultOgImageUrl(row: Pick<PublicSharedResult, 'slug' | 'og_version'>, env: NodeJS.ProcessEnv = process.env): string {
  // absoluteUrl drops query strings by design (share links carry none); the
  // version is appended after, on purpose — it is a cache key, not a share link.
  return `${absoluteUrl(`${sharedResultPath(row.slug)}/og.png`, env)}?v=${row.og_version}`
}

/** A description of at most `max` characters from the body prose, on a word boundary. */
export function summarize(body: string, max = 160): string {
  const flat = body.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`
}

export function buildSharedResultMetadata(row: PublicSharedResult, env: NodeJS.ProcessEnv = process.env): Metadata {
  const { payload } = row
  const title = `${payload.title} — ${BRAND.name}`
  const description = summarize(payload.body) || payload.query
  const url = absoluteUrl(sharedResultPath(row.slug), env)
  const image = { url: sharedResultOgImageUrl(row, env), width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: payload.title }
  // An anonymous-owned (second-generation) share is public to open but never
  // indexed or listed: an anonymous session must not be able to mint search
  // surface. It becomes indexable only once its owner is a real account.
  const listed = row.owner_is_anonymous !== true
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: listed ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'article',
      siteName: BRAND.name,
      url,
      locale: payload.locale === 'en' ? 'en_US' : 'vi_VN',
      title,
      description,
      images: [image],
      publishedTime: row.created_at,
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

/** schema.org QAPage — the question and the accepted answer, from the frozen payload. */
export function sharedResultJsonLd(row: PublicSharedResult, env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const { payload } = row
  const url = absoluteUrl(sharedResultPath(row.slug), env)
  return {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    inLanguage: payload.locale,
    url,
    mainEntity: {
      '@type': 'Question',
      name: payload.title,
      text: payload.query,
      dateCreated: row.created_at,
      answerCount: 1,
      author: { '@type': 'Organization', name: BRAND.name },
      acceptedAnswer: {
        '@type': 'Answer',
        text: summarize(payload.body, 1000),
        dateCreated: row.created_at,
        url,
        author: { '@type': 'Organization', name: BRAND.name, url: absoluteUrl('/', env) },
      },
    },
    ...(payload.images.length ? { image: payload.images } : {}),
  }
}
