// ─────────────────────────────────────────────────────────────────────────────
// Two free browser/aggregator surfaces, both pure text built from data the
// site already publishes:
//
//   · /opensearch.xml — an OpenSearch description. Firefox, Edge and Safari
//     register a site's search engine when they meet the <link rel="search">
//     (MDN: "When the user first visits the site, the browser detects this
//     description file and registers the search engine"); Chrome registers it
//     inactive until the person enables it. Result: "tappyai.com ⇥ <question>"
//     in the address bar asks Tappy. A RETENTION surface (you must have
//     visited once), attributed `browser_search`.
//
//   · /feed.xml — an Atom feed of the newest LISTED public results. Feed
//     readers, aggregators and some crawlers poll feeds; a public result is
//     already public, sanitized and indexable, so listing it in a feed adds
//     no exposure it does not already have. Anonymous-owned (noindex) shares
//     are excluded by the store's listing query.
//
// No model, no user data, cost is bytes.
// ─────────────────────────────────────────────────────────────────────────────

import { BRAND, absoluteUrl } from '@/lib/share/openGraph'
import type { PublicSharedResultSummary } from '@/lib/share/sharedResult'

export const OPENSEARCH_PATH = '/opensearch.xml'
export const FEED_PATH = '/feed.xml'
export const FEED_MAX = 50

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The OpenSearch description document. Pure. */
export function openSearchXml(env: NodeJS.ProcessEnv = process.env): string {
  const template = `${absoluteUrl('/chat', env)}?q={searchTerms}&amp;src=browser_search`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    `  <ShortName>${esc(BRAND.name)}</ShortName>`,
    `  <Description>${esc(BRAND.tagline.en)}</Description>`,
    '  <InputEncoding>UTF-8</InputEncoding>',
    `  <Image width="16" height="16" type="image/png">${esc(absoluteUrl('/branding/otter-logo.png', env))}</Image>`,
    `  <Url type="text/html" method="get" template="${template}"/>`,
    `  <moz:SearchForm xmlns:moz="http://www.mozilla.org/2006/browser/search/">${esc(absoluteUrl('/chat', env))}</moz:SearchForm>`,
    '</OpenSearchDescription>',
    '',
  ].join('\n')
}

/** The Atom feed for a list of listed public results. Pure. */
export function atomFeedXml(results: readonly PublicSharedResultSummary[], env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): string {
  const self = absoluteUrl(FEED_PATH, env)
  const home = absoluteUrl('/', env)
  const updated = results[0]?.created_at ?? now.toISOString()
  const entries = results.slice(0, FEED_MAX).map((r) => {
    const url = absoluteUrl(`/r/${r.slug}`, env)
    return [
      '  <entry>',
      `    <id>${esc(url)}</id>`,
      `    <title>${esc(r.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${esc(url)}"/>`,
      `    <updated>${esc(r.created_at)}</updated>`,
      `    <published>${esc(r.created_at)}</published>`,
      `    <category term="${esc(r.domain)}"/>`,
      `    <summary>${esc(r.query)}</summary>`,
      '  </entry>',
    ].join('\n')
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${esc(self)}</id>`,
    `  <title>${esc(BRAND.name)}</title>`,
    `  <subtitle>${esc(BRAND.tagline.en)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${esc(self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${esc(home)}"/>`,
    `  <updated>${esc(updated)}</updated>`,
    `  <author><name>${esc(BRAND.name)}</name><uri>${esc(home)}</uri></author>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n')
}
