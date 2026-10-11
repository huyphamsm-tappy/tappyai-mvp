// @vitest-environment node
// Phase 8 POST-UAT (2026-10-09) · Fix group 3 — search_products states + fallback (B4: UAT-11 / 12 / 23). Deterministic failure
// injection: no Serper credits, no network.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const serper = vi.hoisted(() => ({ search: vi.fn(), shopping: vi.fn(), setCache: vi.fn() }))
vi.mock('@/lib/ai/tools/common', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  getCache: () => null,
  setCache: serper.setCache,
  serperSearch: serper.search,
  serperShopping: serper.shopping,
  fetchPlacePhotosByName: async () => [],
}))

import { searchProducts } from '@/lib/ai/tools/shopping'
import { toolStateOf, productDataUsability, withProductFallback } from './toolState'

const ctx = { toolCallId: 't', messages: [] }
beforeEach(() => { serper.search.mockReset(); serper.shopping.mockReset(); serper.setCache.mockReset() })

describe('POST-UAT B4 · the provider result says what it is', () => {
  it('UAT-11 as measured: Serper out of credits (every call null) → links-only result is ERROR, not SUCCESS, and is not cached', async () => {
    serper.search.mockResolvedValue(null)
    serper.shopping.mockResolvedValue(null)
    const r = await searchProducts('iPhone 17 Pro Max 256GB giá Việt Nam', 'vi') as Record<string, unknown>
    expect(Array.isArray(r.links)).toBe(true)
    expect(r.product_data).toBe('none')
    expect(r.provider_status).toBe('error')
    expect(toolStateOf('ok', r)).toBe('ERROR')
    expect(productDataUsability(r)).toBe('none')
    expect(serper.setCache).not.toHaveBeenCalled()
  })
  it('a genuine empty answer (the provider answered, nothing found) is EMPTY — never disguised as a failure, never cached', async () => {
    serper.search.mockResolvedValue([])
    serper.shopping.mockResolvedValue([])
    const r = await searchProducts('quạt điều hòa Kangaroo KG50F79', 'vi') as Record<string, unknown>
    expect(r.provider_status).toBe('empty')
    expect(toolStateOf('ok', r)).toBe('EMPTY')
    expect(serper.setCache).not.toHaveBeenCalled()
  })
  it('priced Shopping rows are SUCCESS + usable and are cached as before', async () => {
    serper.shopping.mockResolvedValue([{ title: 'AirPods Pro 2 USB-C', link: 'https://shopee.vn/airpods-pro-2-i.1.2', price: '5.290.000 ₫', source: 'Shopee' }])
    serper.search.mockResolvedValue([])
    const r = await searchProducts('AirPods Pro 2', 'vi')
    expect(toolStateOf('ok', r)).toBe('SUCCESS')
    expect(productDataUsability(r)).toBe('usable')
    expect(serper.setCache).toHaveBeenCalled()
  })
  it('usability: usable / partial / none', () => {
    expect(productDataUsability({ shopping_results: [{ title: 'x', price: '1.000 ₫' }] })).toBe('usable')
    expect(productDataUsability({ search_results: [{ title: 'Kangaroo KG50F79', link: 'https://tiki.vn/x-p1.html' }] })).toBe('partial')
    expect(productDataUsability({ links: [{ name: 'Shopee', url: 'https://shopee.vn/search?keyword=x' }], shop_info_results: [] })).toBe('none')
  })
})

describe('POST-UAT B4 · fallback behaviour', () => {
  it('ERROR (links only) → ONE bounded web price search runs (it did not in UAT-11)', async () => {
    const calls: unknown[] = []
    const exec = withProductFallback(async () => ({ links: [{ name: 'Shopee', url: 'https://shopee.vn/search?keyword=x' }], shop_info_results: [], product_data: 'none', provider_status: 'error' }),
      async a => { calls.push(a); return { results: [{ title: 'iPhone 17 Pro Max giá', link: 'https://fptshop.com.vn/x' }] } }, { lang: 'vi' })
    const r = await exec({ query: 'iPhone 17 Pro Max' }, ctx) as Record<string, any>
    expect(r.tool_state).toBe('ERROR')
    expect(r.data_usability).toBe('none')
    expect(calls).toHaveLength(1)
    expect(r.fallback.tool_state).toBe('SUCCESS')
  })
  it('PARTIAL rows (names, no price) keep the rows AND run the fallback for the price', async () => {
    let n = 0
    const exec = withProductFallback(async () => ({ search_results: [{ title: 'Quạt điều hòa Kangaroo KG50F79', link: 'https://tiki.vn/x-p1.html' }] }), async () => { n++; return { results: [] } }, { lang: 'vi' })
    const r = await exec({ query: 'Kangaroo KG50F79' }, ctx) as Record<string, any>
    expect(r.tool_state).toBe('SUCCESS')
    expect(r.data_usability).toBe('partial')
    expect(r.search_results).toHaveLength(1)
    expect(r.fallback.tool_state).toBe('EMPTY')
    expect(r.fallback_note).toMatch(/CHƯA XÁC MINH/)
    expect(n).toBe(1)
  })
  it('usable data and a genuine EMPTY never trigger the fallback', async () => {
    let n = 0
    const fb = async () => { n++; return {} }
    await withProductFallback(async () => ({ shopping_results: [{ title: 'x', price: '1.000 ₫' }] }), fb, { lang: 'vi' })({ query: 'x' }, ctx)
    await withProductFallback(async () => ({ links: [], product_data: 'none', provider_status: 'empty' }), fb, { lang: 'vi' })({ query: 'x' }, ctx)
    expect(n).toBe(0)
  })
  it('the deadline bounds the fallback: too little budget left → skipped, said in the trace; never past the budget', async () => {
    const events: unknown[] = []
    let t = 0
    const exec = withProductFallback(async () => { t = 13_000; throw new Error('502') }, async () => ({ results: [{ title: 'x' }] }), { lang: 'vi', now: () => t, budgetMs: 14_000, onFallback: d => events.push(d) })
    const r = await exec({ query: 'x' }, ctx) as Record<string, any>
    expect(r.tool_state).toBe('ERROR')
    expect(events).toEqual([expect.objectContaining({ fallbackState: 'skipped_deadline' })])
  })
  it('a hanging fallback times out inside the remaining budget (TIMEOUT, not a hang)', async () => {
    const exec = withProductFallback(async () => { throw new Error('502') }, () => new Promise(() => { /* never */ }), { lang: 'vi', budgetMs: 2_600 })
    const r = await exec({ query: 'x' }, ctx) as Record<string, any>
    expect(r.fallback.tool_state).toBe('TIMEOUT')
    expect(r.note).toMatch(/CHƯA XÁC MINH/)
  }, 10_000)
  it('DuckDuckGo / web fallback failure is ERROR, never an empty "no product"', async () => {
    const exec = withProductFallback(async () => { throw new Error('402 credits') }, async () => ({ results: [], provider_status: 'error' }), { lang: 'vi' })
    const r = await exec({ query: 'x' }, ctx) as Record<string, any>
    expect(r.fallback.tool_state).toBe('ERROR')
  })
})
