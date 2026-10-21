import { describe, it, expect, vi, beforeEach } from 'vitest'

// Gate 2 G3 layer 2 (G-T8, G-T9) — what /r/<slug>/og.png fetches SERVER SIDE. The loader is mocked to hand over `images` UNFILTERED, so
// this layer is proven on its own (it must hold even if the read-time policy is bypassed). `fetch` is mocked and every call recorded:
// nothing leaves the process. `next/og` is mocked to a recorder, so no image is actually rendered.

const images = { list: [] as string[] }
vi.mock('@/lib/share/sharedResultStore', () => ({
  getPublicSharedResult: async () => ({
    id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0,
    created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
    payload: { v: 1, title: 'Đà Lạt', query: 'q', domain: 'travel', locale: 'vi', body: 'b', buttons: [], images: images.list, suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z' },
  }),
}))
vi.mock('next/og', () => ({ ImageResponse: class { constructor(public element: unknown, public init: unknown) {} } }))

const calls: Array<{ url: string; init: RequestInit | undefined }> = []
const reply = { status: 200 }
beforeEach(() => {
  calls.length = 0
  reply.status = 200
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (reply.status !== 200) return new Response(null, { status: reply.status, headers: { location: 'https://attacker.example/next' } })
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } })
  }))
})

import { GET } from './route'
const run = async (list: string[]) => {
  images.list = list
  const res = await GET(new Request('https://www.tappyai.com/r/AbCdEfGh12/og.png'), { params: { slug: 'AbCdEfGh12' } }) as unknown as { element: unknown }
  return JSON.stringify(res.element)
}

describe('G3 layer 2 · og.png server-side fetch', () => {
  it('G-T8 · hosts outside the allow-list are never fetched, including look-alike hostnames', async () => {
    await run(['https://attacker.example/a.png', 'https://gstatic.com.attacker.example/a.png', 'https://evilgstatic.com/a.png'])
    expect(calls).toEqual([])
    await run(['https://googleusercontent.com.evil.example/a.png', 'https://xgoogleusercontent.com/a.png', 'https://ggpht.com.evil/a.png'])
    expect(calls).toEqual([])
  })
  it('G-T8 · non-https and unsafe forms are never fetched, even on an allowed host', async () => {
    await run(['http://encrypted-tbn0.gstatic.com/a.png', 'https://u:p@lh3.googleusercontent.com/a.png', 'data:image/png;base64,AA=='])
    expect(calls).toEqual([])
  })
  it('G-T8 · an allowed host is fetched, with redirects not followed, and inlined', async () => {
    const el = await run(['https://encrypted-tbn0.gstatic.com/images?q=tbn:x', 'https://lh3.googleusercontent.com/p/x=w400', 'https://lh5.ggpht.com/x'])
    expect(calls.map(c => c.url)).toEqual(['https://encrypted-tbn0.gstatic.com/images?q=tbn:x', 'https://lh3.googleusercontent.com/p/x=w400', 'https://lh5.ggpht.com/x'])
    for (const c of calls) expect(c.init?.redirect).toBe('manual')
    expect(el).toContain('data:image/png;base64,')
  })
  it('G-T9 · a redirect from an allowed host is not followed: the image is left off and the card still renders', async () => {
    reply.status = 302
    const el = await run(['https://encrypted-tbn0.gstatic.com/images?q=tbn:x'])
    expect(calls).toHaveLength(1)
    expect(calls.some(c => c.url.includes('attacker.example'))).toBe(false)
    expect(el).not.toContain('data:image/png;base64,')
    expect(el).toContain('Đà Lạt')
  })
})
