import { describe, it, expect, vi } from 'vitest'
import { resolveRequestMarket, toolGateQuery, wrapToolsWithMarketGate, MARKET_GATED_TOOLS } from './routeGate'
import { DEFAULT_REGISTRY, type Registry } from './marketGate'

const mk = () => {
  const calls: string[] = []
  const tool = (name: string) => ({ description: name, execute: vi.fn(async (a: unknown) => { calls.push(name); return { ok: true, name, a } }) })
  const tools: Record<string, ReturnType<typeof tool>> = {}
  for (const n of [...MARKET_GATED_TOOLS, 'calculate', 'think_deeper', 'save_price_watch']) tools[n] = tool(n)
  return { tools, calls }
}
const hdr = (v?: string) => new Headers(v === undefined ? {} : { 'x-tappy-market': v })

describe('resolveRequestMarket', () => {
  it('no header: Vietnam (the product\'s one active market, today\'s behaviour); an IP or language never decides', () => {
    expect(resolveRequestMarket(hdr())).toEqual({ marketId: 'vn', userNamedMarket: false })
  })
  it('an explicit market is taken as the market, normalised', () => {
    expect(resolveRequestMarket(hdr(' VN '))).toEqual({ marketId: 'vn', userNamedMarket: true })
    expect(resolveRequestMarket(hdr('th')).marketId).toBe('th')
  })
  it('🔑 an empty or malformed header is "no market" (fail closed), never Vietnam', () => {
    expect(resolveRequestMarket(hdr('')).marketId).toBeNull()
    expect(resolveRequestMarket(hdr('vn; drop table')).marketId).toBeNull()
    expect(resolveRequestMarket(hdr('x'.repeat(40))).marketId).toBeNull()
  })
})

describe('toolGateQuery', () => {
  it('maps a tool to vertical, capability and action; a place search by its type', () => {
    expect(toolGateQuery('get_hotel_prices', {})).toMatchObject({ vertical: 'hotels', capability: 'search', action: 'get_hotel_prices' })
    expect(toolGateQuery('search_places', { type: 'hotel' })?.vertical).toBe('hotels')
    expect(toolGateQuery('search_places', { type: 'attraction' })?.vertical).toBe('attractions')
    expect(toolGateQuery('search_places', { type: 'mall' })?.vertical).toBe('shopping')
    expect(toolGateQuery('search_places', { type: 'restaurant' })?.vertical).toBe('food')
    expect(toolGateQuery('search_places', undefined)?.vertical).toBe('food')
  })
  it('a tool that is not market-bound has no query', () => {
    for (const n of ['calculate', 'think_deeper', 'save_price_watch', 'present_plan']) expect(toolGateQuery(n, {})).toBeNull()
  })
})

describe('wrapToolsWithMarketGate', () => {
  it('🔑 default registry + Vietnam: every market-bound tool runs exactly as before (nothing visible changes)', async () => {
    const { tools, calls } = mk()
    wrapToolsWithMarketGate(tools, { marketId: 'vn' }, DEFAULT_REGISTRY)
    for (const n of MARKET_GATED_TOOLS) expect(await tools[n].execute({ query: 'x' })).toMatchObject({ ok: true, name: n })
    expect(calls.length).toBe(MARKET_GATED_TOOLS.length)
  })
  it('🔑 an unlisted market is refused BEFORE the tool runs, with a result (not a throw) that says what to do', async () => {
    const { tools, calls } = mk()
    const orig = tools.search_places.execute
    wrapToolsWithMarketGate(tools, { marketId: 'th', userNamedMarket: true }, DEFAULT_REGISTRY)
    const r = await tools.search_places.execute({ query: 'pad thai' }) as { error?: string; reason?: string }
    expect(r.error).toBe('market_unavailable')
    expect(r.reason).toBe('UNKNOWN_MARKET')
    expect(orig).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
  it('🔑 no market at all is refused (fail closed)', async () => {
    const { tools, calls } = mk()
    wrapToolsWithMarketGate(tools, { marketId: null }, DEFAULT_REGISTRY)
    expect((await tools.web_search.execute({ query: 'x' }) as { reason?: string }).reason).toBe('NO_MARKET')
    expect(calls).toEqual([])
  })
  it('a vertical the registry marks UNAVAILABLE is refused while the others still run', async () => {
    const reg: Registry = { markets: DEFAULT_REGISTRY.markets, coverage: DEFAULT_REGISTRY.coverage.map(r => (r.vertical === 'hotels' ? { ...r, coverage: 'UNAVAILABLE' as const } : r)) }
    const { tools } = mk()
    wrapToolsWithMarketGate(tools, { marketId: 'vn' }, reg)
    expect((await tools.get_hotel_prices.execute({}) as { reason?: string }).reason).toBe('COVERAGE_UNAVAILABLE')
    expect(await tools.get_news.execute({})).toMatchObject({ ok: true })
  })
  it('a tool that is not market-bound is untouched even for an unlisted market', async () => {
    const { tools, calls } = mk()
    wrapToolsWithMarketGate(tools, { marketId: null }, DEFAULT_REGISTRY)
    await tools.calculate.execute({}); await tools.save_price_watch.execute({})
    expect(calls).toEqual(['calculate', 'save_price_watch'])
  })
})
