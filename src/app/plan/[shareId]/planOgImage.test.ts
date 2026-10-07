// @vitest-environment node
// The social image for /plan/<shareId>: composed from the plan, never generic.
//
// 🚨 WHAT THIS PROVES AND WHAT IT CANNOT. @vercel/og's rasteriser resolves its
// bundled font with `join(import.meta.url, …)`, which is not loadable under
// vitest on Windows, so `ImageResponse` is replaced by a capture here. These
// tests pin the CONTENT handed to it — hero photo, eyebrow, title, counts,
// branding, the Vietnamese-capable font — and the route's declared size and
// type. That the bytes are a real 1200×630 PNG is verified against the running
// server in the browser UAT, not here.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { toPlanShareSnapshot } from '@/lib/plans/share/planShare'

const h = vi.hoisted(() => ({
  row: null as { id: string; plan: unknown; created_at: string } | null,
  rpcCalls: 0,
  captured: [] as Array<{ element: unknown; options: Record<string, unknown> }>,
  font: new ArrayBuffer(8) as ArrayBuffer | null,
  mark: 'data:image/png;base64,AAAA' as string | null,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ rpc: () => { h.rpcCalls++; return Promise.resolve({ data: h.row ? [h.row] : [], error: null }) } }),
}))
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown, options: Record<string, unknown>) {
      super('png-bytes', { headers: { 'content-type': 'image/png' } })
      h.captured.push({ element, options })
    }
  },
}))
vi.mock('./ogFont', () => ({ ogFont: () => Promise.resolve(h.font), OG_FONT_FAMILY: 'Be Vietnam Pro' }))
// The shipped mark, fetched once per instance from the canonical origin (see ogMark.ts) — mocked here.
vi.mock('./ogMark', () => ({ ogMark: () => Promise.resolve(h.mark) }))

import OgImage, { size, contentType, runtime } from './opengraph-image'
import * as twitter from './twitter-image'
import { planOgCard, planOgContent } from './planOgCard'

const ID = 'AbCdEfGhIjK1'
const PHOTO = 'https://lh3.googleusercontent.com/p/AF1QipM-a=s1360'

beforeEach(() => { h.row = null; h.rpcCalls = 0; h.captured = []; h.font = new ArrayBuffer(8); h.mark = 'data:image/png;base64,AAAA' })

const published = () => {
  const snap = toPlanShareSnapshot({ type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, days: [
    { label: 'Ngày 1', items: [{ time: '09:00', emoji: '', category: '', name: 'Bãi Kỳ Co', photo_url: PHOTO }, { time: '12:30', emoji: '', category: '', name: 'Hải sản Nhơn Lý' }] },
  ] })!
  h.row = { id: ID, plan: snap, created_at: '' }
}

describe('planOgContent', () => {
  it('is the plan’s own title, counts and hero — one RPC', async () => {
    published()
    expect(await planOgContent(ID)).toEqual({ eyebrow: 'Tappy Plan', title: 'Quy Nhơn 3 ngày 2 đêm', line: '1 ngày  ·  2 điểm dừng  ·  2 người', photo: PHOTO })
    expect(h.rpcCalls).toBe(1)
  })

  it('a withdrawn link is the brand alone, with no photo', async () => {
    expect(await planOgContent('NoSuchPlan00')).toEqual({ eyebrow: 'Tappy Plan', title: 'TappyAI', line: 'Một chuyến đi, theo cách của bạn.', photo: null })
  })

  it('🚨 IMAGE RULE: a stored clip/review thumbnail is not the social image — photo is null, the card is text', async () => {
    const clipThumb = 'https://storage.googleapis.com/tappyai-media-prod/thumbnails/f9077a52/clip.jpg'
    h.row = { id: ID, plan: { v: 1, title: 'Quy Nhơn 3 ngày 2 đêm', days: [{ label: 'Ngày 1', items: [{ name: 'Bãi Kỳ Co', photo_url: clipThumb }] }] }, created_at: '' }
    const c = await planOgContent(ID)
    expect(c.photo).toBeNull()
    expect(c.title).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(renderToStaticMarkup(planOgCard(c, 'Be Vietnam Pro'))).not.toContain('<img')
  })
})

describe('the composition handed to the rasteriser', () => {
  it('draws the hero photo full-bleed under the shade, then eyebrow, title, line and the TAPPY mark', () => {
    const html = renderToStaticMarkup(planOgCard({ eyebrow: 'Tappy Plan', title: 'Quy Nhơn 3 ngày 2 đêm', line: '2 ngày  ·  4 điểm dừng', photo: PHOTO }, 'Be Vietnam Pro'))
    expect(html).toMatch(new RegExp(`<img src="${PHOTO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*width="1200" height="630"`))
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('Tappy Plan')) // photo is behind the copy
    expect(html).toMatch(/Tappy Plan[\s\S]*Quy Nhơn 3 ngày 2 đêm[\s\S]*2 ngày  ·  4 điểm dừng/)
    // 🚨 BRANDING: "Tappy" white + "AI" blue, and the shipped mark when it was loaded — never "TAPPY".
    expect(html).not.toContain('TAPPY')
    expect(html).toMatch(/<span style="color:#FFFFFF">Tappy<\/span><span style="color:#3391FF">AI<\/span>/)
    const withMark = renderToStaticMarkup(planOgCard({ eyebrow: 'Tappy Plan', title: 'Quy Nhơn 3 ngày 2 đêm', line: '', photo: PHOTO }, 'Be Vietnam Pro', 'data:image/png;base64,AAAA'))
    expect(withMark).toMatch(/<img src="data:image\/png;base64,AAAA"[^>]*style="[^"]*border-radius:11px;object-fit:cover/)
    expect(withMark.indexOf('data:image/png;base64,AAAA')).toBeLessThan(withMark.indexOf('>Tappy<'))
    expect(html).toContain('font-family:Be Vietnam Pro')
    expect(html).not.toContain('tappyai-v2.png')
  })

  it('no photo → the dark brand gradient, no <img> at all; a long title is clipped, never wrapped off-card', () => {
    const html = renderToStaticMarkup(planOgCard({ eyebrow: 'Tappy Plan', title: 'T'.repeat(90), line: '', photo: null }))
    expect(html).not.toContain('<img')
    expect(html).toContain('linear-gradient(135deg, #070A12')
    expect(html).toContain(`${'T'.repeat(68)}…`)
    expect(html).toContain('font-size:60px')
  })
})

describe('opengraph-image route', () => {
  it('declares 1200×630 PNG on the EDGE runtime (the node build cannot locate its font on Windows), and the X card is the same module', () => {
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(contentType).toBe('image/png')
    expect(runtime).toBe('edge')
    expect(twitter.default).toBe(OgImage)
    expect(twitter.runtime).toBe('edge')
    expect(twitter.size).toEqual(size)
    expect(twitter.contentType).toBe(contentType)
  })

  it('renders the plan card in the Vietnamese-capable font when it loaded', async () => {
    published()
    const res = await OgImage({ params: { shareId: ID } })
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(h.captured).toHaveLength(1)
    const { element, options } = h.captured[0]
    const html = renderToStaticMarkup(element as never)
    expect(html).toContain(PHOTO)
    expect(html).toContain('<img src="data:image/png;base64,AAAA"')
    expect(html).toContain('Quy Nhơn 3 ngày 2 đêm')
    expect(html).toContain('font-family:Be Vietnam Pro')
    expect(options).toMatchObject({ width: 1200, height: 630 })
    expect((options.fonts as Array<{ name: string; weight: number }>)[0]).toMatchObject({ name: 'Be Vietnam Pro', weight: 700 })
    expect(h.rpcCalls).toBe(1)
  })

  it('still renders — bundled font, no `fonts` option — when the font fetch failed, and the brand card for a missing plan', async () => {
    h.font = null
    await OgImage({ params: { shareId: 'NoSuchPlan00' } })
    const { element, options } = h.captured[0]
    const html = renderToStaticMarkup(element as never)
    expect(html).toContain('TappyAI')
    // No photo — but the brand mark still draws (it is the lockup, not a plan image).
    expect(html).not.toMatch(/<img src="https?:/)
    expect(html).toContain('<img src="data:image/png;base64,AAAA"')
    expect(html).toContain('font-family:sans-serif')
    expect(options.fonts).toBeUndefined()
  })

  it('renders the lockup as the wordmark alone when the mark could not be fetched — the preview never fails for a logo', async () => {
    h.mark = null
    published()
    await OgImage({ params: { shareId: ID } })
    const html = renderToStaticMarkup(h.captured[0].element as never)
    expect(html).not.toContain('data:image/png')
    expect(html).toMatch(/<span style="color:#FFFFFF">Tappy<\/span><span style="color:#3391FF">AI<\/span>/)
  })
})
