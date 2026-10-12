// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { quantitiesIn, shieldSupported, type GuardEvidence } from './guardEvidence'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// Round 33, defect A — one amount, several spellings. Live 2026-10-12 (MacBook): snippets say "26.990.000đ" / "32,500,000 đ", the reply says "26,99 triệu" / "32,5 triệu".
// Investigation: those two forms happen to be exact in floating point (26.99 × 1e6, 32.5 × 1e6) — what the live cut really was is in the report. The REAL representation defect is
// that "x,yy triệu" is computed in floating point (2,01 triệu → 2 009 999.999…) and compared with `===` (guardEvidence.ts statedIn / numberAnywhere), so ~3 % of two-decimal
// amounts never match the same amount written in full. Under the flag the VND amounts are compared as whole đồng; the amount itself is never changed.

const ev = (...passages: string[]): GuardEvidence => ({ sources: [{ id: 'S1', host: 'a.example', sourceType: 'merchant' as never, passages }], conflicts: [], carried: [], constraintsSig: null, userText: 'x' })
const FLAG = { cutUnsourcedMoney: true, canonMoney: true, retrievedTexts: [] as string[] }
const vnd = (t: string, canon: boolean) => quantitiesIn(t, canon).filter(q => q.kind === 'money').map(q => q.value)

describe('quantitiesIn — VND amounts as whole đồng (flag only)', () => {
  it('without the option a scaled amount is a float (the defect): 2,01 triệu ≠ 2.010.000đ', () => {
    expect(vnd('2,01 triệu', false)[0]).not.toBe(2010000)
    expect(vnd('2.010.000đ', false)[0]).toBe(2010000)
  })
  it.each([
    ['26,99 triệu', '26.990.000đ'], ['32,5 triệu', '32.500.000 đ'], ['32,5 triệu', '32,500,000 đ'], ['2,01 triệu', '2.010.000đ'], ['4,03 triệu', '4.030.000 đ'],
    ['4,02tr', '4.020.000đ'], ['1,5 triệu', '1.500.000đ'], ['650 nghìn', '650.000đ'], ['2,09 triệu đồng', '2.090.000 VND'],
  ])('%s ≡ %s', (a, b) => { expect(vnd(a, true)).toEqual(vnd(b, true)); expect(vnd(a, true)[0]).toBe(Number.isInteger(vnd(a, true)[0]) ? vnd(b, true)[0] : -1) })
  it('a different amount stays different (no tolerance is added)', () => {
    expect(vnd('2,01 triệu', true)[0]).not.toBe(vnd('2.050.000đ', true)[0])
    expect(vnd('26,99 triệu', true)[0]).not.toBe(vnd('27.000.000đ', true)[0])
  })
  it('a bare number or an ambiguous text is not an amount; USD keeps its cents', () => {
    expect(vnd('giá khoảng 26,99', true)).toEqual([])
    expect(vnd('khoảng 2 triệu rưỡi', true)).toEqual([2000000]) // only the stated "2 triệu"; "rưỡi" is not interpreted
    expect(quantitiesIn('12,5 USD', true).find(q => q.kind === 'money')?.value).toBe(12.5)
  })
  it('a range is read as before (both ends)', () => {
    expect(vnd('27–33 triệu', true)).toEqual([27000000, 33000000])
  })
})

describe('shieldSupported with the option (flag on)', () => {
  it('2,01 triệu is supported by a page stating 2.010.000đ; without the option it is not', () => {
    const on = shieldSupported('Giá 2,01 triệu [S1].', ev('Giá niêm yết: 2.010.000đ'), FLAG)
    expect(on.report.supported).toBe(1)
    const off = shieldSupported('Giá 2,01 triệu [S1].', ev('Giá niêm yết: 2.010.000đ'), { cutUnsourcedMoney: true, retrievedTexts: [] })
    expect(off.report.supported).toBe(0)
  })
  it('a price off by more than the spelling is still not supported and, stated nowhere, still cut', () => {
    const r = shieldSupported('Giá 2,05 triệu [S1].', ev('Giá niêm yết: 2.010.000đ'), FLAG)
    expect(r.report.supported).toBe(0)
    expect(r.report.reasons.unsourced_money_cut).toBe(1)
  })
  it('a figure stated nowhere is cut', () => {
    const r = shieldSupported('Giá 9,99 triệu [S1].', ev('Giá niêm yết: 2.010.000đ'), FLAG)
    expect(r.report.reasons.unsourced_money_cut).toBe(1)
    expect(r.text).not.toContain('9,99')
  })
  it('a figure stated in a retrieved snippet (not the cited page) is not cut by the money rule; the marker of the wrong page goes, no other source is put in its place', () => {
    const r = shieldSupported('Giá 2,01 triệu [S1].', ev('Trang này không nêu giá.'), { ...FLAG, retrievedTexts: ['Macbook 14 inch giá 2.010.000đ tại shop-b'] })
    expect(r.report.reasons.unsourced_money_cut).toBeUndefined()
    expect(r.report.markersDropped).toBe(1)
    expect(r.text).not.toMatch(/\[S\d/)
  })
  it('a range whose upper end nothing states is still cut (ranges are judged as before)', () => {
    const r = shieldSupported('Khoảng 27–33 triệu [S1].', ev('Giá 27.000.000đ'), FLAG)
    expect(r.report.reasons.unsourced_money_cut).toBe(1)
  })
})

describe('the live MacBook sentence, taken apart (what actually made the guard cut it)', () => {
  const retrieved = ['Macbook Pro 14inch M1 Pro 32GB 512GB. 26.990.000đ', 'MacBook Pro 14" 2021 - M1 Pro 10core / RAM 32GB / SSD 512GB - Likenew 99%. 32,500,000 đ.', 'MacBook Pro 14" M1 Pro 10-core/16-core GPU/16GB/512GB: Khoảng 27.000.000 - 29.000.000 VNĐ', 'MacBook Pro 14" M1 Max/32GB/1TB: Từ 32.000.000 VNĐ trở lên']
  const opts = { ...FLAG, retrievedTexts: retrieved }
  it('"26,99 triệu" and "32,5 triệu" are the same amounts as the snippets: not cut', () => {
    const r = shieldSupported('T&T Center niêm yết 26,99 triệu, còn ZShop ghi máy likenew 32,5 triệu [S1].', ev('Trang này không nêu giá.'), opts)
    expect(r.report.reasons.unsourced_money_cut).toBeUndefined()
  })
  it('the model\'s own range "27–33 triệu" is what is cut: 33 triệu is stated by no snippet', () => {
    const r = shieldSupported('Khoảng 27–33 triệu đồng: T&T Center niêm yết 26,99 triệu, còn ZShop ghi máy likenew 32,5 triệu [S1].', ev('Trang này không nêu giá.'), opts)
    expect(r.report.reasons.unsourced_money_cut).toBe(1)
  })
})

// ── through the settle step ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PAGE = 'https://shop-a.example/macbook-pro.html'
const SNIP = 'https://shop-b.example/macbook-pro-m1'
const Q = 'tui mua macbook pro M1 32GB 512GB giá bao nhiêu'
async function run(text: string, flag: boolean, snippet = 'MacBook Pro 14 M1 Pro 32GB 512GB. 2.010.000đ. Còn hàng.') {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  collector.semanticRanking = true
  if (flag) collector.consultative = true
  collector.citationSources = [{ id: 'S1', host: 'shop-a.example', url: PAGE }]
  collector.guardEvidence = { sources: [{ id: 'S1', host: 'shop-a.example', sourceType: 'merchant' as never, passages: ['Trang này không nêu giá.'] }], conflicts: [], carried: [], constraintsSig: null, userText: Q } as never
  const frames = [
    '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [{ title: 'Macbook Pro cũ', link: PAGE, snippet: 'Mua Macbook Pro cũ giá rẻ.', host: 'shop-a.example' }, { title: 'MacBook Pro M1', link: SNIP, snippet, host: 'shop-b.example' }] } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}
describe('settle step (flag on): the same amount in another spelling is kept, with the source that states it', () => {
  it('2,01 triệu (snippet: 2.010.000đ) is kept and sourced to the snippet\'s own link, never to the page that does not state it', async () => {
    const out = await run('Giá niêm yết khoảng 2,01 triệu ở shop-b.[S1] Giá có thể đổi.', true)
    expect(out).toContain('2,01 triệu')
    expect(out).toContain('Giá theo kết quả tìm kiếm của:')
    expect(out).toContain(`](${SNIP})`)
    expect(out).not.toContain(`](${PAGE})`)
  })
  it('an amount off by more than the spelling (2,05 triệu) is cut', async () => {
    const out = await run('Giá niêm yết khoảng 2,05 triệu ở shop-b.[S1]', true)
    expect(out).not.toContain('2,05')
  })
  it('a price that appears nowhere in the evidence is cut', async () => {
    const out = await run('Giá niêm yết khoảng 9,99 triệu ở shop-b.[S1]', true)
    expect(out).not.toContain('9,99')
    expect(out).not.toContain('Giá theo kết quả tìm kiếm của')
  })
  it('CONTROL — flag off: no search-result price line, the former behaviour', async () => {
    const out = await run('Giá niêm yết khoảng 2,01 triệu ở shop-b.[S1] Giá có thể đổi.', false)
    expect(out).not.toContain('Giá theo kết quả tìm kiếm của')
    expect(out).not.toContain(`](${SNIP})`)
  })
})
