// @vitest-environment node
/**
 * G1 — the place-claim guard must SEE the rating the card shows.
 *
 * Google (`food.ts`) and Serper (`serperPlaces.ts`) rows carry the number as
 * `rating_value`; `google_rating` is the formatted string the prompt reads. The
 * evidence collector in `streamEnrichment.ts` read `row.rating ?? row.google_rating`
 * and required a number, so `ratingsByEntity` was empty on every real turn — measured
 * on the 2026-09-17 V3 capture: 15/15 turns with `ratingsByEntity: {}` beside a full
 * `reviewCountsByEntity`. v1 hid it (it never read "4.9⭐" as a score); v2 reads the
 * glyph and would have deleted every TRUE rating the model copied from the card.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const ROW = {
  place_id: 'p1', name: 'Bún Bò Huế Đông Ba', address: 'Quận 1',
  google_rating: '⭐ 4.9 (7.166 đánh giá)', rating_value: 4.9, rating_count: 7166,
  maps_link: 'https://maps.google.com/?cid=1',
}

async function runTurn(reply: string, env: Record<string, string> = {}) {
  const saved = { ...process.env }
  Object.assign(process.env, env)
  try {
    const lines = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":${JSON.stringify({ results: [ROW], place_search_status: "has_results" })}}`,
      '0:' + JSON.stringify(reply),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'), 'vi', undefined, undefined,
      undefined, undefined, false, 'quán bún bò ngon ở Quận 1', true,
    )
    return await new Response(res.body).text()
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
}

afterEach(() => vi.restoreAllMocks())

describe('rating evidence reaches the place-claim guard', () => {
  it('v1: a true "4.9 sao" copied from the card survives (it used to be deleted against an empty pool)', async () => {
    const out = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn. Quán này 4.9 sao trên Google Maps.')
    expect(out).toContain('4.9 sao')
  })
  it('v1: a fabricated "3.1 sao" is still removed', async () => {
    const out = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn. Quán này 3.1 sao trên Google Maps.')
    expect(out).not.toContain('3.1 sao')
  })
  it('v2: the card\'s "4.9⭐ (7.166 đánh giá)" survives and a fabricated "4.2⭐" does not', async () => {
    const keep = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn 👍 Quán này có 4.9⭐ (7.166 đánh giá Google Maps).', { PLACE_GUARD_ATTRIBUTION_V2: '1' })
    expect(keep).toContain('4.9⭐ (7.166 đánh giá Google Maps)')
    const drop = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn 👍 Quán này có 4.2⭐ (7.166 đánh giá Google Maps).', { PLACE_GUARD_ATTRIBUTION_V2: '1' })
    expect(drop).not.toContain('4.2⭐')
  })

  // Phase 7 (2026-09-22, golden T3 t2 / G3a): the pick sentence carried a wrong count and was
  // deleted whole, so the prose named no pick while the card marked one recommended.
  it('🚨 a wrong review count in the pick sentence loses the count, not the pick', async () => {
    const out = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn (4.9⭐, 1.200 đánh giá) vì gần nhất. Quán mở đến 22:00.')
    expect(out).toContain('Mình chọn **Bún Bò Huế Đông Ba** cho bạn')
    expect(out).not.toContain('1.200 đánh giá')
    expect(out).toContain('vì gần nhất')
  })
  it('a wrong count in its own clause goes alone; a sentence that is only the count still goes whole', async () => {
    const clause = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn, hơn 1.200 đánh giá, và mở đến 22:00.')
    expect(clause).toContain('Mình chọn **Bún Bò Huế Đông Ba** cho bạn')
    expect(clause).not.toContain('1.200 đánh giá')
    const whole = await runTurn('Mình chọn **Bún Bò Huế Đông Ba** cho bạn. Quán này có hơn 1.200 đánh giá.')
    expect(whole).toContain('Mình chọn **Bún Bò Huế Đông Ba** cho bạn.')
    expect(whole).not.toContain('1.200 đánh giá')
  })
})
