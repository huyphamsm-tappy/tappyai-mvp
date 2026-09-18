import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { buildOembed, oembedDiscoveryUrl, oembedTargetSlug, OEMBED_MAX_WIDTH } from './oembed'
import { buildSharedResultMetadata } from './sharedResultMetadata'
import type { PublicSharedResult } from './sharedResult'
import { GET } from '@/app/api/oembed/route'

const ENV = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv

const row: PublicSharedResult = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'food', locale: 'vi', og_version: 2, view_count: 0, ask_count: 0,
  created_at: '2026-09-18T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: { v: 1, title: 'Bún bò <ngon> quận 1', query: 'quán bún bò ngon quận 1', domain: 'food', locale: 'vi', body: 'Chọn **Bún bò Huế 24** — mở tối, 60k/tô.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-09-18T00:00:00.000Z' },
}

vi.mock('@/lib/share/sharedResultStore', () => ({
  getPublicSharedResult: vi.fn(async (slug: string) => (slug === 'AbCdEfGh12' ? row : null)),
}))

describe('oEmbed — target parsing answers only for our public result pages', () => {
  it('accepts /r/<slug> on this origin and nothing else', () => {
    expect(oembedTargetSlug('https://www.tappyai.com/r/AbCdEfGh12', ENV)).toBe('AbCdEfGh12')
    expect(oembedTargetSlug('https://www.tappyai.com/r/AbCdEfGh12/', ENV)).toBe('AbCdEfGh12')
    for (const bad of ['https://evil.example/r/AbCdEfGh12', 'http://www.tappyai.com/r/AbCdEfGh12', 'https://www.tappyai.com/food', 'https://www.tappyai.com/r/', 'https://www.tappyai.com/r/../admin', 'https://www.tappyai.com/chat?q=x', 'not a url', '', null, undefined]) {
      expect(oembedTargetSlug(bad as string, ENV), String(bad)).toBeNull()
    }
  })
})

describe('oEmbed — document', () => {
  it('is a rich, script-free card with the link back, escaped text, thumbnail and bounded width', () => {
    const doc = buildOembed(row, {}, ENV)
    expect(doc.version).toBe('1.0')
    expect(doc.type).toBe('rich')
    expect(doc.provider_url).toBe('https://www.tappyai.com/')
    expect(doc.title).toBe('Bún bò <ngon> quận 1')
    expect(doc.html).toContain('href="https://www.tappyai.com/r/AbCdEfGh12"')
    expect(doc.html).toContain('Bún bò &lt;ngon&gt; quận 1')
    expect(doc.html).not.toMatch(/<script|onerror|onload|javascript:/i)
    expect(doc.html).not.toContain('**') // markdown flattened by summarize()
    expect(doc.thumbnail_url).toBe('https://www.tappyai.com/r/AbCdEfGh12/og.png?v=2')
    expect(doc.width).toBe(OEMBED_MAX_WIDTH)
    expect(buildOembed(row, { maxwidth: 300 }, ENV).width).toBe(300)
    expect(buildOembed(row, { maxwidth: 5000 }, ENV).width).toBe(OEMBED_MAX_WIDTH)
    expect(buildOembed(row, { maxwidth: 10 }, ENV).width).toBe(200)
    expect(JSON.stringify(doc)).not.toMatch(/user_id|anon|session|token/)
  })
  it('is discoverable from the public page metadata, and the page carries the Discover directive', () => {
    const meta = buildSharedResultMetadata(row, ENV)
    expect(meta.alternates?.types).toEqual({ 'application/json+oembed': 'https://www.tappyai.com/api/oembed?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FAbCdEfGh12&format=json' })
    expect(oembedDiscoveryUrl('AbCdEfGh12', ENV)).toBe('https://www.tappyai.com/api/oembed?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FAbCdEfGh12&format=json')
    expect(meta.robots).toEqual({ index: true, follow: true, 'max-image-preview': 'large' })
    const unlisted = buildSharedResultMetadata({ ...row, owner_is_anonymous: true }, ENV)
    expect(unlisted.robots).toEqual({ index: false, follow: true })
  })
})

describe('oEmbed — route', () => {
  const req = (qs: string) => new NextRequest(`https://www.tappyai.com/api/oembed${qs}`, { headers: { 'x-forwarded-for': '203.0.113.9' } })
  it('serves the document with the oEmbed MIME type, cache headers and CORS', async () => {
    const res = await GET(req('?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FAbCdEfGh12&format=json&maxwidth=400'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json+oembed')
    expect(res.headers.get('cache-control')).toContain('s-maxage')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const body = await res.json()
    expect(body.type).toBe('rich')
    expect(body.width).toBe(400)
  })
  it('404s for foreign URLs and unknown slugs, 501 for xml', async () => {
    expect((await GET(req('?url=https%3A%2F%2Fevil.example%2Fr%2FAbCdEfGh12'))).status).toBe(404)
    expect((await GET(req('?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FZzZzZzZzZ2'))).status).toBe(404)
    expect((await GET(req('?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FAbCdEfGh12&format=xml'))).status).toBe(501)
    expect((await GET(req(''))).status).toBe(404)
  })
})
