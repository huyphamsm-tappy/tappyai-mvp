// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { MAX_AGE_MINUTES, VOLATILE, dataClassOf, freshnessOf, withFreshness, classifyFramePrices, pricesIn, vnClock } from './freshness'
import { noFabricationGate, buildIndex } from './noFabricationGate'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './agent/runtime/loop'
import { AgentRunTrace } from './agent/runtime/trace'
import { guardToolOutput } from './agent/guards'

const NOW = new Date('2026-10-09T10:00:00Z')
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

describe('freshness policy — by KIND of data, not one TTL', () => {
  it('limits differ by class and the volatile set is the money-like data', () => {
    expect(MAX_AGE_MINUTES.market).toBe(15)
    expect(MAX_AGE_MINUTES.price).toBe(360)
    expect(MAX_AGE_MINUTES.spec).toBe(30 * 24 * 60)
    expect(new Set(MAX_AGE_MINUTES ? Object.values(MAX_AGE_MINUTES) : []).size).toBeGreaterThan(4)
    expect([...VOLATILE].sort()).toEqual(['availability', 'market', 'news', 'price'])
  })
  it('the class comes from the TOOL (and web_search\'s declared kind) — never from the user\'s words', () => {
    expect(dataClassOf('search_products')).toBe('price')
    expect(dataClassOf('get_gold_price')).toBe('market')
    expect(dataClassOf('search_places')).toBe('place')
    expect(dataClassOf('web_search', { kind: 'price' })).toBe('price')
    expect(dataClassOf('web_search', { kind: 'spec' })).toBe('spec')
    expect(dataClassOf('web_search', {})).toBe('general')
    expect(dataClassOf('read_page')).toBeNull()
    expect(dataClassOf('update_task')).toBeNull()
  })
  it('status: fresh within the limit, stale beyond it, unknown without a usable time; a future time is fresh with age 0', () => {
    expect(freshnessOf('market', minAgo(14), NOW).status).toBe('fresh')
    expect(freshnessOf('market', minAgo(16), NOW).status).toBe('stale')
    expect(freshnessOf('price', minAgo(359), NOW).status).toBe('fresh')
    expect(freshnessOf('price', minAgo(361), NOW).status).toBe('stale')
    expect(freshnessOf('spec', minAgo(20 * 24 * 60), NOW).status).toBe('fresh') // the same age that is stale for a price
    expect(freshnessOf('price', undefined, NOW)).toEqual({ data_class: 'price', status: 'unknown', max_age_minutes: 360 })
    expect(freshnessOf('price', 'not a date', NOW).status).toBe('unknown')
    expect(freshnessOf('price', minAgo(-30), NOW)).toMatchObject({ status: 'fresh', age_minutes: 0 })
  })
  it('withFreshness: tracked + evidence only; failures, non-objects and untracked tools are untouched; never replaces', () => {
    const ok = withFreshness({ results: [1], retrieved_at: minAgo(10) }, 'search_products', {}, 'SUCCESS', NOW) as { freshness: { status: string; age_minutes: number } }
    expect(ok.freshness).toMatchObject({ status: 'fresh', age_minutes: 10 })
    for (const state of ['TIMEOUT', 'ERROR', 'UNAVAILABLE', 'EMPTY']) expect(withFreshness({ results: [] }, 'search_products', {}, state, NOW)).toEqual({ results: [] })
    expect(withFreshness([1], 'search_products', {}, 'SUCCESS', NOW)).toEqual([1])
    expect(withFreshness({ a: 1 }, 'read_page', {}, 'SUCCESS', NOW)).toEqual({ a: 1 })
    const pre = { freshness: { status: 'fresh' } }
    expect(withFreshness(pre, 'search_products', {}, 'SUCCESS', NOW)).toBe(pre)
    expect((withFreshness({ results: [1] }, 'search_products', {}, 'SUCCESS', NOW) as { freshness: { status: string } }).freshness.status).toBe('unknown')
  })
  it('the stamp survives the output guard (the model and the client both see it)', () => {
    const r = withFreshness({ results: [{ title: 'x' }], retrieved_at: minAgo(5) }, 'search_products', {}, 'SUCCESS', NOW)
    const g = guardToolOutput(r)
    expect(JSON.stringify(g.forModel)).toContain('retrieved_at')
    expect(JSON.stringify(g.forModel)).toContain('"freshness"')
    expect(JSON.stringify(g.forClient)).toContain('retrieved_at')
  })
  it('vnClock renders Vietnam time', () => { expect(vnClock('2026-10-09T10:00:00Z')).toBe('17:00 09/10') })
})

describe('prices behind a frame, split by the frame\'s own freshness', () => {
  const frame = (fresh: object | undefined, extra: Record<string, unknown> = {}) => JSON.stringify({ toolCallId: 't', result: { results: [{ title: 'iPhone 16', price: 19990000, snippet: 'Giá từ 18,5 triệu' }], ...(fresh ? { freshness: fresh } : {}), ...extra } })
  it('pricesIn reads price-keyed numbers and money written in strings, and ignores the timestamp fields', () => {
    const p = pricesIn({ results: [{ price: 19990000, snippet: 'Giá từ 18,5 triệu' }], retrieved_at: '2026-10-09T10:00:00Z', freshness: { age_minutes: 1234567 } })
    expect(p).toEqual(expect.arrayContaining([19990000, 18500000]))
    expect(p).not.toContain(1234567)
  })
  it('stale / unknown volatile frames → aged (with the time when known); fresh → fresh; non-volatile and untracked → nothing', () => {
    const stale = classifyFramePrices(frame({ data_class: 'price', status: 'stale', retrieved_at: minAgo(900), max_age_minutes: 360 }))
    expect(stale.fresh).toEqual([])
    expect(stale.aged.map(x => x.amount)).toEqual(expect.arrayContaining([19990000]))
    expect(stale.aged[0].at).toBe(minAgo(900))
    expect(classifyFramePrices(frame({ data_class: 'price', status: 'unknown', max_age_minutes: 360 })).aged[0].at).toBeNull()
    expect(classifyFramePrices(frame({ data_class: 'price', status: 'fresh', retrieved_at: minAgo(5), max_age_minutes: 360 })).fresh).toContain(19990000)
    expect(classifyFramePrices(frame({ data_class: 'place', status: 'stale', max_age_minutes: 4320 }))).toEqual({ aged: [], fresh: [] })
    expect(classifyFramePrices(frame(undefined))).toEqual({ aged: [], fresh: [] })
    expect(classifyFramePrices('not json')).toEqual({ aged: [], fresh: [] })
  })
})

describe('No-Fabrication Gate — aged prices are kept and disclosed once; timestamps are not evidence', () => {
  const corpus = [JSON.stringify({ results: [{ title: 'iPhone 16 128GB', price: 19990000, snippet: 'Giá 19.990.000đ' }], retrieved_at: '2026-10-08T20:00:00Z', freshness: { data_class: 'price', status: 'stale' } })]
  const ev = (over: object = {}) => ({ corpus, userTexts: ['iPhone 16 giá bao nhiêu'], tools: ['search_products'], ...over })
  const reply = 'iPhone 16 128GB đang bán 19.990.000đ ở shop A.'

  it('stale source: the sentence stays, ONE note names the fetch time and says it may have changed', () => {
    const r = noFabricationGate(reply, ev({ agedPrices: [{ amount: 19990000, at: '2026-10-08T20:00:00Z' }] }))
    expect(r.text).toContain('iPhone 16 128GB đang bán 19.990.000đ ở shop A.')
    expect(r.text).toMatch(/Lưu ý: giá ở trên lấy từ kết quả tra lúc 03:00 09\/10, có thể đã thay đổi/)
    expect(r.removedSentences).toBe(0)
    expect((r.text.match(/Lưu ý:/g) ?? []).length).toBe(1)
  })
  it('unknown time: the note says nobody knows when', () => {
    const r = noFabricationGate(reply, ev({ agedPrices: [{ amount: 19990000, at: null }] }))
    expect(r.text).toMatch(/chưa rõ giá ở trên được lấy lúc nào, có thể đã thay đổi/)
  })
  it('no note when the price is also in a FRESH source, when the sentence carries its own time qualifier, or when the user said it', () => {
    expect(noFabricationGate(reply, ev({ agedPrices: [{ amount: 19990000, at: null }], freshPrices: [19990000] })).text).toBe(reply)
    const q = 'Theo kết quả tra năm 2025, iPhone 16 128GB có giá 19.990.000đ ở shop A.'
    expect(noFabricationGate(q, ev({ agedPrices: [{ amount: 19990000, at: null }] })).text).toBe(q)
    expect(noFabricationGate('Bạn nói 19.990.000đ phải không, mình thấy shop A cũng bán 19.990.000đ.', ev({ agedPrices: [{ amount: 19990000, at: null }], userTexts: ['mình thấy giá 19.990.000đ'] })).text).not.toMatch(/Lưu ý/)
  })
  it('a price that is NOT in the evidence is still fabricated (the aged path never makes something up supported)', () => {
    const r = noFabricationGate('iPhone 16 128GB đang bán 14.990.000đ ở shop A.', ev({ agedPrices: [{ amount: 19990000, at: null }] }))
    expect(r.removedSentences).toBe(1)
  })
  it('timestamp digits never support a figure: a reply number equal to a part of retrieved_at is still unsupported', () => {
    const c = [JSON.stringify({ results: [{ title: 'Quán A' }], retrieved_at: '2026-10-08T20:41:00Z', freshness: { data_class: 'place', age_minutes: 41 } })]
    const ix = buildIndex({ corpus: c, userTexts: [], tools: [] })
    expect(ix.nums).not.toContain(41)
    expect(ix.nums).not.toContain(2026)
    expect(ix.times.size).toBe(0)
  })
})

describe('settle path (agent collector): frames with stale freshness reach the gate', () => {
  const frameResult = (fresh: object) => ({ results: [{ title: 'iPhone 16 128GB - Shop A', link: 'https://shop.example/a', snippet: 'Giá 19.990.000đ', price: 19990000 }], retrieved_at: '2026-10-08T20:00:00Z', freshness: fresh })
  async function run(fresh: object, prose: string) {
    const collector = createEnrichmentCollector('iPhone 16 giá bao nhiêu')
    collector.agentMode = true
    collector.semanticRanking = true
    const frames = ['9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["iphone 16 giá"],"kind":"price"}}', 'a:' + JSON.stringify({ toolCallId: 't1', result: frameResult(fresh) }), '0:' + JSON.stringify(prose), 'd:{"finishReason":"stop"}']
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'iPhone 16 giá bao nhiêu', false)
    const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
    return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }
  const prose = 'iPhone 16 128GB ở Shop A đang có giá 19.990.000đ.'
  it('stale frame → the price stays and ONE disclosure with the fetch time follows', async () => {
    const text = await run({ data_class: 'price', status: 'stale', retrieved_at: '2026-10-08T20:00:00Z', age_minutes: 840, max_age_minutes: 360 }, prose)
    expect(text).toContain('19.990.000đ')
    expect(text).toMatch(/Lưu ý: giá ở trên lấy từ kết quả tra lúc 03:00 09\/10/)
  })
  it('fresh frame → no disclosure', async () => {
    const text = await run({ data_class: 'price', status: 'fresh', retrieved_at: '2026-10-08T20:00:00Z', age_minutes: 5, max_age_minutes: 360 }, prose)
    expect(text).toContain('19.990.000đ')
    expect(text).not.toMatch(/Lưu ý: giá ở trên/)
  })
})

describe('loop — the model reads the freshness of every tracked tool result', () => {
  it('a stamped result gets status fresh/stale; an unstamped one unknown; the trace records it; failures get none', async () => {
    const seenByModel: string[] = []
    const steps: RuntimeStep[] = [
      { text: '', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, toolCalls: [{ toolCallId: 'a', toolName: 'search_products', args: { query: 'iphone 16' } }, { toolCallId: 'b', toolName: 'get_gold_price', args: {} }] },
      { text: 'Xong.', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, toolCalls: [] },
    ]
    const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
    const input: RuntimeInput = {
      system: 'S', messages: [{ role: 'user', content: 'u' }],
      tools: {
        search_products: { execute: async () => ({ results: [{ title: 'x', price: 1000000 }], retrieved_at: new Date(Date.now() - 20 * 3_600_000).toISOString() }) },
        get_gold_price: { execute: async () => ({ results: [{ brand: 'SJC', buy: 1 }] }) },
      } as never,
      schemas: { search_products: {}, get_gold_price: {} },
      callModel: async o => { seenByModel.push(JSON.stringify(o.messages)); return steps.shift()! },
      deadlineAt: Date.now() + 85_000, lang: 'vi', trace,
    }
    await runAgentRuntime(input)
    const toolMsg = seenByModel[1]
    expect(toolMsg).toMatch(/"data_class":"price","status":"stale"/)
    expect(toolMsg).toMatch(/"data_class":"market","status":"unknown"/)
    const results = trace.events.filter(e => e.kind === 'tool_result').map(e => [e.tool, e.freshness])
    expect(results).toEqual(expect.arrayContaining([['search_products', 'stale'], ['get_gold_price', 'unknown']]))
  })
})

describe('multi-query web_search: the merged list is as old as its oldest part', () => {
  const mk = async (parts: Array<Record<string, unknown>>) => {
    const { researchSearchTool } = await import('./agent/runtime/researchSearch')
    let i = 0
    const base = async () => parts[i++ % parts.length]
    const reader = { readMany: async () => [], failedHosts: () => new Set<string>(), progress: () => ({}) }
    const t = researchSearchTool({ base: base as never, reader: reader as never, allow: () => {}, lang: 'vi' }) as unknown as { execute: (a: unknown, c: unknown) => Promise<Record<string, unknown>> }
    return t.execute({ queries: ['a', 'b'] }, {})
  }
  const row = (n: number) => [{ title: `r${n}`, link: `https://x${n}.example/p`, snippet: 's' }]
  it('two stamped parts → the OLDER time', async () => {
    const out = await mk([{ results: row(1), retrieved_at: '2026-10-09T09:00:00.000Z' }, { results: row(2), retrieved_at: '2026-10-09T03:00:00.000Z' }])
    expect(out.retrieved_at).toBe('2026-10-09T03:00:00.000Z')
  })
  it('one part without a usable time → the merged list has NO stamp (unknown), never the other part\'s time', async () => {
    const out = await mk([{ results: row(1), retrieved_at: '2026-10-09T09:00:00.000Z' }, { results: row(2) }])
    expect('retrieved_at' in out).toBe(false)
  })
})
