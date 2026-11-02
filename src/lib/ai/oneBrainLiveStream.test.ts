// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// ── 31/10 latency: a one-brain answer streams as it is written ───────────────────────────────────────────────────────────────────────
//
// Measured on localhost 31/10 (run-turns, client-side frame times): every one-brain answer arrived in one or two text frames AT THE END
// (T03: 1 847 characters in one frame at 12.0 s; the model had been writing for 7.5 s). The start-of-turn reason was the Consultative V1
// frame - set from a keyword reading of the question - whose prose guards are already off on one brain. On one brain the tools decide
// the hold; an answer without a price / travel / place / product / plan tool streams through the live egress filter.

const Q = 'Mówi się, że Wielki Wybuch stworzył Ziemię, prawda?'
// the shape the route sets (route.ts, setConsultativeV1)
const v1 = { on: true, rendersCard: false, namedRefetch: [], referenced: [], carried: [], hardGaps: [], budgetGap: false, budget: null, priorTimes: [] } as never

async function textFrames(frames: string[], oneBrain: boolean): Promise<string[]> {
  const collector = createEnrichmentCollector(Q)
  collector.setConsultativeV1(v1)
  if (oneBrain) collector.oneBrain = true
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:') && l !== '0:""').map(l => JSON.parse(l.slice(2)) as string)
}

const DELTAS = ['Nie całkiem: Wielki Wybuch nie stworzył Ziemi bezpośrednio.\n\n', 'Opisuje wczesny etap Wszechświata sprzed 13,8 mld lat.\n\n', 'Ziemia powstała około 4,6 mld lat temu.\n']
const turn = (extra: string[] = []) => [...extra, ...DELTAS.map(d => '0:' + JSON.stringify(d)), 'd:{"finishReason":"stop"}']

describe('one brain: the V1 frame does not hold the answer back', () => {
  it('a one-brain answer with no hold-worthy tool leaves in several frames (live), with every word', async () => {
    const on = await textFrames(turn(), true)
    expect(on.length).toBeGreaterThan(1)
    expect(on.join('')).toBe(DELTAS.join(''))
  })
  it('the old route with the same V1 frame still buffers it into one frame (unchanged)', async () => {
    const off = await textFrames(turn(), false)
    expect(off).toHaveLength(1)
  })
  it('a one-brain turn that calls a fare tool is still held (the travel guard reads the whole answer)', async () => {
    const call = '9:' + JSON.stringify({ toolCallId: 't1', toolName: 'get_flight_prices', args: { origin: 'SGN', destination: 'BKK' } })
    const res = 'a:' + JSON.stringify({ toolCallId: 't1', result: { fare_status: 'not_verified', booking_links: [] } })
    const held = await textFrames(turn([call, res]), true)
    expect(held).toHaveLength(1)
  })
})
