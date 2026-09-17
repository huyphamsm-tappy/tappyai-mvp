import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// ── [TAPPY_PLACES] through the real stream ───────────────────────────────────
//
// Exercised end-to-end through the production filter, not a stand-in: the same entry point the
// route uses, the same collector, the same `0:` frames the client receives.
//
// The invariant under test is "detector in == user out": every structured marker rides in the
// message text, so what the detectors analyse is exactly what ships and what persists.
//
// 🔄 WHAT CHANGED, AND WHY THESE NOW ASSERT ABSENCE. The durable [TAPPY_PLACES] block is owned by
// `lib/recommendation/marker.ts` and is built from the RECOMMENDATION layer, not from tool
// enrichment — and its emission is flag-gated OFF (`EMIT_TAPPY_PLACES = false` in config/product:
// Android and iOS cannot strip a marker they were never told about, and a marker is permanent
// storage, which Google Places terms forbid for Places content). So no places block reaches a
// reply today, whatever the collector holds, and that is the property worth pinning here: the
// gate is real, and shopping/TikTok composition is untouched by it.
//
// WHICH places would earn a card when the flag opens is asserted where that logic lives —
// `placesGroundedInProse` in placesMarker.test.ts and placesProvenance.test.ts (text_ranked +
// the reply must already name the place, in the reply's order).

const line0 = (s: string) => '0:' + JSON.stringify(s)
const SHOPPING = '[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"k","config":"c","name":"Sony WH-1000XM5","offers":[]}]}[/TAPPY_SHOPPING]'
const TIKTOK = 'https://www.tiktok.com/@lulureview_/video/7536948899538373896'

// `text_ranked: true` says these came from Google Places textSearch — the provider that ranked
// them against the user's words. It is what entitles a place to a [TAPPY_PLACES] card at all; the
// OpenStreetMap fallback sets it false and is covered in placesProvenance.test.ts.
const QUAN_A = { name: 'Quán A', address: '12 Lý Tự Trọng', rating: 4.8, review_count: 320, photo_url: 'https://img.example/a.jpg', text_ranked: true }
const QUAN_B = { name: 'Quán B', address: '5 Nguyễn Huệ', photo_url: 'https://img.example/b.jpg', text_ranked: true }

async function run(
  prose: string,
  opts: { places?: Record<string, unknown>[]; shopping?: boolean; tiktok?: boolean } = {},
): Promise<string> {
  const collector = createEnrichmentCollector()
  if (opts.places) collector.add(opts.places)
  if (opts.shopping) collector.setShoppingMarker(SHOPPING)
  if (opts.tiktok) collector.setBatchTikTokUrl(TIKTOK)

  const lines = [
    'f:{"messageId":"m1"}',
    '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
    'a:{"toolCallId":"t1","result":{"results":[]}}',
    line0(prose),
    'd:{"finishReason":"stop"}',
  ]
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector)
  const out = await new Response(filtered.body).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')
}

/** The JSON inside the places marker, or null when no marker was emitted. */
function placesPayload(text: string): { v: number; places: Record<string, unknown>[] } | null {
  const m = text.match(/\[TAPPY_PLACES\]([\s\S]*?)\[\/TAPPY_PLACES\]/)
  return m ? JSON.parse(m[1]) : null
}

describe('[TAPPY_PLACES] rides the same text channel as [TAPPY_SHOPPING]', () => {
  it('A. prose alone carries no marker', async () => {
    const text = await run('Mình chưa tìm được quán nào.')
    expect(text).toContain('Mình chưa tìm được quán nào.')
    expect(text).not.toContain('[TAPPY_PLACES]')
    expect(text).not.toContain('[TAPPY_SHOPPING]')
  })

  it('B. prose + shopping keeps the shopping marker exactly as before', async () => {
    const text = await run('Mình gợi ý tai nghe này.', { shopping: true })
    expect(text).toContain('Mình gợi ý tai nghe này.')
    expect(text).toContain(SHOPPING)
    expect(text).not.toContain('[TAPPY_PLACES]')
  })

  it('C. prose + places ships NO durable block while the flag is closed', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A] })

    expect(placesPayload(text)).toBeNull()
    // The prose the reader sees is untouched either way.
    expect(text).toContain('Mình gợi ý')
    expect(text).toContain('Quán A')
  })

  it('D. the shopping marker is unaffected by the closed places gate', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], shopping: true })
    expect(text).toContain(SHOPPING)
    expect(text).not.toContain('[TAPPY_PLACES]')
  })

  it('E. prose + TikTok + places keeps the video intact', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], tiktok: true })

    expect(text).toContain('Video liên quan')
    expect(text).toContain(TIKTOK)
    expect(text).not.toContain('[TAPPY_PLACES]')
  })

  it('F. prose + TikTok + shopping + places: nothing is lost', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], shopping: true, tiktok: true })

    expect(text).toContain('Mình gợi ý')
    expect(text).toContain(TIKTOK)
    expect(text).toContain(SHOPPING)
    // Existing composition is untouched: the shopping marker still leads, the video still closes.
    expect(text.indexOf('[TAPPY_SHOPPING]')).toBeLessThan(text.indexOf('Mình gợi ý'))
    expect(text.indexOf('Mình gợi ý')).toBeLessThan(text.indexOf('Video liên quan'))
    expect(text).not.toContain('[TAPPY_PLACES]')
  })

  it('G. a place the reply never named cannot arrive through the stream', async () => {
    // Both places are in the collector; the reply names just one of them. With the durable block
    // closed nothing can smuggle the other in — and when the flag opens, the same guarantee is
    // enforced by `placesGroundedInProse` before the serializer ever sees it.
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A, QUAN_B] })

    expect(placesPayload(text)).toBeNull()
    expect(text).not.toContain('Quán B')
  })

  it('H. names presented in the reply come from the reply itself, not from a block', async () => {
    // The prose names neither place, so `injectPlaceEnrichment` falls back to its trailing
    // "📸 Hình ảnh & link review" block and presents both there — bold names, in the text the
    // user reads. The marker may therefore carry both, and the invariant still holds, because the
    // invariant is not "the model bolded it" but "the shipped text contains it": `presentedNames`
    // is resolved against `finalText`, so a name the marker adds that the text lacks is the only
    // thing that could widen the turn. This asserts exactly that, on the case most likely to
    // break it.
    const text = await run('Mình chưa tìm được quán phù hợp.', { places: [QUAN_A, QUAN_B] })

    expect(placesPayload(text)).toBeNull()
    // Both names still reach the reader through the enrichment block, which is the text
    // `presentedNames` is resolved against — unchanged by the marker decision.
    expect(text).toContain('Quán A')
    expect(text).toContain('Quán B')
  })

  it('I. an empty collector leaves the reply exactly as it was', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [] })
    expect(text).toContain('Mình gợi ý')
    expect(text).not.toContain('[TAPPY_PLACES]')
  })
})
