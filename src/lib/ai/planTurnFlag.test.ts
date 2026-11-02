// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { validateDecision } from './agent/runtime/decisionRecord'

// CONSULTATIVE_IN_AGENT — "the plan is the whole answer". Measured live (10/10, Đà Lạt 3 ngày): the plan, as a [TAPPY_PLAN] card OR as plain
// text, was followed by three standalone venue cards (the recorder, one extra model call, "picked" venues named inside the plan). The route
// sets collector.planTurn only under the flag on a trip-plan turn; with it absent every case below behaves as before (control cases).

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const NAMES = ['Quán Lẩu Thông', 'Cơm Niêu Vị Quê', 'Khách sạn Hana', 'Quảng trường Lâm Viên']
const row = (name: string, i: number) => ({ place_id: `g-${i}`, name, address: `${10 + i} Trần Phú, Đà Lạt`, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}` })
const TEXT_PLAN = 'Ngày 1: nhận phòng ở **Khách sạn Hana**, tối ăn **Quán Lẩu Thông**.\nNgày 2: dạo **Quảng trường Lâm Viên**, trưa **Cơm Niêu Vị Quê**.\nGiả định: đi 2 người, ngân sách vừa phải.'
const PLAN_BLOCK = '[TAPPY_PLAN]' + JSON.stringify({ type: 'trip', title: 'Đà Lạt 2 ngày', people: 2, budget_total: '6.000.000 VND', days: [{ label: 'Ngày 1', items: [{ time: '19:00', emoji: '🍲', category: 'food', name: 'Quán Lẩu Thông', note: 'ăn tối' }] }] }) + '[/TAPPY_PLAN]'
const ASK = 'Lên kế hoạch đi Đà Lạt 2 ngày cho 2 người'

const recorder = (picks: string[]) => {
  const calls: number[] = []
  const fn = async (answer: string, candidates: string[]) => {
    calls.push(1)
    return { contract: validateDecision({ picks: picks.map(name => ({ name, why: 'hợp lịch trình', tradeoff: null })), none: false, confidence: 'high' }, candidates, answer), ms: 1, usd: 0 }
  }
  return { fn, calls }
}

async function run(o: { prose: string; planTurn?: boolean; picks?: string[] }) {
  const result = { source: 'serper_maps', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'travel' }
  const collector = createEnrichmentCollector(ASK)
  const rec = recorder(o.picks ?? NAMES)
  collector.recordDecision = rec.fn
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'Đà Lạt', { name: NAMES[0], reasons: [{ attribute: 'rating', evidence: 'rated 4.0' }] }), producerSubject('search_places', 'travel'))
  collector.setRendersDecisionCard(rendersDecisionCard('web'))
  collector.agentMode = true; collector.semanticRanking = true
  if (o.planTurn) collector.planTurn = true
  const tiktok = vi.fn(async () => ({ perPlace: new Map(), batch: null }))
  const frames = ['9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"điểm tham quan Đà Lạt","location":"Đà Lạt"}}', 'a:' + JSON.stringify({ toolCallId: 't1', result }), line0(o.prose), END]
  const photos = vi.fn(async (_places: Array<{ name?: string }>) => new Map<string, string[]>())
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, photos as never, undefined, undefined, false, ASK, true, tiktok as never, 'Đà Lạt')
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  const places = lines.filter(l => l.startsWith('8:')).map(l => (JSON.parse(l.slice(2)) as unknown[])[0] as Record<string, unknown>).filter(a => a.kind === 'tappy.places.v1')
  return {
    shape: places.map(p => (p.cleared ? 'cleared' : p.preliminary ? 'preliminary' : 'final')),
    recorderCalls: rec.calls.length, tiktokRequests: tiktok.mock.calls.length,
    photoNames: photos.mock.calls.flatMap(c => c[0].map(p => p.name)),
    text: lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join(''),
  }
}

describe('planTurn (flag on, trip-plan turn): the plan is the whole answer', () => {
  it('a plain-text plan naming venues: no recorder call, preliminary cleared, no final card, no loose link blocks, no TikTok request', async () => {
    const r = await run({ prose: TEXT_PLAN, planTurn: true })
    expect(r.recorderCalls).toBe(0)
    expect(r.shape).toEqual(['preliminary', 'cleared'])
    expect(r.tiktokRequests).toBe(0)
    expect(r.text).toContain('Khách sạn Hana')
    expect(r.text).not.toMatch(/https?:\/\//) // the plan text carries no injected per-venue link blocks
  })

  it('a [TAPPY_PLAN] block plus an inline ranking line: the line is stripped, builds no card, and the block stays one valid JSON', async () => {
    const rank = '[TAPPY_RANK]{"picks":[{"name":"Quán Lẩu Thông","why":"ngon"}],"none":false,"confidence":"high"}[/TAPPY_RANK]'
    const r = await run({ prose: `Mình xếp lịch gọn.\n\n${PLAN_BLOCK}\n${rank}`, planTurn: true })
    expect(r.text).not.toMatch(/tappy_rank/i)
    const m = r.text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
    expect(m).not.toBeNull()
    expect(() => JSON.parse(m![1])).not.toThrow()
    expect(r.recorderCalls).toBe(0)
    expect(r.shape).toEqual(['preliminary', 'cleared'])
  })

  it('no photo lookup for a plain-text plan (nothing to show them in); a [TAPPY_PLAN] block still gets photos, for its own items only', async () => {
    expect((await run({ prose: TEXT_PLAN, planTurn: true })).photoNames).toEqual([])
    const withBlock = await run({ prose: `Mình xếp lịch gọn.\n\n${PLAN_BLOCK}`, planTurn: true })
    expect(withBlock.photoNames).toEqual(['Quán Lẩu Thông'])
  })
})

describe('CONTROL — flag off (planTurn absent): the behaviour is exactly what it was', () => {
  it('the same plain-text plan still goes through the decision recorder (one call) and ends with a final card frame', async () => {
    const r = await run({ prose: TEXT_PLAN })
    expect(r.recorderCalls).toBe(1)
    expect(r.shape[r.shape.length - 1]).toBe('final')
  })
})
