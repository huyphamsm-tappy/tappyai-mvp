// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// ── Gate 2 N1/N2 (I1): images the stream writes, and the plan photos ─────────
//
// R-4: the markdown photo lines `placeContentLines` writes into the prose. R-6: `withResolvedPhotos`,
// which overwrites a card's image with the photos resolved for that place. D-N2: the three places
// that write a plan item's `photo_url` (injectPlanPhotos, guardPlanItems ×2, buildEveningPlanBlock).
// NT-12 is the control: an all-https turn is byte-identical to pk14 (snapshot taken at Step 0).
// NT-* / D-N2 ids are registered in gate2/n12/N12-ADDENDUM.md and N12-DECISIONS.json.

import { applyPlaceEnrichmentStreamFilter, injectPlaceEnrichment } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { readPlacesLiveView } from '@/lib/recommendation/liveView'
import { guardPlanItems } from './planItemGuard'
import { buildEveningPlanBlock, EVENING_STAGES } from './eveningPlan'

let fetchCalls = 0
beforeAll(() => { vi.stubGlobal('fetch', vi.fn(async () => { fetchCalls++; throw new Error('imageUrlStream: network forbidden') })) })
afterAll(() => { vi.unstubAllGlobals() })

const BAD = [
  'http://cdn.example/a.jpg',
  'data:image/png;base64,iVBORw0KGgo',
  'javascript:alert(1)',
  'https://localhost/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://u:p@cdn.example/a.jpg',
]
const GOOD = 'https://cdn.example/a.jpg'

describe('NT-8 — photo lines written into the prose (R-4)', () => {
  for (const bad of BAD) {
    it(`a place whose photo is ${bad.slice(0, 32)} gets no photo line`, () => {
      const out = injectPlaceEnrichment([{ name: 'Phở Thìn', photo_url: bad, photo_urls: [bad] } as never], 'Bạn thử **Phở Thìn** nhé, nước dùng đậm.')
      expect(out).not.toContain(bad)
      expect(out).not.toMatch(/!\[[^\]]*\]\(/)
    })
  }
  it('control: a public https photo is written', () => {
    const out = injectPlaceEnrichment([{ name: 'Phở Thìn', photo_url: GOOD, photo_urls: [GOOD] } as never], 'Bạn thử **Phở Thìn** nhé, nước dùng đậm.')
    expect(out).toContain(`](${GOOD})`)
  })
})

// The settle harness of postUatPlanResearch.test.ts: a place turn whose decision renders a card.
const NAMES = ['Phở Lệ', 'Cơm Tấm Ba Ghiền']
const row = (name: string, i: number, photo?: string) => ({ place_id: `g-${i}`, name, address: `${10 + i} Lê Duẩn, Quận 1`, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${i}`, text_ranked: true, ...(photo ? { photo_url: photo, photo_urls: [photo] } : {}) })
async function settleCard(recPhoto: string | undefined, streamPhoto: string | undefined) {
  const recResult = { source: 'osm', count: NAMES.length, results: NAMES.map((n, i) => row(n, i, recPhoto)), _tappy_place_domain: 'food' }
  const streamResult = { source: 'osm', count: NAMES.length, results: NAMES.map((n, i) => row(n, i, streamPhoto)), _tappy_place_domain: 'food' }
  const c = createEnrichmentCollector()
  c.agentMode = true
  c.semanticRanking = true
  c.add(streamResult.results)
  c.setPlacesRecommendations(placeRecommendations(recResult, 'TP HCM'), producerSubject('search_places', 'food'))
  c.setRendersDecisionCard(rendersDecisionCard('web'))
  const prose = 'Mình chọn **Phở Lệ** — gần và hợp bữa trưa.\n[TAPPY_RANK]{"picks":[{"name":"Phở Lệ","why":"gần"}],"none":false,"confidence":"high"}[/TAPPY_RANK]'
  const frames = [
    `9:${JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: { query: 'phở quận 1' } })}`,
    `a:${JSON.stringify({ toolCallId: 't1', result: streamResult })}`,
    `0:${JSON.stringify(prose)}`,
    'd:{"finishReason":"stop"}',
  ]
  const out = await new Response(applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c).body).text()
  const ann = out.split('\n').filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as unknown[])
  const text = out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { view: readPlacesLiveView(ann), text, raw: out }
}

describe('NT-10 — photos resolved for a card place do not overwrite its image with an unsafe one (R-6)', () => {
  it('the card keeps its own safe image when the resolved photo is unsafe', async () => {
    const { view, raw } = await settleCard(GOOD, 'http://cdn.example/resolved.jpg')
    expect(view?.items.map(i => i.name)).toEqual(['Phở Lệ'])
    expect(view!.items[0].image).toBe(GOOD)
    // The only frame that may still carry it is the `a:` echo of the tool result this test injected (production rows are
    // source-checked, S-1…S-4); nothing the client renders (text `0:`, card `8:`) does.
    const carrying = raw.split('\n').filter(l => l.includes('http://cdn.example/resolved.jpg'))
    for (const l of carrying) expect(l.startsWith('a:')).toBe(true)
  })
  it('control: a safe resolved photo still replaces the card image', async () => {
    const { view } = await settleCard(GOOD, 'https://cdn.example/resolved.jpg')
    expect(view!.items[0].image).toBe('https://cdn.example/resolved.jpg')
  })
})

const planText = (items: Array<Record<string, unknown>>) => '[TAPPY_PLAN]' + JSON.stringify({ type: 'trip', title: 'Hà Nội', days: [{ label: 'Ngày 1', items }] }) + '[/TAPPY_PLAN]'
const planItems = (text: string): Array<Record<string, unknown>> => {
  const m = text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
  return m ? (JSON.parse(m[1]) as { days: Array<{ items: Array<Record<string, unknown>> }> }).days.flatMap(d => d.items) : []
}

describe('D-N2 — plan photos', () => {
  const PLACE = (photo: string) => ({ name: 'Phở Thìn', address: '13 Lò Đúc, Hà Nội', photo_url: photo, photo_urls: [photo] })
  const PLAN = `Lịch nè.\n\n${planText([{ time: '12:00', category: 'food', name: 'Phở Thìn', description: 'Ăn trưa', price: '' }])}`

  it('injectPlanPhotos: an unsafe photo is not written into the plan item; a safe one is', () => {
    for (const bad of BAD) expect(planItems(injectPlaceEnrichment([PLACE(bad) as never], PLAN))[0]?.photo_url).toBeUndefined()
    expect(planItems(injectPlaceEnrichment([PLACE(GOOD) as never], PLAN))[0]?.photo_url).toBe(GOOD)
  })

  it('guardPlanItems (matched stop): an unsafe photo is not written; a safe one is', () => {
    for (const bad of BAD) expect(planItems(guardPlanItems(PLAN, [PLACE(bad)] as never).text)[0]?.photo_url).toBeUndefined()
    expect(planItems(guardPlanItems(PLAN, [PLACE(GOOD)] as never).text)[0]?.photo_url).toBe(GOOD)
  })

  it('guardPlanItems (return-day sight top-up): an unsafe photo is not written; a safe one is', () => {
    const twoDays = (sightPhoto: string) => {
      const plan = '[TAPPY_PLAN]' + JSON.stringify({ type: 'trip', title: 'Hà Nội', days: [
        { label: 'Ngày 1', items: [{ time: '09:00', category: 'attraction', name: 'Hồ Gươm', description: '', price: '' }] },
        // The anchor of the top-up is a kept transport stop (an unmatched hotel stop would be dropped first).
        { label: 'Ngày 2', items: [{ time: '08:00', category: 'food', name: 'Ăn sáng', description: '', price: '' }, { time: '14:00', category: 'transport', name: 'Ra sân bay Nội Bài', description: '', price: '' }] },
      ] }) + '[/TAPPY_PLAN]'
      const sight = { name: 'Bảo tàng Lịch sử Quốc gia', address: '1 Tràng Tiền, Hoàn Kiếm, Hà Nội', place_types: ['Điểm thu hút khách du lịch', 'Bảo tàng'], photo_url: sightPhoto, photo_urls: [sightPhoto] }
      const items = planItems(guardPlanItems(plan, [sight] as never, { keepSights: true }).text)
      return items.find(i => i.name === sight.name)
    }
    const added = twoDays(GOOD)
    // The harness really reaches the top-up branch: the sight is added, with the safe photo.
    expect(added).toBeDefined()
    expect(added!.photo_url).toBe(GOOD)
    for (const bad of BAD) {
      const item = twoDays(bad)
      expect(item).toBeDefined()
      expect(item!.photo_url).toBeUndefined()
    }
  })

  it('buildEveningPlanBlock: an unsafe photo is not written; a safe one is', () => {
    const block = (photo: string) => buildEveningPlanBlock(EVENING_STAGES.map((stage, i) => ({ stage, place: { name: `Điểm ${i}`, address: `${i} Phố Huế, Hà Nội`, photo_url: photo, photo_urls: [photo] } as never })), { lang: 'vi', area: 'Hà Nội' })
    for (const bad of BAD) for (const it of planItems(block(bad))) expect(it.photo_url).toBeUndefined()
    for (const it of planItems(block(GOOD))) expect(it.photo_url).toBe(GOOD)
  })
})

describe('NT-12 — control: an all-https turn is byte-identical to pk14 (snapshot taken at Step 0)', () => {
  it('place card, prose photo lines, plan photos', async () => {
    const card = await settleCard(GOOD, 'https://cdn.example/resolved.jpg')
    const prose = injectPlaceEnrichment([{ name: 'Phở Thìn', photo_url: GOOD, photo_urls: [GOOD, 'https://cdn.example/b.jpg'] } as never], 'Bạn thử **Phở Thìn** nhé, nước dùng đậm.')
    const plan = guardPlanItems(`Lịch nè.\n\n${planText([{ time: '12:00', category: 'food', name: 'Phở Thìn', description: 'Ăn trưa', price: '' }])}`, [{ name: 'Phở Thìn', address: '13 Lò Đúc, Hà Nội', photo_url: GOOD, photo_urls: [GOOD] }] as never).text
    expect({ cardRaw: card.raw, prose, plan }).toMatchSnapshot()
  })
})

describe('offline', () => {
  it('no network call was made', () => expect(fetchCalls).toBe(0))
})
