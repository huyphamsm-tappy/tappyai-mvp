// @vitest-environment node
/**
 * c40 E8 (UAT @ 2bd5c59, 2026-09-28) — "Tinker Box … nhưng lưu ý nó đóng cửa vào cuối tuần" on a
 * Monday whose row said only `opening_hours: "Đóng cửa"` (closed TODAY). Its published week says
 * Fri–Sun 08:30–21:00. A weekday / weekend closure claim must match the named venue's week.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { guardHoursClaimsInText } from './hoursGuard'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'

type Row = { name: string; opening_hours?: string; opening_hours_week?: Record<string, string> } & Record<string, unknown>
const FIX = JSON.parse(readFileSync('src/lib/ai/__fixtures__/c40E8WeekendClosure.live.json', 'utf8')) as { userText: string; reply: string; rows: Row[] }
const TINKER = 'nhưng lưu ý nó đóng cửa vào cuối tuần'
const HEDGE = 'Giờ mở cửa mình chưa xác nhận được'
const weeks = new Map(FIX.rows.filter(r => r.opening_hours_week).map(r => [r.name, r.opening_hours_week!]))
const evidence = FIX.rows.flatMap(r => [r.opening_hours ?? '', ...Object.values(r.opening_hours_week ?? {})])

describe('c40 E8 — weekly closure claims (guard)', () => {
  it('cuts the weekend-closure clause the week contradicts, keeps the rest of the sentence, hedges once', () => {
    const r = guardHoursClaimsInText(FIX.reply, evidence, { weekByEntity: weeks })
    expect(r.text).not.toContain(TINKER)
    expect(r.text).toContain('**Tinker Box** (1.3km) cũng rất tốt với 4.4⭐, là sân chơi trong nhà phù hợp với trẻ nhỏ.')
    expect(r.text).toContain('mở cửa từ 15:00–21:30 nên hoàn hảo cho chiều/tối cuối tuần')
    expect(r.text.match(new RegExp(HEDGE, 'g'))).toHaveLength(1)
    expect(r.text).toContain('[CTA_BUTTONS]')
  })

  it('keeps a weekday closure the week states (Tinker Box is closed Monday–Thursday)', () => {
    const s = 'Lưu ý **Tinker Box** đóng cửa từ thứ Hai đến thứ Năm, bạn nên đi cuối tuần.'
    // "đi cuối tuần" is advice, not a closure; the closure clause names Mon + Thu, both closed.
    expect(guardHoursClaimsInText(s, evidence, { weekByEntity: weeks }).text).toBe(s)
  })

  it('keeps "không đóng cửa cuối tuần" when the week is open on Saturday and Sunday', () => {
    const s = '**Tinker Box** không đóng cửa vào cuối tuần.'
    expect(guardHoursClaimsInText(s, evidence, { weekByEntity: weeks }).text).toBe(s)
  })

  it('a venue with no published week cannot be said to close on a weekday', () => {
    const s = 'Mình chọn **Tinker Box** gần bạn. **Nhà Thiếu Nhi** nghỉ thứ Hai, bạn lưu ý.'
    const r = guardHoursClaimsInText(s, evidence, { weekByEntity: weeks })
    expect(r.text).not.toContain('nghỉ thứ Hai')
    expect(r.text).toContain('Mình chọn **Tinker Box** gần bạn.')
  })

  it('"closed today" (no weekday) is untouched, and so are the legacy callers without weeks', () => {
    const s = '**Tinker Box** hôm nay đóng cửa, bạn chọn chỗ khác nhé.'
    expect(guardHoursClaimsInText(s, evidence, { weekByEntity: weeks }).text).toBe(s)
    expect(guardHoursClaimsInText(FIX.reply, evidence).text).toBe(FIX.reply)
  })
})

describe('c40 E8 — through the stream filter (the week rides on the card, not on the model copy)', () => {
  async function stream(reply: string): Promise<string> {
    // The a: frame is the MODEL's copy — no week, exactly as recorded. The card set is built from the
    // full rows, which carry `opening_hours_week` as serperPlaceToRow emits it.
    const modelRows = FIX.rows.map(({ opening_hours_week: _w, ...rest }) => rest)
    const full = { source: 'serper_maps', count: FIX.rows.length, results: FIX.rows.map(r => ({ ...r, text_ranked: true })), _tappy_place_domain: 'entertainment' }
    const collector = createEnrichmentCollector(FIX.userText)
    collector.add(full.results)
    collector.setPlacesRecommendations(placeRecommendations(full, 'TP HCM', { name: FIX.rows[0].name, reasons: [{ attribute: 'rating', evidence: 'rated 4.3' }] }), producerSubject('search_places', 'entertainment'))
    collector.setRendersDecisionCard(rendersDecisionCard('web'))
    const frames = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"chỗ chơi trẻ em 5 tuổi Sài Gòn","location":"Sài Gòn","type":"attraction"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { source: 'serper_maps', count: modelRows.length, results: modelRows } }),
      '0:' + JSON.stringify(reply),
      'd:{"finishReason":"stop"}',
    ]
    const orig = console.log
    console.log = () => {}
    try {
      const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, FIX.userText, true)
      return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    } finally { console.log = orig }
  }

  it('cuts the invented weekend closure', async () => {
    const out = await stream(FIX.reply)
    expect(out).not.toContain(TINKER)
    expect(out).toContain('**Tinker Box**')
    expect(out).toContain(HEDGE)
  })

  it('keeps the true weekday closure — read from the card entity week', async () => {
    const out = await stream('Nếu muốn gần hơn, **Tinker Box** (1.3km) là sân chơi trong nhà, nhưng đóng cửa từ thứ Hai đến thứ Năm.')
    expect(out).toContain('nhưng đóng cửa từ thứ Hai đến thứ Năm')
    expect(out).not.toContain(HEDGE)
  })
})
