// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// A realtime question whose figure no source stated: the guards cut it, ONE "chưa xác minh" sentence is added, and — when no page was read —
// the held search-result links become the source buttons under it. A figure a source DOES state is kept and nothing is added.

const U = 'https://vnexpress.net/gia-xang-dau-moi-nhat-hom-nay-8-10-5129901.html'
const Q = 'Giá xăng RON 95-III hôm nay bao nhiêu một lít?'

async function run(text: string, o: { flag: boolean; evidence?: string[] }) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  if (o.flag) collector.consultative = true
  collector.unverifiedSources = [{ id: 'S1', host: 'vnexpress.net', url: U }]
  if (o.evidence) collector.guardEvidence = { sources: [{ id: 'S1', host: 'vnexpress.net', sourceType: 'news' as never, passages: o.evidence }], conflicts: [], carried: [], constraintsSig: null, userText: Q } as never
  const frames = [
    '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["x"]}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [{ title: 'a', link: U }] } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, Q, true, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('forced "chưa xác minh" sentence with held source buttons (flag on)', () => {
  const unsourced = 'Xăng RON 95-III hôm nay giá 29.999 đồng/lít [S1].'
  it('a figure the source does NOT state is still cut; one sentence + the held link follow', async () => {
    const out = await run(unsourced, { flag: true, evidence: ['Xăng E10 RON 95-III được niêm yết ở 28.250 đồng/lít.'] })
    expect(out).not.toContain('29.999')
    expect(out.match(/chưa xác minh được số này/g)).toHaveLength(1)
    expect(out).toContain(`](${U})`)
  })
  it('a figure the source states is kept: no sentence added', async () => {
    const out = await run('Xăng E10 RON 95-III hôm nay giá 28.250 đồng/lít [S1].', { flag: true, evidence: ['Xăng E10 RON 95-III được niêm yết ở 28.250 đồng/lít.'] })
    expect(out).toContain('28.250')
    expect(out).not.toContain('chưa xác minh được số này')
  })
  it('CONTROL — flag off: no added sentence', async () => {
    const out = await run(unsourced, { flag: false, evidence: ['Xăng E10 RON 95-III được niêm yết ở 28.250 đồng/lít.'] })
    expect(out).not.toContain('chưa xác minh được số này')
  })
})
