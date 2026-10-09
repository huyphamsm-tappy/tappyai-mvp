// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { searchProducts } from './shopping'
import { serperSearch, __clearToolCache } from './common'
import { withSerperTurnBudget, withSerperToolBudget, turnCreditsRemaining, turnCreditsSpent } from './serperToolBudget'
import { ENRICHMENT_RESERVE_CREDITS, optionalEnrichmentBudget, productEnrichmentFor, worstCaseSearchProductsCredits } from './enrichmentPolicy'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './serperClient'

// Owner decision 2026-10-09 (after the failed UAT-10 lookup-scope criterion): purchase-link enrichment is OPT-IN, declared by Luna with
// `purchase_links`; advice / criteria / comparison never fans out into vendor-link searches; optional enrichment can never consume the whole
// turn budget. MOCKED provider only — every number below is counted from the stubbed fetch, nothing live.

const calls: Array<{ endpoint: string; q: string }> = []
let shoppingRows: Array<Record<string, unknown>>

function install() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://google.serper.dev/')) {
      const endpoint = url.slice('https://google.serper.dev/'.length)
      const body = JSON.parse(String(init?.body ?? '{}')) as { q?: string }
      calls.push({ endpoint, q: body.q ?? '' })
      if (endpoint === 'shopping') return new Response(JSON.stringify({ shopping: shoppingRows }), { status: 200 })
      if (endpoint === 'search') return new Response(JSON.stringify({ organic: [{ title: 'iPhone 17 Pro Max 256GB - CellphoneS', link: 'https://cellphones.com.vn/iphone-17-pro-max.html', snippet: 'Giá 33.690.000đ' }, { title: 'Tin tức iPhone', link: 'https://news.example/iphone', snippet: 'bài viết' }] }), { status: 200 })
      if (endpoint === 'images') return new Response(JSON.stringify({ images: [{ imageUrl: 'https://img.example/a.jpg', title: 'a' }] }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}
const count = (endpoint: string) => calls.filter(c => c.endpoint === endpoint).length
const ROWS = [
  { title: 'Điện thoại Apple iPhone 17 Pro Max 256GB', link: 'https://www.google.com/search?ibp=oshop&q=1', price: '₫33.690.000', source: 'CellphoneS' },
  { title: 'Samsung Galaxy S26 Ultra 5G', link: 'https://www.google.com/search?ibp=oshop&q=2', price: '₫27.000.000', source: 'Hoàng Hà Mobile' },
]

beforeEach(() => {
  __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
  calls.length = 0; shoppingRows = ROWS
  vi.stubEnv('SERPER_API_KEY', 'test-key')
  install()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('routing: purchase links are opt-in and declared, never inferred', () => {
  it('legacy callers keep the full behaviour; the agent runtime gets links ONLY for purchase_links === true', () => {
    expect(productEnrichmentFor({ agentRuntime: false })).toBe('links')
    expect(productEnrichmentFor({ agentRuntime: false, purchaseLinks: false })).toBe('links')
    expect(productEnrichmentFor({ agentRuntime: true })).toBe('none')
    expect(productEnrichmentFor({ agentRuntime: true, purchaseLinks: false })).toBe('none')
    for (const loose of ['true', 1, 'yes', null, {}, []]) expect(productEnrichmentFor({ agentRuntime: true, purchaseLinks: loose }), String(loose)).toBe('none')
    expect(productEnrichmentFor({ agentRuntime: true, purchaseLinks: true })).toBe('links')
  })
  it('the optional budget is what is left AFTER the reserve for verification (and never negative)', () => {
    expect(ENRICHMENT_RESERVE_CREDITS).toBe(4)
    expect(optionalEnrichmentBudget(5)).toBe(1) // the UAT-10 ceiling (8) after a 3-credit structured search
    expect(optionalEnrichmentBudget(9)).toBe(5) // the product ceiling (12) after the same
    expect(optionalEnrichmentBudget(4)).toBe(0)
    expect(optionalEnrichmentBudget(0)).toBe(0)
    expect(optionalEnrichmentBudget(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })
  it('worst-case credit reservation per mode is recorded: none = 3 (nothing optional); links = 14, of which 8 optional', () => {
    expect(worstCaseSearchProductsCredits('none')).toEqual({ required: 3, optional: 0, total: 3 })
    expect(worstCaseSearchProductsCredits('links')).toEqual({ required: 6, optional: 8, total: 14 })
  })
})

describe('searchProducts — request counts by mode (mocked provider)', () => {
  it('advice mode: ONE /shopping request (2 credits), no merchant-page search, no photo lookup, no marketplace links', async () => {
    const r = await searchProducts('điện thoại pin tốt camera đẹp', 'vi', { merchantLinks: false }) as { search_results?: unknown[]; links?: unknown[] }
    expect([count('shopping'), count('search'), count('images')]).toEqual([1, 0, 0])
    expect(r.search_results?.length).toBe(2)
    expect(r.links).toEqual([])
  })
  it('links mode (the old behaviour): the structured request PLUS a merchant-page search; strictly more requests than advice mode', async () => {
    await searchProducts('điện thoại pin tốt camera đẹp', 'vi', { merchantLinks: true })
    expect(count('shopping')).toBe(1)
    expect(count('search')).toBeGreaterThanOrEqual(1)
    expect(calls.length).toBeGreaterThan(1)
  })
  it('/shopping empty → advice mode asks ONE organic search; links mode asks the marketplace + direct-link + shop-info searches', async () => {
    shoppingRows = []
    await searchProducts('mẫu điện thoại không có hàng', 'vi', { merchantLinks: false })
    expect([count('shopping'), count('search')]).toEqual([1, 2 - 1])
    calls.length = 0; __clearToolCache()
    await searchProducts('mẫu điện thoại không có hàng', 'vi', { merchantLinks: true })
    expect(count('search')).toBeGreaterThanOrEqual(3)
  })
  it('the two modes are cached separately: a link-less result never answers a links request (and vice versa)', async () => {
    await searchProducts('iphone 17 pro max', 'vi', { merchantLinks: false })
    const afterAdvice = calls.length
    await searchProducts('iphone 17 pro max', 'vi', { merchantLinks: true })
    expect(calls.length).toBeGreaterThan(afterAdvice) // links were really fetched
    const afterLinks = calls.length
    await searchProducts('iphone 17 pro max', 'vi', { merchantLinks: true }) // cached
    await searchProducts('iphone 17 pro max', 'vi', { merchantLinks: false }) // cached
    expect(calls.length).toBe(afterLinks)
  })
})

describe('UAT-10 replay: optional enrichment cannot consume the turn budget', () => {
  it('ceiling 8, advice mode: the whole call costs 2 credits, 6 stay for verification', async () => {
    const r = await withSerperTurnBudget(8, async () => {
      await searchProducts('điện thoại pin tốt camera đẹp', 'vi', { merchantLinks: false })
      return { spent: turnCreditsSpent(), left: turnCreditsRemaining() }
    })
    expect(r.value).toEqual({ spent: 2, left: 6 })
  })
  it('ceiling 8, purchase intent: after the structured part (≤ 3 credits) the vendor-link searches get only the optional budget — the reserve of 4 is untouched', async () => {
    const r = await withSerperTurnBudget(8, async () => {
      await searchProducts('điện thoại pin tốt camera đẹp', 'vi', { merchantLinks: true })
      const optional = optionalEnrichmentBudget(turnCreditsRemaining())
      const before = turnCreditsSpent()
      // five vendor-link searches in parallel, exactly the UAT-10 shape (iPhone 17 Pro Max on 4 marketplaces + one more product)
      const sent = await withSerperToolBudget(optional, () => Promise.all([
        serperSearch('iPhone 17 Pro Max 256GB site:shopee.vn'), serperSearch('iPhone 17 Pro Max 256GB site:shop.tiktok.com/vn'),
        serperSearch('iPhone 17 Pro Max 256GB site:lazada.vn/products'), serperSearch('"iPhone 17 Pro Max 256GB" site:cellphones.com.vn'),
        serperSearch('Samsung Galaxy A36 5G site:shopee.vn'),
      ]))
      return { optional, enrichmentSpent: turnCreditsSpent() - before, left: turnCreditsRemaining(), refused: sent.refused }
    })
    expect(r.value.optional).toBeLessThanOrEqual(1)
    expect(r.value.enrichmentSpent).toBeLessThanOrEqual(r.value.optional)
    expect(r.value.left).toBeGreaterThanOrEqual(ENRICHMENT_RESERVE_CREDITS)
    // of the five vendor-link searches at most the optional budget reached the provider; the rest were refused before sending
    expect(calls.filter(c => c.q.includes('site:') && !c.q.includes('(')).length).toBeLessThanOrEqual(Math.max(0, r.value.optional))
  })
})

describe('route wiring (the tool is defined inline in the route — structure locked)', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
  const block = route.slice(route.indexOf("search_products: tool({"), route.indexOf('enrichment.setPlacesRecommendations(productRecommendations(result)'))
  it('purchase_links exists only for the agent runtime; the mode comes from productEnrichmentFor; the search is told whether to fetch links', () => {
    expect(block).toMatch(/\.\.\.\(agentV2 \? \{ purchase_links: z\.boolean\(\)\.optional\(\)/)
    expect(block).toContain('productEnrichmentFor({ agentRuntime: agentV2, purchaseLinks: purchase_links })')
    expect(block).toContain("searchProducts(query, lang, { merchantLinks: enrichmentMode === 'links' })")
  })
  it('attachCommerceLinks runs ONLY inside the optional-budget branch, which is closed in advice mode and capped after the reserve otherwise', () => {
    const attach = [...block.matchAll(/attachCommerceLinks\('search_products'/g)]
    expect(attach.length).toBe(2) // capped call (agent) + uncapped call (legacy) — both inside `if (optionalBudget > 0)`
    const gate = block.indexOf('if (optionalBudget > 0)')
    expect(gate).toBeGreaterThan(-1)
    for (const m of attach) expect(m.index!).toBeGreaterThan(gate)
    expect(block).toContain("const optionalBudget = enrichmentMode === 'links' ? (agentV2 ? optionalEnrichmentBudget(turnCreditsRemaining()) : Number.POSITIVE_INFINITY) : 0")
    expect(block).toContain('withSerperToolBudget(optionalBudget')
  })
  it('every agent call logs mode, optional budget, worst-case reservation, requests and credits', () => {
    expect(block).toMatch(/type: 'tappyai_product_enrichment', mode: enrichmentMode, purchase_links: purchase_links === true, optional_budget:.*worst_case: worstCaseSearchProductsCredits\(enrichmentMode\), requests: serperDelta\(enrichmentBefore\)\.calls, credits: serperDelta\(enrichmentBefore\)\.credits/)
  })
})
