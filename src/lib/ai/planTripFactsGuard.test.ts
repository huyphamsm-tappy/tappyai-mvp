import { describe, it, expect } from 'vitest'
import { guardPlanTripFacts } from './planTripFactsGuard'

const ASK = 'Bạn cho mình biết đi ngày nào, xuất phát từ đâu và muốn bay hay đi xe/tàu nhé — mình sẽ tìm vé và phòng đúng ngày cho bạn.'
const USER = ['đi du lịch Đà Nẵng 3 ngày 2 đêm']

function plan(p: Record<string, unknown>, before = '', after = '') {
  return `${before}[TAPPY_PLAN]\n${JSON.stringify(p)}\n[/TAPPY_PLAN]${after}`
}
function parsed(text: string) {
  const s = text.indexOf('[TAPPY_PLAN]') + '[TAPPY_PLAN]'.length
  return JSON.parse(text.slice(s, text.indexOf('[/TAPPY_PLAN]')))
}

// Measured on UAT 2026-09-28 (run 2): the days were dated 3/10–5/10 though the user named no date.
const DATED = {
  type: 'trip', title: 'Khám phá Đà Nẵng 3 ngày 2 đêm',
  days: [
    { label: 'Ngày 1 - Chiều tối (Ngày 3/10)', items: [{ time: '14:00', category: 'hotel', name: 'Santa Luxury Hotel', description: 'Khách sạn 4.9⭐ ven biển' }] },
    { label: 'Ngày 2 (Ngày 4/10)', items: [] },
    { label: 'Ngày 3 - Sáng (Thứ Hai, 05/10)', items: [] },
  ],
}
// Measured on UAT 2026-09-28 (run 3): a flight stop "from Hà Nội/TP.HCM" the user never gave.
const FLIGHT = {
  type: 'trip', title: 'Đà Nẵng 3 ngày 2 đêm',
  days: [{ label: 'Ngày 1', items: [
    { time: '14:00', category: 'transport', name: 'Chuyến bay đến Đà Nẵng', description: 'Máy bay từ Hà Nội/TP.HCM đến Đà Nẵng (khoảng 2-3 tiếng)' },
    { time: '17:00', category: 'hotel', name: 'M Hotel Da Nang', description: '4.8⭐, gần biển' },
    { time: '19:30', category: 'food', name: 'Bếp Cuốn Đà Nẵng', description: 'mở 10:30-21:00, lễ tân 24/7' },
  ] }],
  cost_breakdown: { 'Vé máy bay': '3.000.000 VND', 'Khách sạn': 'chưa có giá' },
}

describe('guardPlanTripFacts — date / origin / transport never invented', () => {
  it('removes invented dates from the day labels', () => {
    const r = guardPlanTripFacts(plan(DATED, '', `\n\n${ASK}`), USER)
    expect(r.missing).toEqual(['date', 'origin', 'transport'])
    expect(parsed(r.text).days.map((d: { label: string }) => d.label)).toEqual(['Ngày 1 - Chiều tối', 'Ngày 2', 'Ngày 3 - Sáng'])
    expect(r.text).toContain(ASK)
  })

  it('drops the invented flight stop and its cost line, keeps real stops and "24/7"', () => {
    const r = guardPlanTripFacts(plan(FLIGHT), USER)
    const p = parsed(r.text)
    expect(p.days[0].items.map((i: { name: string }) => i.name)).toEqual(['M Hotel Da Nang', 'Bếp Cuốn Đà Nẵng'])
    expect(p.cost_breakdown).toEqual({ 'Khách sạn': 'chưa có giá' })
    expect(r.stopsDropped).toBe(1)
  })

  it('removes prose sentences that state a date or a departure city, never the closing question', () => {
    const before = 'Mình giả sử bạn đi 2 người. Mình tính bạn bay từ Hà Nội ngày 03/10. Thời tiết đẹp, 27°C.\n'
    const r = guardPlanTripFacts(plan(FLIGHT, before, `\n\nRating 4.8/5 rất cao. ${ASK}`), USER)
    expect(r.text).toContain('Mình giả sử bạn đi 2 người.')
    expect(r.text).not.toContain('Hà Nội ngày')
    expect(r.text).toContain('Thời tiết đẹp, 27°C.')
    expect(r.text).toContain('Rating 4.8/5 rất cao.')
    expect(r.text).toContain(ASK)
    expect(r.sentencesDropped).toBe(1)
  })

  it('drops the model\'s own trip-fact question so only the closing one remains (uat 826d23b run 3)', () => {
    const before = 'Mình chọn M Hotel Da Nang vì gần biển. Bạn dự định đi vào ngày nào? (để xác nhận thời tiết & tính giá khách sạn chính xác)\n'
    const r = guardPlanTripFacts(plan(DATED, before, `\n\nBạn thích thêm spa không? ${ASK}`), USER)
    expect(r.text).not.toContain('Bạn dự định đi vào ngày nào?')
    expect(r.text).not.toContain('để xác nhận thời tiết')
    expect(r.text).toContain('Mình chọn M Hotel Da Nang vì gần biển.')
    expect(r.text).toContain('Bạn thích thêm spa không?')
    expect(r.text).toContain(ASK)
  })

  it('keeps what the user DID say: a stated date and origin stay', () => {
    const r = guardPlanTripFacts(plan(DATED), ['đi Đà Nẵng 3/10 từ Hà Nội bằng máy bay 3 ngày 2 đêm'])
    expect(r.missing).toEqual([])
    expect(r.text).toBe(plan(DATED))
  })

  it('a stated date alone keeps dates but still removes an invented flight', () => {
    const r = guardPlanTripFacts(plan(FLIGHT), ['đi Đà Nẵng 3 ngày 2 đêm cuối tuần này'])
    expect(r.missing).toEqual(['origin', 'transport'])
    expect(parsed(r.text).days[0].items).toHaveLength(2)
  })

  it('a within-city move is not an inter-city leg', () => {
    const p = { type: 'trip', title: 't', days: [{ label: 'Ngày 2', items: [{ name: 'Ngũ Hành Sơn', description: 'đi từ Cầu Rồng sang khoảng 20 phút' }] }] }
    expect(parsed(guardPlanTripFacts(plan(p), USER).text).days[0].items).toHaveLength(1)
  })

  it('leaves evening plans and unparsable blocks alone', () => {
    const ev = plan({ type: 'evening', title: 'Tối nay 3/10', days: [{ label: 'Tối nay (3/10)', items: [] }] })
    expect(guardPlanTripFacts(ev, USER).text).toBe(ev)
    const broken = '[TAPPY_PLAN]\n{"type":"trip",\n[/TAPPY_PLAN]'
    expect(guardPlanTripFacts(broken, USER).text).toBe(broken)
  })
})

describe('guardPlanTripFacts — the plan has exactly the stated number of days', () => {
  it('c40 T1 live (uat 2bd5c59): "3 ngày 2 đêm" planned 4 days → 3, day-4 stops folded into day 3', async () => {
    const { readFileSync } = await import('node:fs')
    const live = readFileSync('src/lib/ai/__fixtures__/tripT1FourDays.live.txt', 'utf8')
    const before = parsed(live)
    expect(before.days).toHaveLength(4)
    const stopCount = (p: { days: Array<{ items?: unknown[] }> }) => p.days.reduce((n, d) => n + (d.items?.length ?? 0), 0)
    const r = guardPlanTripFacts(live, ['Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'])
    const after = parsed(r.text)
    expect(after.days.map((d: { label: string }) => d.label)).toEqual(['Ngày 1', 'Ngày 2', 'Ngày 3'])
    expect(stopCount(after)).toBe(stopCount(before))
    expect(r.daysTrimmed).toBe(1)
  })

  it('the nearest stated length wins (a correction to 2 ngày 1 đêm)', () => {
    const p = { type: 'trip', title: 't', days: [{ label: 'Ngày 1', items: [] }, { label: 'Ngày 2', items: [] }, { label: 'Ngày 3', items: [{ name: 'x' }] }] }
    const r = guardPlanTripFacts(plan(p), ['đi Đà Nẵng 3 ngày 2 đêm', 'thôi 2 ngày 1 đêm thôi'])
    expect(parsed(r.text).days).toHaveLength(2)
    expect(parsed(r.text).days[1].items).toEqual([{ name: 'x' }])
  })

  it('fewer days than stated are left alone (nothing is invented)', () => {
    const p = { type: 'trip', title: 't', days: [{ label: 'Ngày 1', items: [] }] }
    expect(parsed(guardPlanTripFacts(plan(p), ['đi Huế 3 ngày 2 đêm từ Hà Nội bằng máy bay ngày 3/10']).text).days).toHaveLength(1)
  })
})

describe('fixHalfAccented — "ngan sách" (owner 2026-09-28)', () => {
  it('fixes only the half-accented pair', async () => {
    const { fixHalfAccented, normalizeReplyMarkdown } = await import('@/lib/chat/markdownNormalize')
    expect(fixHalfAccented('gần chạm ngang ngan sách.')).toBe('gần chạm ngang ngân sách.')
    expect(fixHalfAccented('Ngân sach 5 triệu')).toBe('Ngân sách 5 triệu')
    expect(fixHalfAccented('ngan sach 5tr; con ngan bay')).toBe('ngan sach 5tr; con ngan bay')
    expect(normalizeReplyMarkdown('Trong **ngan sách** của bạn')).toBe('Trong **ngân sách** của bạn')
  })
})
