// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// answer_first (moves a leading question to the end) and clarification (drops reflex questions) are voice-shaping, not fact guards:
// off under CONSULTATIVE_IN_AGENT, unchanged without it.

const Q = 'Mình muốn đi biển cuối tuần, gợi ý giúp mình nhé.'
const TEXT = 'Để gợi ý đúng ý bạn, mình cần biết: bạn muốn đi biển nào hơn?\n\nMình gợi ý bạn đi Vũng Tàu: biển gần, đi về trong ngày được, có nhiều quán hải sản để thử.'

async function run(flag: boolean) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  if (flag) collector.consultative = true
  const frames = ['9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}', 'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [] } }), '0:' + JSON.stringify(TEXT), 'd:{"finishReason":"stop"}']
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, true, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('voice-shaping filters are off under the flag', () => {
  it('flag off: the leading question is moved/dropped as before', async () => {
    const out = await run(false)
    expect(out.indexOf('mình cần biết')).not.toBe(0)
  })
  it('flag on: the model\'s own order and question stay as written', async () => {
    const out = await run(true)
    expect(out).toContain('Để gợi ý đúng ý bạn, mình cần biết: bạn muốn đi biển nào hơn?')
    expect(out.indexOf('Để gợi ý đúng ý bạn')).toBeLessThan(out.indexOf('Mình gợi ý bạn đi Vũng Tàu'))
  })
})
