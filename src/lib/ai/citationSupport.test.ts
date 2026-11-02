import { describe, it, expect } from 'vitest'
import { distinctiveTokens, supportedBy, checkCitationSupport } from './citationSupport'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// CONSULT_V3 (UAT 17/10, the "bát – đũa – bật lửa" trend): a source chip only where the page's passages hold the sentence.

const PUN = 'Đó là câu chơi chữ: “碗上筷火” đọc lái thành “晚上快活”, nghĩa là “tối nay vui vẻ” [S2].'
const PAGE_WITH = ['網友解釋，碗上筷火諧音晚上快活，是情侶之間的暗示。']
const PAGE_WITHOUT = ['正妹上廁所留下神秘暗示，老司機看了秒懂。網友熱議。']

describe('citationSupport (unit)', () => {
  it('distinctive tokens: Han runs, multi-digit numbers, quoted terms', () => {
    expect(distinctiveTokens(PUN)).toEqual(['碗上筷火', '晚上快活', 'tối nay vui vẻ'])
    expect(distinctiveTokens('Giá 9.000 đồng cho gói 6 giờ [S1].')).toEqual(['9.000'])
    expect(distinctiveTokens('Quán này đẹp lắm [S1].')).toEqual([])
  })
  it('supported when the page holds at least two of the tokens (or the only one); not judged without tokens or without passages', () => {
    expect(supportedBy(PUN, PAGE_WITH)).toBe(true)
    expect(supportedBy(PUN, PAGE_WITHOUT)).toBe(false)
    // a page holding only ONE of the sentence's tokens (the target phrase, not the pun itself) does not support the explanation
    expect(supportedBy(PUN, ['今晚想要晚上快活一下嗎？'])).toBe(false)
    expect(supportedBy('Quán này đẹp lắm [S1].', PAGE_WITHOUT)).toBe(true)
    expect(supportedBy(PUN, [])).toBe(true)
    expect(supportedBy('Gói 6 giờ giá 9.000 đồng [S1].', ['Viettel ra gói 5G 6 giờ giá 9.000 đồng'])).toBe(true)
  })
  it('an unsupported marker is removed; the supported one stays; hadMarkers / keepIds say what remains', () => {
    const r = checkCitationSupport(`${PUN} Còn đây là chuyện khác “晚上快活” [S1].`, [{ id: 'S1', passages: PAGE_WITH }, { id: 'S2', passages: PAGE_WITHOUT }])
    expect(r.text).not.toContain('[S2]')
    expect(r.text).toContain('[S1]')
    expect([...r.keepIds]).toEqual(['S1'])
    expect(r.dropped).toEqual([{ id: 'S2', tokens: 3 }])
    expect(r.hadMarkers).toBe(true)
  })
})

describe('citationSupport at the enrichment site (A/B on CONSULT_V3)', () => {
  async function settle(v3: boolean, passages: string[]) {
    const collector = createEnrichmentCollector('trend bát đũa bật lửa nghĩa là gì')
    collector.agentMode = true
    collector.consultative = true
    collector.consultV3 = v3
    const yahoo = 'https://tw.news.yahoo.com/meme-123.html'
    const gov = 'https://www.changzhi.gov.cn/x.html'
    collector.citationSources = [
      { id: 'S1', url: gov, host: 'changzhi.gov.cn', label: 'changzhi.gov.cn', title: 'x', source_type: 'OFFICIAL_GOVERNMENT', action_type: 'WEBSITE' },
      { id: 'S2', url: yahoo, host: 'tw.news.yahoo.com', label: 'tw.news.yahoo.com', title: 'meme', source_type: 'OTHER', action_type: 'SOURCE' },
    ] as never
    collector.guardEvidence = { sources: [{ id: 'S1', host: 'changzhi.gov.cn', passages: ['長治市政府公告'] }, { id: 'S2', host: 'tw.news.yahoo.com', passages }], conflicts: [], carried: [], stalePrices: [], freshPrices: [] } as never
    const frames = [
      '9:{"toolCallId":"t1","toolName":"web_search","args":{"queries":["碗上筷火"]}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [{ title: 'meme', link: yahoo, snippet: 'x' }, { title: 'gov', link: gov, snippet: 'y' }] } }),
      '0:' + JSON.stringify(PUN),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'trend bát đũa bật lửa nghĩa là gì', false)
    return (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }
  it('V3 on, the page does not hold the pun: no Yahoo chip, and no "Nguồn:" fallback bringing it (or the unrelated gov page) back', async () => {
    const out = await settle(true, PAGE_WITHOUT)
    expect(out).not.toContain('tw.news.yahoo.com')
    expect(out).not.toContain('changzhi.gov.cn')
    expect(out).toContain('晚上快活')
  })
  it('V3 on, the page holds the pun: the Yahoo chip stays', async () => {
    const out = await settle(true, PAGE_WITH)
    expect(out).toContain('(https://tw.news.yahoo.com/meme-123.html)')
  })
  it('V3 off (control): the chip is attached as before, supported or not', async () => {
    const out = await settle(false, PAGE_WITHOUT)
    expect(out).toContain('(https://tw.news.yahoo.com/meme-123.html)')
  })
})
