// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Phase 8 orchestration fix D — A FINISHED MAKE PLAN SENDS NOTHING MORE AND BUILDS NO CARD FROM THE PLAN'S OWN NAMES.
//
// Reproduced offline BEFORE the fix (same fixture, both collector modes): the venues named inside the [TAPPY_PLAN] JSON counted as
// "the reply named these" (cardFold read the whole text), so the settle path built a decision card from the plan's data (final
// frame `picked: 2`) and then ran the batched TikTok lookup — one extra provider request AFTER the plan was complete. Neither
// is an agent loop call; both are settle-path (post-processing) behaviour. The control cases pin that discovery turns are untouched.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const NAMES = ['Quán ăn ngon Sài Gòn', 'Béo Ơi Quán - Món ngon Hà Nội', 'Cơm Tấm Ba Ghiền', 'Ốc Đào']
const row = (name: string, i: number) => ({ place_id: `g-${i}`, name, address: `${10 + i} Nguyễn Trãi, Quận 1`, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}` })
const PLAN = '[TAPPY_PLAN]' + JSON.stringify({ type: 'evening', title: 'Tối nay ở Quận 1', people: 2, budget_total: '600.000 VND', days: [{ label: 'Tối nay', items: [
  { time: '19:00', emoji: '🍜', category: 'food', name: 'Béo Ơi Quán', note: 'ăn tối' },
  { time: '21:00', emoji: '☕', category: 'cafe', name: 'Ốc Đào', note: 'cà phê' },
] }] }) + '[/TAPPY_PLAN]'
const PROSE = 'Mình xếp một buổi tối gọn trong ngân sách.\n\n' + PLAN
const PLAN_WITH_PICK = 'Nếu chỉ chọn một quán thì mình chọn **Cơm Tấm Ba Ghiền**.\n\n' + PLAN
const DISCOVERY = 'Mình chọn **Béo Ơi Quán** (4.1⭐): bún chả đúng vị.\n\nNếu muốn thay thế: **Cơm Tấm Ba Ghiền** (4.2⭐) cũng ngon.'
const ASK = 'Lập kế hoạch tối nay ở Quận 1, TP.HCM cho 2 người: ăn tối rồi đi cà phê, ngân sách 600 nghìn.'
const FIND = 'Tìm quán ăn ngon ở Quận 1'

async function run(opts: { agent: boolean; prose: string; text: string }) {
  const result = { source: 'serper_maps', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'food' }
  const collector = createEnrichmentCollector(opts.text)
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM', { name: NAMES[0], reasons: [{ attribute: 'rating', evidence: 'rated 4.0' }] }), producerSubject('search_places', 'food'))
  collector.setRendersDecisionCard(rendersDecisionCard('web'))
  if (opts.agent) { collector.agentMode = true; collector.semanticRanking = true }
  const tiktok = vi.fn(async () => ({ perPlace: new Map(), batch: null }))
  const frames = [
    '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán ăn tối","location":"Quận 1"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result }),
    line0(opts.prose), END,
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, opts.text, true, tiktok as never, 'Quận 1')
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  const ann = lines.filter(l => l.startsWith('8:')).map(l => (JSON.parse(l.slice(2)) as unknown[])[0] as Record<string, unknown>)
  const places = ann.filter(a => a.kind === 'tappy.places.v1')
  return {
    places, tiktokRequests: tiktok.mock.calls.length,
    toolFramesOut: lines.filter(l => l.startsWith('9:')).length,
    last: places[places.length - 1] as Record<string, unknown> | undefined,
    text: lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join(''),
  }
}

describe('Make Plan turn — the plan block is the deliverable (tool calls and Cards per scenario)', () => {
  it('agent runtime: plan names are not a pick → the preliminary set is CLEARED, 0 final cards, 0 extra provider requests, plan intact', async () => {
    const r = await run({ agent: true, prose: PROSE, text: ASK })
    expect(r.text).toContain('[TAPPY_PLAN]')
    expect(r.toolFramesOut).toBe(1)
    expect(r.tiktokRequests).toBe(0)
    expect(r.last).toMatchObject({ cleared: true, items: [] })
    expect(r.places.filter(p => !p.cleared && !p.preliminary)).toHaveLength(0)
  })

  it('legacy collector: the plan venue names do not become the picks, and no TikTok request follows the plan', async () => {
    const r = await run({ agent: false, prose: PROSE, text: ASK })
    expect(r.tiktokRequests).toBe(0)
    expect(r.toolFramesOut).toBe(1)
    const finalCard = r.last as { picked?: unknown[]; shown?: number }
    expect(finalCard.picked ?? []).toHaveLength(0)
    expect(finalCard.shown).toBe(3)
  })

  it('a venue the PROSE around the plan names still counts (only the block is excluded)', async () => {
    const r = await run({ agent: true, prose: PLAN_WITH_PICK, text: ASK })
    expect(r.tiktokRequests).toBe(0)
    const finalCard = r.last as { items: Array<{ name: string }>; cleared?: boolean }
    expect(finalCard.cleared).toBeUndefined()
    expect(finalCard.items.map(i => i.name)).toEqual(['Cơm Tấm Ba Ghiền'])
  })

  it('CONTROL — a discovery turn keeps its Cards and its single TikTok lookup (recommendation turns unchanged)', async () => {
    for (const agent of [false, true]) {
      const r = await run({ agent, prose: DISCOVERY, text: FIND })
      expect(r.tiktokRequests, `agent=${agent}`).toBe(1)
      expect((r.last as { picked?: unknown[] }).picked?.length, `agent=${agent}`).toBe(2)
      expect(r.places.some(p => p.cleared)).toBe(false)
    }
  })

  it('FRAME SEQUENCE: a plan turn = [preliminary, cleared] (no stray final card frame); a discovery turn = [preliminary, final] — in both modes', async () => {
    for (const agent of [false, true]) {
      const plan = await run({ agent, prose: PROSE, text: ASK })
      const shapePlan = plan.places.map(p => (p.cleared ? 'cleared' : p.preliminary ? 'preliminary' : 'final'))
      if (agent) expect(shapePlan, 'plan agent').toEqual(['preliminary', 'cleared'])
      else expect(shapePlan, 'plan legacy (approved engine card block kept)').toEqual(['preliminary', 'final'])
      const disc = await run({ agent, prose: DISCOVERY, text: FIND })
      expect(disc.places.map(p => (p.cleared ? 'cleared' : p.preliminary ? 'preliminary' : 'final')), `discovery agent=${agent}`).toEqual(['preliminary', 'final'])
    }
  })

  it('the plan block stays one valid [TAPPY_PLAN] JSON and the later guards (entity-name check, freshness note) write nothing inside it', async () => {
    for (const agent of [false, true]) {
      const r = await run({ agent, prose: [PROSE, 'Nếu thích máy ảnh thì **Sony A7 IV** hợp.'].join('\n\n'), text: ASK })
      const m = r.text.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)
      expect(m, `agent=${agent}`).not.toBeNull()
      expect(() => JSON.parse(m![1])).not.toThrow()
      expect(JSON.parse(m![1]).type).toBe('evening')
      expect(m![1]).not.toContain('chưa thấy tên này')
      expect(m![1]).not.toContain('Lưu ý:')
    }
  })
})
