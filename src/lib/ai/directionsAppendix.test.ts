// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { directionsAppendix } from './directionsAppendix'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// CONSULTATIVE_IN_AGENT — "chỉ đường tới X" with no card still gets the code-built Directions link (round 9: the card was cleared, so the card button
// never showed). Pinned both ways: flag on adds it only when the user asked for directions and a retrieved row with an address is named; flag off adds nothing.

const CHURCH = { name: 'Nhà thờ Đức Bà Sài Gòn', address: '01 Công xã Paris, Bến Nghé, Quận 1, TP.HCM', place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }

describe('directionsAppendix (pure)', () => {
  it('a directions request naming a retrieved row gives ONE https Google Maps directions link built from that row', () => {
    const d = directionsAppendix({ userText: 'Mình đang ở Quận 3. Chỉ đường giúp mình tới Nhà thờ Đức Bà Sài Gòn nhé', rows: [CHURCH, { name: 'Bưu điện Trung tâm', address: '2 Công xã Paris, Quận 1' }] })
    expect(d?.text).toBe('Chỉ đường:')
    expect(d?.links).toHaveLength(1)
    const u = new URL(d!.links[0].url)
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('destination')).toBe('Nhà thờ Đức Bà Sài Gòn, 01 Công xã Paris, Bến Nghé, Quận 1, TP.HCM')
    expect(u.searchParams.get('destination_place_id')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
    expect(d!.links[0].name).toBe('Chỉ đường tới Nhà thờ Đức Bà Sài Gòn (Google Maps)')
  })

  it('NOT for a question about hours / price / reviews, for a place the user did not name, or a row with nothing to anchor on', () => {
    expect(directionsAppendix({ userText: 'Nhà thờ Đức Bà Sài Gòn mở cửa mấy giờ?', rows: [CHURCH] })).toBeNull()
    expect(directionsAppendix({ userText: 'Chỉ đường giúp mình tới chợ Bến Thành', rows: [CHURCH] })).toBeNull()
    expect(directionsAppendix({ userText: 'Chỉ đường tới Quán Không Địa Chỉ', rows: [{ name: 'Quán Không Địa Chỉ' }] })).toBeNull()
    expect(directionsAppendix({ userText: '', rows: [CHURCH] })).toBeNull()
  })

  it('English wording', () => {
    expect(directionsAppendix({ userText: 'How do I get to Nhà thờ Đức Bà Sài Gòn?', rows: [CHURCH], lang: 'en' })?.links[0].name).toBe('Directions to Nhà thờ Đức Bà Sài Gòn (Google Maps)')
  })
})

describe('through the stream filter', () => {
  const ASK = 'Mình đang ở Quận 3, TP.HCM. Chỉ đường giúp mình tới Nhà thờ Đức Bà Sài Gòn, nhà thờ mở cửa mấy giờ?'
  async function run(flag: boolean) {
    const result = { source: 'serper_maps', count: 1, results: [{ ...CHURCH, rating_value: 4.7, rating_count: 3000 }], _tappy_place_domain: 'place' }
    const collector = createEnrichmentCollector(ASK)
    collector.add(result.results as never)
    collector.agentMode = true; collector.semanticRanking = true
    if (flag) collector.consultative = true
    const frames = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"Nhà thờ Đức Bà Sài Gòn","location":"Quận 1"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result }),
      '0:' + JSON.stringify('Từ Quận 3 bạn đi theo đường Nam Kỳ Khởi Nghĩa về Công xã Paris; giờ vào bên trong chưa xác minh được.'),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, false, ASK, true, (async () => ({ perPlace: new Map(), batch: null })) as never, 'Quận 1')
    const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
    return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }

  it('flag ON: the reply ends with the Chỉ đường block and its https link', async () => {
    const out = await run(true)
    expect(out).toContain('Chỉ đường:')
    // (the shared label escaper drops the parentheses of the label)
    expect(out).toMatch(/\[Chỉ đường tới Nhà thờ Đức Bà Sài Gòn Google Maps\]\(https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
    expect(out).toContain('&destination_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4)')
  })

  it('CONTROL — flag OFF: no directions block, as before', async () => {
    const out = await run(false)
    expect(out).not.toContain('Chỉ đường:')
    expect(out).not.toContain('maps/dir')
  })
})
