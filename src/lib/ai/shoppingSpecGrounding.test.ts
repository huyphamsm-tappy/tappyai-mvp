import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPEC GUARD, ON THE PATH PRODUCTION ACTUALLY TAKES.
//
// 🚨 THE DEFECT THIS PINS. The guard's evidence was collected from
// `res.result.shopping_results`, but `searchProducts` puts the structured rows
// in `search_results` whenever Serper's /shopping endpoint answers — the primary
// path — and emits no `shopping_results` key at all. So on every live shopping
// turn the evidence array was empty, the guard was skipped for want of
// candidates, and a measured localhost reply shipped:
//
//     "Máy này nhẹ, pin tốt, màn hình cảm ứng, phù hợp làm việc văn phòng"
//
// A weight claim and a battery claim — the two attributes the guard exists to
// stop, and the two Serper never returns.
//
// These tests drive the real stream filter, not the guard in isolation, because
// the wiring was the bug.
// ─────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)

async function run(lines: string[]): Promise<string> {
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(lines.join('\n') + '\n'), 'vi', createEnrichmentCollector())
  return await new Response(res.body).text()
}

const reply = (out: string) =>
  out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

/** The PRIMARY path: rows in `search_results`, no `shopping_results` key. */
const primary = (rows: unknown[]) => [
  '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"laptop 20 trieu"}}',
  'a:' + JSON.stringify({ toolCallId: 't1', result: { query: 'laptop 20 trieu', source: 'Google Shopping (Serper)', search_results: rows } }),
]

/** The organic FALLBACK path: structured rows in `shopping_results`. */
const fallback = (rows: unknown[]) => [
  '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"laptop 20 trieu"}}',
  'a:' + JSON.stringify({ toolCallId: 't1', result: { query: 'laptop 20 trieu', source: 'Google Search (Serper)', shopping_results: rows, search_results: [] } }),
]

const DELL = { title: 'Laptop Dell 15 DC15250', link: 'https://tiki.vn/dell', price_vnd: 16_990_000, source: 'Tiki' }
const END = 'd:{"finishReason":"stop"}'

describe('spec guard — the primary provider path feeds it', () => {
  it('🚨 removes an unattributed weight AND battery claim, the measured defect', async () => {
    const out = reply(await run([
      ...primary([DELL]),
      line0('Máy này nhẹ, pin tốt, màn hình cảm ứng, phù hợp làm việc văn phòng.'),
      END,
    ]))
    expect(out).not.toMatch(/nhẹ/)
    expect(out).not.toMatch(/pin tốt/)
    // Only the ungrounded clauses go. The screen is not an attribute this guard
    // governs and the row said nothing to contradict it.
    expect(out).toMatch(/màn hình cảm ứng/i)
  })

  it('🚨 removes a claim attributed to the product by name', async () => {
    const out = reply(await run([
      ...primary([DELL]),
      line0('**Laptop Dell 15 DC15250** — 16.99 triệu. Máy nhẹ và pin rất lâu.'),
      END,
    ]))
    expect(out).toContain('Laptop Dell 15 DC15250')
    expect(out).not.toMatch(/pin rất lâu/)
  })

  it('🚨 ALLOWS the claim when the evidence actually carries the figure', async () => {
    // The guard is not a blanket ban: a row that states a weight supports a
    // weight claim. This is the half that proves it fails CLOSED on absence
    // rather than closed on everything.
    const out = reply(await run([
      ...primary([{ ...DELL, weightKg: 1.2, batteryHours: 11 }]),
      line0('**Laptop Dell 15 DC15250** nhẹ và pin lâu.'),
      END,
    ]))
    expect(out).toMatch(/nhẹ/)
    expect(out).toMatch(/pin lâu/)
  })

  it('still reads the organic fallback array, which was never broken', async () => {
    const out = reply(await run([
      ...fallback([DELL]),
      line0('**Laptop Dell 15 DC15250** rất nhẹ.'),
      END,
    ]))
    expect(out).not.toMatch(/rất nhẹ/)
  })

  it('a user REQUIREMENT is never a product claim', async () => {
    const out = reply(await run([
      ...primary([DELL]),
      line0('Bạn cần máy nhẹ và pin tốt, nên mình lọc theo tiêu chí đó.'),
      END,
    ]))
    expect(out).toContain('Bạn cần máy nhẹ')
  })

  it('leaves a non-shopping turn completely alone', async () => {
    const out = reply(await run([
      '9:{"toolCallId":"p1","toolName":"search_places","args":{}}',
      'a:{"toolCallId":"p1","result":{"results":[{"name":"Quán Bún Bò Huế 3A","address":"12 Phan Xích Long"}]}}',
      line0('**Quán Bún Bò Huế 3A** — không gian nhẹ nhàng, ghế ngồi thoải mái.'),
      END,
    ]))
    expect(out).toContain('nhẹ nhàng')
  })

  it('a turn with no product rows at all cannot attribute anything, and says nothing extra', async () => {
    const out = reply(await run([
      ...primary([]),
      line0('Mình chưa tìm được kết quả phù hợp.'),
      END,
    ]))
    expect(out).toContain('Mình chưa tìm được kết quả phù hợp')
  })
})

describe('shopping card ownership — the prose stops repeating what the card shows', () => {
  const rowsWithPhoto = [{ ...DELL, photo_url: 'https://img/dell.jpg' }]

  const withCard = (surface: 'web' | 'native') => {
    const c = createEnrichmentCollector()
    c.setShoppingMarker('[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"a","config":"x","matchesRequest":"khop","recommended":false,"priceLow":1,"priceHigh":1,"image":null,"offers":[]}],"recommendation":null}')
    if (surface === 'web') c.setRendersDecisionCard(true)
    return c
  }

  const runWith = async (c: ReturnType<typeof createEnrichmentCollector>) => {
    const res = applyPlaceEnrichmentStreamFilter(
      new Response([
        '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"laptop"}}',
        'a:' + JSON.stringify({ toolCallId: 't1', result: { search_results: rowsWithPhoto } }),
        line0('**Laptop Dell 15 DC15250** đáng cân nhắc.'),
        END,
      ].join('\n') + '\n', { headers: { 'content-type': 'text/plain' } }), 'vi', c)
    return reply(await new Response(res.body).text())
  }

  it('🚨 injects no product image on a web turn that renders the card', async () => {
    const out = await runWith(withCard('web'))
    expect(out).not.toContain('![')
    expect(out).not.toContain('img/dell.jpg')
  })

  it('still injects for a client that renders no card — it is their only channel', async () => {
    const out = await runWith(withCard('native'))
    expect(out).toContain('img/dell.jpg')
  })
})
