// @vitest-environment node
/**
 * G2 — the snippet-price guard must SEE the price band the card shows.
 *
 * Serper rows carry `price_range_text` ("100-200 N ₫"); the stream collected
 * only `price_search_results` snippets as price evidence, so a reply quoting the
 * card's own band was deleted as invented (13/17 removals on the 2026-09-17 V3
 * capture). Drives the real stream filter with a band row, flag off and on.
 */
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const ROW = {
  place_id: 'p1', name: 'GÀ RÁN K- JEJU CHICKEN-Quận 1', address: 'Quận 1',
  google_rating: '⭐ 4.9 (7.166 đánh giá)', rating_value: 4.9, rating_count: 7166,
  price_range_text: '100-200 N ₫', maps_link: 'https://maps.google.com/?cid=1',
  // E1 (2026-09-20): the reply's "mở đến 3h sáng" must trace to the row's hours, like its band.
  opening_hours: '10:00–03:00',
}

async function runTurn(reply: string, env: Record<string, string> = {}) {
  const saved = { ...process.env }
  for (const k of ['SNIPPET_PRICE_GUARD_V2', 'PLACE_GUARD_ATTRIBUTION_V2']) delete process.env[k]
  Object.assign(process.env, env)
  try {
    const lines = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":${JSON.stringify({ results: [ROW], place_search_status: 'has_results' })}}`,
      '0:' + JSON.stringify(reply),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'), 'vi', undefined, undefined,
      undefined, undefined, false, 'quán ăn tối yên tĩnh ở Quận 1', true,
    )
    const out = await new Response(res.body).text()
    return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
}

const REPLY = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** cho bạn 👍 Quán này có 4.9⭐ (7.166 đánh giá Google Maps). Giá 100-200k/người rất hợp budget, mở đến 3h sáng.'

describe('price band evidence reaches the snippet-price guard', () => {
  it('flag OFF: the band sentence is still deleted (v1 unchanged)', async () => {
    const out = await runTurn(REPLY)
    expect(out).not.toContain('100-200k')
    expect(out).toContain('Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1**')
  })
  it('flag ON: the sentence quoting the row\'s own band survives whole', async () => {
    const out = await runTurn(REPLY, { SNIPPET_PRICE_GUARD_V2: '1' })
    expect(out).toContain('Giá 100-200k/người rất hợp budget, mở đến 3h sáng.')
  })
  it('flag ON: a price outside the band is still removed', async () => {
    const out = await runTurn(REPLY.replace('100-200k', '500-900k'), { SNIPPET_PRICE_GUARD_V2: '1' })
    expect(out).not.toContain('500-900k')
    expect(out).toContain('4.9⭐')
  })
  it('flag ON with G1 on: a metre distance next to the band is not money and the reply stays whole', async () => {
    const reply = 'Mình chọn **GÀ RÁN K- JEJU CHICKEN-Quận 1** cho bạn 👍 Quán này cách bạn chỉ 100m, có 4.9⭐ (7.166 đánh giá Google Maps), giá 100-200k/người.'
    const out = await runTurn(reply, { SNIPPET_PRICE_GUARD_V2: '1', PLACE_GUARD_ATTRIBUTION_V2: '1' })
    expect(out).toContain('cách bạn chỉ 100m')
    expect(out).toContain('giá 100-200k/người')
  })
})
