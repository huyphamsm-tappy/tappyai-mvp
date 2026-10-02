import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomFeedXml, openSearchXml, FEED_MAX } from './browserFeeds'
import { organizationSameAs, organizationJsonLd } from './siteJsonLd'
import { GET as getOpenSearch } from '@/app/opensearch.xml/route'
import { GET as getFeed } from '@/app/feed.xml/route'
import type { PublicSharedResultSummary } from '@/lib/share/sharedResult'

vi.mock('@/lib/share/sharedResultStore', () => ({
  listPublicSharedResults: vi.fn(async () => [
    { slug: 'AbCdEfGh12', title: 'Bún bò <ngon> & rẻ', query: 'q1', domain: 'food', locale: 'vi', created_at: '2026-09-18T01:00:00.000Z', image: null },
  ]),
}))

const ENV = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv

describe('OpenSearch description — the address-bar engine', () => {
  it('points at /chat with the browser_search attribution and is well-formed', () => {
    const xml = openSearchXml(ENV)
    expect(xml).toContain('template="https://www.tappyai.com/chat?q={searchTerms}&amp;src=browser_search"')
    expect(xml).toContain('<ShortName>TappyAI</ShortName>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })
  it('is discoverable from the root layout and served with the OpenSearch MIME type', () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(layout).toMatch(/<link rel="search" type="application\/opensearchdescription\+xml"[^>]*href="\/opensearch\.xml"/)
    expect(layout).toMatch(/<link rel="alternate" type="application\/atom\+xml"[^>]*href="\/feed\.xml"/)
    const res = getOpenSearch()
    expect(res.headers.get('content-type')).toContain('application/opensearchdescription+xml')
  })
})

describe('Atom feed — newest listed public results', () => {
  const rows: PublicSharedResultSummary[] = [
    { slug: 'AbCdEfGh12', title: 'Bún bò <ngon> & rẻ', query: 'q1', domain: 'food', locale: 'vi', created_at: '2026-09-18T01:00:00.000Z', image: null },
    { slug: 'ZzZzZzZzZ2', title: 'T2', query: 'q2', domain: 'travel', locale: 'en', created_at: '2026-09-17T01:00:00.000Z', image: null },
  ]
  it('escapes XML, links each entry to its public page, caps at FEED_MAX', () => {
    const xml = atomFeedXml(rows, ENV)
    expect(xml).toContain('<title>Bún bò &lt;ngon&gt; &amp; rẻ</title>')
    expect(xml).toContain('href="https://www.tappyai.com/r/AbCdEfGh12"')
    expect(xml).toContain('<updated>2026-09-18T01:00:00.000Z</updated>')
    expect((xml.match(/<entry>/g) ?? []).length).toBe(2)
    const many = Array.from({ length: FEED_MAX + 10 }, (_, i) => ({ ...rows[0], slug: `S${i}` }))
    expect((atomFeedXml(many, ENV).match(/<entry>/g) ?? []).length).toBe(FEED_MAX)
  })
  it('an empty feed is still a valid feed (fresh deployment)', () => {
    const xml = atomFeedXml([], ENV, new Date('2026-09-18T00:00:00Z'))
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
    expect(xml).not.toContain('<entry>')
  })
  it('the route serves atom+xml from the listing query (listed results only, by the store contract)', async () => {
    const res = await getFeed()
    expect(res.headers.get('content-type')).toContain('application/atom+xml')
    expect(await res.text()).toContain('/r/AbCdEfGh12')
  })
})

describe('Organization sameAs — owner-supplied official profiles only', () => {
  it('is absent by default and accepts only https URLs from the env list', () => {
    expect(organizationJsonLd(ENV).sameAs).toBeUndefined()
    const env = { ...ENV, ORGANIZATION_SAME_AS: ' https://www.facebook.com/tappyai , http://insecure.example/x, notaurl, https://www.tiktok.com/@tappyai ' } as NodeJS.ProcessEnv
    expect(organizationSameAs(env)).toEqual(['https://www.facebook.com/tappyai', 'https://www.tiktok.com/@tappyai'])
    expect(organizationJsonLd(env).sameAs).toEqual(['https://www.facebook.com/tappyai', 'https://www.tiktok.com/@tappyai'])
  })
})
