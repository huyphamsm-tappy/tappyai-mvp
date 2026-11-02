import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachCommerceLinks } from './commerce'

// 30/10: a model that does its own `site:<store>` web search found the exact product page, and the answer still offered a search page.
// The platform now turns a web result that IS a product page of a registry merchant into a validated Commerce Link - decided by the
// result's host and shape, never by words in the question (any product, any language).

const NOW = new Date('2026-10-30T03:00:00Z')
type Row = Record<string, unknown>
const run = async (results: Array<{ title: string; link: string; snippet?: string }>, userTexts: string[], query = 'x') => {
  const r: Row = { results: results.map(x => ({ snippet: '', ...x })) }
  await attachCommerceLinks('web_search', r, { enabled: true, now: NOW, query, userTexts })
  return r
}
const links = (r: Row) => (r.product_links as Array<{ name: string; platform: string; url: string }> | undefined) ?? []

describe('web_search results that are a registry merchant\'s product page become product_links', () => {
  it('a phone page, whatever the question said', async () => {
    const r = await run([
      { title: 'iPhone 15 256GB giá tốt', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb?srsltid=AYCX9v' },
      { title: 'So sánh iPhone 15', link: 'https://www.dienmayxanh.com/kinh-nghiem-hay/so-sanh-iphone-15-va-plus-1525083' },
      { title: 'blog', link: 'https://example.com/iphone-15' },
    ], ['Mình cần mua iPhone 15 256GB'])
    expect(links(r).map(l => l.url)).toEqual(['https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb'])
    expect(links(r)[0].platform).toBe('Điện Máy Xanh')
  })
  it('a laptop page and an English question: same code path', async () => {
    const r = await run([{ title: 'MacBook Air M3 13 inch 8GB/256GB', link: 'https://www.dienmayxanh.com/laptop/macbook-air-m3-13-inch-8gb-256gb' }], ['Where can I buy a MacBook Air?'])
    expect(links(r).map(l => l.url)).toEqual(['https://www.dienmayxanh.com/laptop/macbook-air-m3-13-inch-8gb-256gb'])
  })
  it('an air-conditioner page, a question with no buying word at all', async () => {
    const r = await run([{ title: 'Máy lạnh Daikin Inverter 1 HP FTKM25AVMV', link: 'https://www.dienmayxanh.com/may-lanh/daikin-inverter-1-hp-ftkm25avmv' }], ['Daikin 1 ngựa loại nào êm'])
    expect(links(r)).toHaveLength(1)
  })
  it('category pages, comparison articles, search pages and non-merchant hosts give nothing', async () => {
    const r = await run([
      { title: 'Nồi chiên Philips', link: 'https://www.dienmayxanh.com/noi-chien-khong-dau-philips' },
      { title: 'Tìm kiếm', link: 'https://www.dienmayxanh.com/tim-kiem?key=iphone' },
      { title: 'Review', link: 'https://news.example/iphone-15-review' },
    ], ['iPhone 15'])
    expect(r.product_links).toBeUndefined()
    expect(r._tappy_commerce).toBeUndefined()
  })
  it('at most 3 links, and the web results themselves are left untouched', async () => {
    const hits = Array.from({ length: 6 }, (_, i) => ({ title: `Máy ${i}`, link: `https://www.dienmayxanh.com/may-lanh/model-${i}-inverter` }))
    const r = await run(hits, ['máy lạnh'])
    expect(links(r)).toHaveLength(3)
    expect(r.results).toHaveLength(6)
  })
  it('the platform facts ride along as for every other handoff', async () => {
    const r = await run([{ title: 'iPhone 15 256GB', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-256gb' }], ['iPhone 15 256GB'])
    const facts = r._tappy_commerce as Array<{ providerId: string; kind: string }>
    expect(facts.map(f => f.providerId)).toEqual(['dmx'])
  })
  it('the same shape check holds for any product family, nothing in the code names one', async () => {
    for (const [title, path] of [['iPhone 16 Pro Max 256GB', '/dien-thoai/iphone-16-pro-max-256gb'], ['Tủ lạnh Samsung 300L', '/tu-lanh/samsung-inverter-300-lit'], ['Laptop Dell Inspiron 15', '/laptop/dell-inspiron-15-3520'], ['Tai nghe Sony WH-1000XM5', '/tai-nghe/sony-wh-1000xm5']] as const) {
      const r = await run([{ title, link: `https://www.dienmayxanh.com${path}` }], ['anything, in any language'])
      expect(links(r).map(l => l.url), title).toEqual([`https://www.dienmayxanh.com${path}`])
    }
  })
  it('a registry merchant of ANOTHER kind (hotel, ticket, coach) is not offered as a product', async () => {
    const r = await run([
      { title: 'Khách sạn A', link: 'https://www.agoda.com/khach-san-a/hotel/da-lat-vn.html' },
      { title: 'Vé xe', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-129t0-1.html' },
      { title: 'Show', link: 'https://ticketbox.vn/u-know-project-26-scene1-in-hcm-26405' },
    ], ['iPhone 15'])
    expect(r.product_links).toBeUndefined()
  })
  it('editorial and utility sections of the store are never a buy button', async () => {
    for (const section of ['kinh-nghiem-hay', 'tin-tuc', 'khuyen-mai', 'may-doi-tra', 'tim-kiem']) {
      const r = await run([{ title: 'x', link: `https://www.dienmayxanh.com/${section}/something-1525083` }], ['iPhone 15'])
      expect(r.product_links, section).toBeUndefined()
    }
  })
  it('an event or film turn keeps its own path (no product_links added to it)', async () => {
    const r = await run([{ title: 'x', link: 'https://news.example/concert' }], ['Có concert nào ở TP.HCM cuối tuần này không?'], 'concert TP.HCM')
    expect(r.product_links).toBeUndefined()
  })
})

describe('wiring: the model may link it, and the answer end carries it', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('web_search grants product_links[].url as an action URL', () => {
    expect(read('src/lib/ai/security/urlGrants.ts')).toContain("'product_links[].url': 'action'")
  })
  it('the stream collects product_links as system links', () => {
    expect(read('src/lib/ai/streamEnrichment.ts')).toContain('...(r.product_links ?? [])')
  })
})
