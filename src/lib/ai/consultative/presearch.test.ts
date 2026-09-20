import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { planPresearch, presearchMessages, presearchFrames, prefixBody, type PresearchOutcome } from './presearch'
import { deriveSituation } from './situationFrame'

// ─────────────────────────────────────────────────────────────────────────────
// A1(c) — THE ROUTE RUNS THE FIRST SEARCH, THE MODEL WRITES THE PROSE.
//
// Step 1 of a place turn (≈6–7.7 s measured) only emitted the tool call the
// search-now directive already named. The pre-search runs that call before the
// model and hands over a completed tool-call / tool-result pair; the client
// stream gets the same `9:` / `a:` frames. These pin the plan (arguments come
// from the directive and the frame only), the two message shapes, the frame
// bytes, and the stream prefix.
// ─────────────────────────────────────────────────────────────────────────────

const need = { budget: null as never, location: { text: 'Quận 1', gps: null } }
const situation = deriveSituation(['ăn gì ngon giờ — dưới 100k/người'], need, { hasGps: true })

describe('planPresearch', () => {
  it('a place directive becomes the call: query + type, and the stated area when there is one', () => {
    const plan = planPresearch({ query: 'quán ăn tối ngon', type: 'restaurant', exact: true }, situation)
    expect(plan).toEqual({ toolName: 'search_places', args: { query: 'quán ăn tối ngon', type: 'restaurant', location: 'Quận 1' }, exact: true })
  })
  it('no area stated ⇒ no location argument (the tool centres on GPS)', () => {
    const s = deriveSituation(['ăn gì ngon giờ'], { budget: null as never, location: { text: null, gps: null } }, { hasGps: true })
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, s)?.args).toEqual({ query: 'quán ăn ngon', type: 'restaurant' })
  })
  it('never for shopping or hotels (their turns keep the model step), never without a directive, never on clip / plan / movie turns', () => {
    expect(planPresearch({ query: 'nước hoa', type: 'product', exact: true }, situation)).toBeNull()
    expect(planPresearch({ query: 'Phú Quốc', type: 'hotel', exact: false }, situation)).toBeNull()
    expect(planPresearch(null, situation)).toBeNull()
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, null)).toBeNull()
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, situation, { clip: true })).toBeNull()
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, situation, { planning: true })).toBeNull()
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, situation, { movie: true })).toBeNull()
  })
})

const outcome: PresearchOutcome = { toolCallId: 'presearch_abc', toolName: 'search_places', args: { query: 'quán ăn ngon', type: 'restaurant', location: 'Quận 1' }, result: { source: 'serper_maps', count: 1, results: [{ name: 'Quán A' }] }, ms: 1200 }

describe('what the model and the client receive', () => {
  it('the model gets an assistant tool-call and a tool result, in that order, with the same id', () => {
    const ms = presearchMessages(outcome)
    expect(ms.map(m => m.role)).toEqual(['assistant', 'tool'])
    expect(ms[0].content).toEqual([{ type: 'tool-call', toolCallId: 'presearch_abc', toolName: 'search_places', args: outcome.args }])
    expect(ms[1].content).toEqual([{ type: 'tool-result', toolCallId: 'presearch_abc', toolName: 'search_places', result: outcome.result }])
  })
  it('the client gets the SDK\'s own frame shapes: 9: (call) then a: (result)', () => {
    const f = presearchFrames(outcome)
    const [l9, la, rest] = f.split('\n')
    expect(rest).toBe('')
    expect(JSON.parse(l9.slice(2))).toEqual({ toolCallId: 'presearch_abc', toolName: 'search_places', args: outcome.args })
    expect(JSON.parse(la.slice(2))).toEqual({ toolCallId: 'presearch_abc', result: outcome.result })
    expect(l9.startsWith('9:') && la.startsWith('a:')).toBe(true)
  })
  it('prefixBody yields the frames first, then the model stream, byte for byte', async () => {
    const enc = new TextEncoder()
    const model = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('0:"Mình chọn"\n')); c.enqueue(enc.encode('d:{"finishReason":"stop"}\n')); c.close() } })
    const text = await new Response(prefixBody(presearchFrames(outcome), model)).text()
    expect(text).toBe(presearchFrames(outcome) + '0:"Mình chọn"\nd:{"finishReason":"stop"}\n')
  })
  it('route.ts wires it: the plan from the directive, the frames onto the response, the pair into the model messages, the count into usage', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/let presearchPlan = consultativeV1 \? planPresearch\(searchNow, situation/)
    expect(route).toMatch(/search_places\.execute\(presearchPlan\.args/)
    expect(route).toMatch(/prefixBody\(presearchFrames\(presearchOutcome\), sdkResponse\.body\)/)
    expect(route).toMatch(/\[\.\.\.modelMessages, \.\.\.presearchMessages\(presearchOutcome\)\]/)
    expect(route).toMatch(/\+ \(presearchOutcome \? 1 : 0\)/)
  })
})
