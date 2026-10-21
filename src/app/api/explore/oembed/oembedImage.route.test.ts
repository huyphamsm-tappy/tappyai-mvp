import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

// ── Gate 2 N1/N2, D-N4 (item N3): the review page's link preview returns only a safe https image ──
//
// The oembed endpoint returned TikTok's `thumbnail_url` and Facebook's og:image as given, and the
// review composer drew them (`reviews/new/page.tsx`). Submitting already checks the URL; the preview
// did not. Each thumbnail is now returned only when `isSafeHttpsUrl` admits it, otherwise `null`.
// Registered in gate2/n12/N12-DECISIONS.json (D-N4). fetch is stubbed — no network.

const BAD = ['http://cdn.example/a.jpg', 'data:image/png;base64,iVBORw0KGgo', 'https://127.0.0.1/a.jpg', 'https://u:p@cdn.example/a.jpg']
const GOOD = 'https://p16-sign.tiktokcdn.com/a.jpg'

afterEach(() => { vi.unstubAllGlobals() })

async function preview(link: string, thumb: string): Promise<unknown> {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.startsWith('https://www.tiktok.com/oembed')) return new Response(JSON.stringify({ thumbnail_url: thumb, title: 't', author_name: 'a' }), { status: 200 })
    if (url.startsWith('https://www.facebook.com/')) return new Response(`<html><head><meta property="og:image" content="${thumb}"><meta property="og:title" content="t"></head>`, { status: 200, headers: { 'content-type': 'text/html' } })
    throw new Error(`unexpected fetch ${url}`)
  }))
  const res = await GET(new NextRequest(`http://localhost/api/explore/oembed?url=${encodeURIComponent(link)}`))
  return (await res.json() as { thumbnail_url: unknown }).thumbnail_url
}

describe('D-N4 — oembed preview thumbnail', () => {
  for (const bad of BAD) {
    it(`TikTok thumbnail ${bad.slice(0, 30)} → null`, async () => expect(await preview('https://www.tiktok.com/@a/video/1', bad)).toBeNull())
    it(`Facebook og:image ${bad.slice(0, 30)} → null`, async () => expect(await preview('https://www.facebook.com/somepage/posts/1', bad)).toBeNull())
  }
  it('control: a safe https thumbnail is returned (TikTok and Facebook)', async () => {
    expect(await preview('https://www.tiktok.com/@a/video/1', GOOD)).toBe(GOOD)
    expect(await preview('https://www.facebook.com/somepage/posts/1', GOOD)).toBe(GOOD)
  })
})
