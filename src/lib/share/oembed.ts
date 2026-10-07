// ─────────────────────────────────────────────────────────────────────────────
// oEmbed provider for public results — `GET /api/oembed?url=https://www.tappyai.com/r/<slug>`.
//
// oEmbed (oembed.com) is how WordPress, Ghost, Discourse, Notion, Medium,
// Slack-style unfurlers and many CMSs turn a pasted link into a rich card:
// they read `<link rel="alternate" type="application/json+oembed">` on the
// page (discovery, which the spec "strongly encourages" over its registry),
// call the endpoint, and render the returned HTML. Every reader of that
// third-party page then meets a TappyAI answer — with the link back.
//
// Cost and privacy: the endpoint reads the SAME frozen public row the page
// renders (one indexed read, cacheable), builds deterministic HTML from the
// sanitized payload, calls no model, and answers only for `/r/<slug>` URLs on
// this host. Nothing else on the site is embeddable through it.
// ─────────────────────────────────────────────────────────────────────────────

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import { isValidSlug } from '@/lib/share/slug'
import type { PublicSharedResult } from '@/lib/share/sharedResult'
import { sharedResultOgImageUrl, sharedResultPath, summarize } from '@/lib/share/sharedResultMetadata'

export const OEMBED_PATH = '/api/oembed'
export const OEMBED_MAX_WIDTH = 600
export const OEMBED_DEFAULT_HEIGHT = 240

/** The discovery URL a public page advertises for itself. Pure. */
export function oembedDiscoveryUrl(slug: string, env: NodeJS.ProcessEnv = process.env): string {
  const target = absoluteUrl(sharedResultPath(slug), env)
  return `${absoluteUrl(OEMBED_PATH, env)}?url=${encodeURIComponent(target)}&format=json`
}

/** The slug a consumer asked about, or null when the URL is not one of our public result pages. Pure. */
export function oembedTargetSlug(raw: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const origin = new URL(absoluteUrl('/', env)).origin
  if (u.origin !== origin) return null
  const m = u.pathname.match(/^\/r\/([^/]+)\/?$/)
  if (!m || !isValidSlug(m[1])) return null
  return m[1]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface OembedResponse {
  version: '1.0'
  type: 'rich'
  provider_name: string
  provider_url: string
  title: string
  author_name: string
  author_url: string
  thumbnail_url: string
  thumbnail_width: number
  thumbnail_height: number
  width: number
  height: number
  html: string
  cache_age: number
}

/** The oEmbed document for a public result. Pure; deterministic for a row. */
export function buildOembed(row: PublicSharedResult, opts: { maxwidth?: number } = {}, env: NodeJS.ProcessEnv = process.env): OembedResponse {
  const url = absoluteUrl(sharedResultPath(row.slug), env)
  const width = Math.min(Math.max(Math.round(opts.maxwidth ?? OEMBED_MAX_WIDTH), 200), OEMBED_MAX_WIDTH)
  const title = row.payload.title
  const summary = summarize(row.payload.body, 200) || row.payload.query
  const image = sharedResultOgImageUrl(row, env)
  // A plain, script-free card: a link, the question and a summary. Consumers
  // that sanitize embeds keep exactly this; nothing here needs JavaScript.
  const html =
    `<blockquote class="tappyai-embed" style="max-width:${width}px;margin:0;padding:16px;border:1px solid #e5e7eb;border-radius:16px;font-family:system-ui,sans-serif">` +
    `<a href="${esc(url)}" rel="noopener" style="font-weight:600;text-decoration:none;color:#111827">${esc(title)}</a>` +
    `<p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#374151">${esc(summary)}</p>` +
    `<p style="margin:8px 0 0;font-size:12px;color:#6b7280">${esc(BRAND.name)} · <a href="${esc(url)}" rel="noopener" style="color:#6b7280">${esc(url.replace(/^https?:\/\//, ''))}</a></p>` +
    `</blockquote>`
  return {
    version: '1.0',
    type: 'rich',
    provider_name: BRAND.name,
    provider_url: absoluteUrl('/', env),
    title,
    author_name: BRAND.name,
    author_url: absoluteUrl('/', env),
    thumbnail_url: image,
    thumbnail_width: 1200,
    thumbnail_height: 630,
    width,
    height: OEMBED_DEFAULT_HEIGHT,
    html,
    cache_age: 86400,
  }
}
