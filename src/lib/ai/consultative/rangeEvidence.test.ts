// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cutUnbackedRanges, type RangeEvidence } from './rangeEvidence'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'
import { createEnrichmentCollector } from '../toolResultSplit'

// Round 42 vòng 3, RANGE-27-33 (commit 2, rule R-B) — the cut of a VND range no single source row states. Rows below: the MacBook turn of the live case.
const ROWS = [
  'Macbook Pro 14inch M1 Pro 32GB 512GB Macbook Pro 14inch M1 Pro 32GB 512GB. 26.990.000đ https://shop-b.example/macbook-pro-14inch-m1-pro-32gb-512gb',
  'MacBook Pro M1 cũ MacBook Pro 14" 2021 - M1 Pro / RAM 32GB / SSD 512GB - Likenew 99%. 32,500,000 đ. https://shop-c.example/macbook-pro-m1-cu/',
  'Bảng giá MacBook Pro MacBook Pro 14" M1 Pro 10-core/16-core GPU/16GB/512GB: Khoảng 27.000.000 - 29.000.000 VNĐ https://shop-d.example/bang-gia',
]
const ev = (o: Partial<RangeEvidence> = {}): RangeEvidence => ({ rows: ROWS, hosts: ['shop-b.example', 'shop-c.example', 'shop-d.example'], consultative: true, lang: 'vi', looked: true, ...o })
const ON_LINE = 'Mình chưa xác minh được số này từ nguồn đã đọc.'
const OFF_NOTE = 'Mình chưa xác minh được giá hiện tại từ nguồn đã tra, nên không nêu con số.'

describe('cutUnbackedRanges — what is left alone', () => {
  it('a range one row states end to end (27–29 triệu, shop-d) is not touched', () => {
    const t = 'Bản 16GB khoảng 27–29 triệu, shop-b niêm yết 26,99 triệu.'
    for (const consultative of [true, false]) expect(cutUnbackedRanges(t, ev({ consultative }))).toEqual({ text: t, changes: [] })
  })
  it('no safe cut ⇒ the sentence is NOT touched, both flags (the range stays, as before commit 2 — RANGE-NOCUT-OPEN-01)', () => {
    for (const t of [
      'Shop-b niêm yết 26,99 triệu máy còn bảo hành giá 27–33 triệu.',
      'Shop-b niêm yết 26,99 triệu còn bảo hành nơi khác khoảng 27–33 triệu.',
    ]) for (const consultative of [true, false]) expect(cutUnbackedRanges(t, ev({ consultative }))).toEqual({ text: t, changes: [] })
  })
  it('no evidence rows, or no range in the text: nothing happens', () => {
    expect(cutUnbackedRanges('Giá 27–33 triệu.', ev({ rows: [] })).changes).toEqual([])
    expect(cutUnbackedRanges('Shop-b niêm yết 26,99 triệu.', ev()).changes).toEqual([])
  })
})

describe('cutUnbackedRanges — the cut keeps the sourced figures', () => {
  it('head clause ending ":" (the live sentence)', () => {
    const r = cutUnbackedRanges('Khoảng 27–33 triệu đồng: shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu. Giá còn tùy tình trạng máy.', ev())
    expect(r.text).toBe('Shop-b niêm yết 26,99 triệu, còn shop-c ghi máy likenew 32,5 triệu. Giá còn tùy tình trạng máy.')
    expect(r.changes).toEqual(['head_clause'])
  })
  it('P1: a comparison phrase right after an amount and its unit', () => {
    const r = cutUnbackedRanges('Shop-b niêm yết 26,99 triệu thấp hơn so với mức 27–33 triệu.', ev())
    expect(r.text).toBe('Shop-b niêm yết 26,99 triệu.')
    expect(r.changes).toEqual(['connective'])
  })
  it('Q1: "và" right after an amount and its unit', () => {
    const r = cutUnbackedRanges('Shop-b niêm yết 26,99 triệu và nơi khác khoảng 27–33 triệu.', ev())
    expect(r.text).toBe('Shop-b niêm yết 26,99 triệu.')
    expect(r.changes).toEqual(['connective'])
  })
  it('Q1 does not cut when "và" does not follow an amount (the kept part would not end on the figure)', () => {
    const t = 'Shop-b niêm yết 26,99 triệu cho máy đẹp và nơi khác khoảng 27–33 triệu.'
    expect(cutUnbackedRanges(t, ev())).toEqual({ text: t, changes: [] })
  })
  it('Q2: "… ở <a source of this turn>" before the comparison phrase; a name not in the turn is not a cut', () => {
    expect(cutUnbackedRanges('Giá 26,99 triệu ở shop-b so với mức 27–33 triệu.', ev()).text).toBe('Giá 26,99 triệu ở shop-b.')
    const t = 'Giá 26,99 triệu ở shop-z so với mức 27–33 triệu.'
    expect(cutUnbackedRanges(t, ev())).toEqual({ text: t, changes: [] })
  })
})

describe('cutUnbackedRanges — branch (c): the sentence states no other amount', () => {
  it('flag ON, both ends stated, by two rows (26,99 shop-b, 32,5 shop-c): the sentence goes, the existing line is added', () => {
    const r = cutUnbackedRanges('Giá khoảng 26,99–32,5 triệu. Bạn nên xem máy trực tiếp.', ev())
    expect(r.changes).toEqual(['sentence'])
    expect(r.text).not.toMatch(/26,99|32,5/)
    expect(r.text).toContain('Bạn nên xem máy trực tiếp.')
    expect(r.text).toContain(ON_LINE)
  })
  it('flag ON, one end stated by no row (33 triệu): not touched (the evidence guard handles it, as before)', () => {
    const t = 'Giá khoảng 27–33 triệu. Bạn nên xem máy trực tiếp.'
    expect(cutUnbackedRanges(t, ev())).toEqual({ text: t, changes: [] })
  })
  it('flag OFF, the gate drops the sentence by itself: not touched', () => {
    const t = 'Giá khoảng 27–33 triệu. Bạn nên xem máy trực tiếp.'
    expect(cutUnbackedRanges(t, ev({ consultative: false, gateDrops: () => true }))).toEqual({ text: t, changes: [] })
  })
  it('flag OFF, the gate keeps it: the sentence goes with the gate\'s own sentence', () => {
    const r = cutUnbackedRanges('Giá khoảng 27–33 triệu. Bạn nên xem máy trực tiếp.', ev({ consultative: false, gateDrops: () => false }))
    expect(r.changes).toEqual(['sentence'])
    expect(r.text).not.toMatch(/27–33|33 triệu/)
    expect(r.text).toContain('Bạn nên xem máy trực tiếp.')
    expect(r.text).toContain(OFF_NOTE)
  })
})

// ── through the settle step: R-C (coach range split) only on coach turns, R-B only on the others ────────────────────────────────────────────
const QB = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
const QM = 'tui mua macbook pro M1 32GB 512GB giá bao nhiêu'
const COACH = [{ title: 'Xe A', link: 'https://a.example/', snippet: 'Vé xe giá 300.000đ' }, { title: 'Xe B', link: 'https://b.example/', snippet: 'Vé xe giá 450.000đ' }]
const MAC = [
  { title: 'Macbook Pro 14inch M1 Pro 32GB 512GB', link: 'https://shop-b.example/macbook-pro-14inch-m1-pro-32gb-512gb', snippet: 'Macbook Pro 14inch M1 Pro 32GB 512GB. 26.990.000đ', host: 'shop-b.example' },
  { title: 'MacBook Pro M1 cũ', link: 'https://shop-c.example/macbook-pro-m1-cu/', snippet: 'MacBook Pro 14" 2021 - M1 Pro / RAM 32GB / SSD 512GB - Likenew 99%. 32,500,000 đ.', host: 'shop-c.example' },
]
async function settle(user: string, frames: string[], flag: boolean) {
  const c = createEnrichmentCollector(user)
  c.agentMode = true
  c.semanticRanking = true
  if (flag) c.consultative = true
  const guards: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { const s = String(a[0]); if (s.includes('tappyai_guard')) guards.push(s) })
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c, (async () => new Map()) as never, undefined, undefined, true, user, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const out = (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  spy.mockRestore()
  return { out, guards }
}
const coachFrames = (text: string) => [
  '9:{"toolCallId":"t1","toolName":"get_transport_options","args":{"origin":"TP.HCM","destination":"Quy Nhơn","mode":"intercity","date":"2026-10-24"}}',
  'a:' + JSON.stringify({ toolCallId: 't1', result: { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: COACH, train_search_results: [], note: 'x' } }),
  '0:' + JSON.stringify(text), 'd:{"finishReason":"stop"}',
]
const webFrames = (text: string) => [
  '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'web_search', args: { queries: ['macbook pro m1 32gb 512gb giá'] } }),
  'a:' + JSON.stringify({ toolCallId: 't1', result: { results: MAC } }),
  '0:' + JSON.stringify(text), 'd:{"finishReason":"stop"}',
]
afterEach(() => { vi.restoreAllMocks() })

describe('R-C on coach turns only; R-B not on coach turns', () => {
  for (const flag of [false, true]) {
    it(`flag ${flag ? 'ON' : 'OFF'}: coach turn — the two-row range is split into named figures (R-C), the range-evidence step does not run`, async () => {
      const { out, guards } = await settle(QB, coachFrames('Giá 300.000–450.000đ.'), flag)
      expect(out).toContain('300.000đ (giá nêu ở a.example) và 450.000đ (giá nêu ở b.example)')
      expect(guards.some(g => g.includes('"range_evidence"'))).toBe(false)
    })
    it(`flag ${flag ? 'ON' : 'OFF'}: non-coach turn — the same kind of range gets no coach labels (R-C does not run)`, async () => {
      const { out } = await settle(QM, webFrames('Giá khoảng 26,99–32,5 triệu. Bạn nên xem máy trực tiếp.'), flag)
      expect(out).not.toMatch(/giá nêu ở|giá "từ" ở|giá ưu đãi nêu/)
    })
  }
})
