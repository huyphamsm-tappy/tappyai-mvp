// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, citeSources, citeSourcesDetailed } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { planPriceSources, collectSearchRows, figuresIn } from './consultative/priceProvenance'

// Round 32, defect 1 — a price keeps the source that STATES it. Live 2026-10-12 (MacBook): two prices only two search snippets carried, source button = the page that
// was read and stated neither. Nothing here names a shop: the relation figure ↔ text ↔ source ↔ URL is rebuilt from the turn's own data.

const PAGE = 'https://shop-a.example/hang-cu/macbook-pro.html'
const SNIP1 = 'https://shop-b.example/macbook-pro-14inch-m1-pro-32gb-512gb'
const SNIP2 = 'https://shop-c.example/macbook-pro-m1-cu/'
const Q = 'tui mua macbook pro M1 32GB 512GB giá bao nhiêu'
const ROWS = [
  { title: 'Macbook Pro cũ giá rẻ', link: PAGE, snippet: 'Mua Macbook Pro cũ giá rẻ - giảm HSSV 10%, trả góp 0%.' },
  { title: 'Macbook Pro 14inch M1 Pro 32GB 512GB', link: SNIP1, snippet: '... 32GB - 512GB 26.990.000đ. Chọn màu để xem giá và chi nhánh có hàng.' },
  { title: 'MacBook Pro M1 cũ', link: SNIP2, snippet: 'MacBook Pro 14" 2021 - M1 Pro / RAM 32GB / SSD 512GB - Likenew 99%. 32,500,000 đ.' },
]
const MODEL_TEXT = 'Nếu bạn đang nói MacBook Pro 14″ M1 Pro 32GB 512GB máy cũ, giá niêm yết mình tra được là 26.990.000đ ở shop-b; một nơi khác niêm yết 32.500.000đ.[S1] Giá có thể thay đổi.'

async function run(text: string, o: { flag: boolean; pagePassages?: string[]; rows?: unknown[] }) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  collector.semanticRanking = true // as route.ts sets it on every agent v2 turn: the tool results become the retrieved corpus the guards judge against
  if (o.flag) collector.consultative = true
  collector.citationSources = [{ id: 'S1', host: 'shop-a.example', url: PAGE }]
  collector.guardEvidence = { sources: [{ id: 'S1', host: 'shop-a.example', sourceType: 'merchant' as never, passages: o.pagePassages ?? ['Macbook Pro cũ: nhiều tùy chọn SSD từ 256GB, 512GB đến 1TB.'] }], conflicts: [], carried: [], constraintsSig: null, userText: Q } as never
  const frames = [
    '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { results: o.rows ?? ROWS } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('priceProvenance (pure)', () => {
  it('reads both ends of a range and every grouping style', () => {
    expect(figuresIn('từ 350.000–410.000đ, hoặc 26,990,000 đ, hay 410000 đ').sort((a, b) => a - b)).toEqual([350000, 410000, 26990000])
  })
  it('a page that states a figure is a page source; the rest is covered by the search result that states it', () => {
    const rows = collectSearchRows({ results: ROWS }, [])
    const plan = planPriceSources('giá 26.990.000đ và 32.500.000đ', [{ id: 'S1', host: 'shop-a.example', url: PAGE, passages: ['không có giá'] }], rows)
    expect(plan.pageSources).toEqual([])
    expect(plan.searchRows.map(r => r.host).sort()).toEqual(['shop-b.example', 'shop-c.example'])
    expect(plan.unmatched).toEqual([])
  })
  it('a page that states the figure wins, and the search result is not added for a figure already covered', () => {
    const rows = collectSearchRows({ results: ROWS }, [])
    const plan = planPriceSources('giá 26.990.000đ', [{ id: 'S1', host: 'shop-a.example', url: PAGE, passages: ['Giá: 26.990.000đ'] }], rows)
    expect(plan.pageSources.map(p => p.id)).toEqual(['S1'])
    expect(plan.searchRows).toEqual([])
  })
  it('a figure nothing states stays unmatched (no source is invented)', () => {
    const plan = planPriceSources('giá 99.000.000đ', [], collectSearchRows({ results: ROWS }, []))
    expect(plan.unmatched).toEqual([99000000])
    expect(plan.searchRows).toEqual([])
  })
  it('collectSearchRows keeps https rows with a snippet only', () => {
    const out = collectSearchRows({ results: [{ link: 'http://x.example/a', snippet: 's' }, { link: 'https://y.example/a', snippet: '' }, { link: 'https://z.example/a', title: 't', snippet: 's' }] }, [])
    expect(out.map(r => r.host)).toEqual(['z.example'])
  })
})

describe('citeSourcesDetailed', () => {
  const allowed = new Set(['https://a.example/p', 'https://b.example/q'])
  const srcs = [{ id: 'S1', host: 'a.example', url: 'https://a.example/p' }, { id: 'S2', host: 'b.example', url: 'https://b.example/q' }]
  it('without options it is exactly citeSources', () => {
    const a = citeSources('Giá 10.000đ.', srcs, allowed, 'vi')
    expect(a).toBe(citeSourcesDetailed('Giá 10.000đ.', srcs, allowed, 'vi').text)
    expect(a).toContain('Nguồn: [a.example](https://a.example/p) · [b.example](https://b.example/q)')
  })
  it('a surviving marker is turned into its link whatever the options say', () => {
    const r = citeSourcesDetailed('Giá 10.000đ [S2].', srcs, allowed, 'vi', { fallback: [], searchLinks: [] })
    expect(r.used).toBe(true)
    expect(r.text).toContain('[b.example](https://b.example/q)')
    expect(r.text).not.toContain('Nguồn:')
  })
  it('options narrow the fallback line and add the search-result line; nothing outside the allowed set is linked', () => {
    const r = citeSourcesDetailed('Giá 10.000đ.', srcs, allowed, 'vi', { fallback: [srcs[1]], searchLinks: [{ id: 'P1', host: 'c.example', url: 'https://c.example/r' }, { id: 'P2', host: 'b.example', url: 'https://b.example/q' }] })
    expect(r.used).toBe(false)
    expect(r.text).toContain('Nguồn: [b.example](https://b.example/q)')
    expect(r.text).toContain('Giá theo kết quả tìm kiếm của: [b.example](https://b.example/q)')
    expect(r.text).not.toContain('c.example')
    expect(r.text).not.toContain('a.example')
  })
  it('options with nothing to show leave the text alone', () => {
    expect(citeSourcesDetailed('Giá 10.000đ.', srcs, allowed, 'vi', { fallback: [], searchLinks: [] }).text).toBe('Giá 10.000đ.')
  })
})

describe('settle step — price ↔ source (flag on)', () => {
  it('the live case: the marker is dropped, the prices come from two search results → their own links, NOT the page that states neither', async () => {
    const out = await run(MODEL_TEXT, { flag: true })
    expect(out).toContain('26.990.000')
    expect(out).toContain('32.500.000')
    expect(out).toContain('Giá theo kết quả tìm kiếm của:')
    expect(out).toContain(`](${SNIP1})`)
    expect(out).toContain(`](${SNIP2})`)
    expect(out).not.toContain('Nguồn: [shop-a.example]')
    expect(out).not.toContain(`](${PAGE})`)
  })
  it('a page whose passages state the price is named as the source, and no search-result line is added for it', async () => {
    const out = await run('Giá niêm yết là 26.990.000đ.', { flag: true, pagePassages: ['MacBook Pro 14 M1 Pro 32GB/512GB: 26.990.000đ'] })
    expect(out).toContain(`Nguồn: [shop-a.example](${PAGE})`)
    expect(out).not.toContain('Giá theo kết quả tìm kiếm của')
  })
  it('a figure no page and no search result states is cut by the guards (not re-sourced): no search-result price line is shown for it', async () => {
    const out = await run('Giá khoảng 99.000.000đ.', { flag: true })
    expect(out).not.toContain('99.000.000')
    expect(out).not.toContain('Giá theo kết quả tìm kiếm của')
  })
  it('a reply with no figure keeps the former behaviour (the page read is the source)', async () => {
    const out = await run('Bản M1 Pro thường có 16GB hoặc 32GB RAM.', { flag: true })
    expect(out).toContain(`Nguồn: [shop-a.example](${PAGE})`)
  })
  it('CONTROL — flag off: the former behaviour, untouched', async () => {
    const out = await run(MODEL_TEXT, { flag: false })
    expect(out).not.toContain('Giá theo kết quả tìm kiếm của')
    expect(out).not.toContain(`](${SNIP1})`)
    expect(out).not.toContain(`](${SNIP2})`)
  })
})
