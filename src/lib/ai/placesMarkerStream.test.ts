import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// ── [TAPPY_PLACES] through the real stream ───────────────────────────────────
//
// Exercised end-to-end through the production filter, not a stand-in: the same entry point the
// route uses, the same collector, the same `0:` frames the client receives.
//
// The invariant under test is "detector in == user out": every structured marker rides in the
// message text, so what the detectors analyse is exactly what ships and what persists. These pin
// that a SECOND marker joined that rule instead of quietly bypassing it — and that it can never
// widen what the turn counts as presented, because it only ever names places the prose named.

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

  it('C. prose + places emits the places marker, with the real name', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A] })
    const payload = placesPayload(text)

    expect(payload).not.toBeNull()
    expect(payload!.v).toBe(1)
    expect(payload!.places).toHaveLength(1)
    expect(payload!.places[0].name).toBe('Quán A')
    expect(payload!.places[0].rating).toBe(4.8)
    expect(payload!.places[0].reviewCount).toBe(320)
    // The prose the reader sees is untouched by the marker.
    expect(text).toContain('Mình gợi ý')
  })

  it('D. both markers survive together', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], shopping: true })
    expect(text).toContain(SHOPPING)
    expect(placesPayload(text)!.places[0].name).toBe('Quán A')
  })

  it('E. prose + TikTok + places keeps the video intact, markers after it', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], tiktok: true })

    expect(text).toContain('Video liên quan')
    expect(text).toContain(TIKTOK)
    // The video closes the prose; the machine block follows it.
    expect(text.indexOf('Video liên quan')).toBeLessThan(text.indexOf('[TAPPY_PLACES]'))
    expect(placesPayload(text)!.places[0].name).toBe('Quán A')
  })

  it('F. prose + TikTok + shopping + places: nothing is lost', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A], shopping: true, tiktok: true })

    expect(text).toContain('Mình gợi ý')
    expect(text).toContain(TIKTOK)
    expect(text).toContain(SHOPPING)
    expect(placesPayload(text)!.places[0].name).toBe('Quán A')
    // Existing marker order is untouched: shopping still precedes the newcomer.
    expect(text.indexOf('[TAPPY_SHOPPING]')).toBeLessThan(text.indexOf('[TAPPY_PLACES]'))
  })

  it('G. the marker names only places the prose already named', async () => {
    // Both places are in the collector; the reply names just one of them.
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [QUAN_A, QUAN_B] })
    const payload = placesPayload(text)!

    expect(payload.places).toHaveLength(1)
    expect(payload.places[0].name).toBe('Quán A')
    // Quán B never reaches the reply, so the marker cannot make the turn count it as presented.
    expect(text).not.toContain('Quán B')
  })

  it('H. every name in the marker is a name the shipped reply already carries', async () => {
    // The prose names neither place, so `injectPlaceEnrichment` falls back to its trailing
    // "📸 Hình ảnh & link review" block and presents both there — bold names, in the text the
    // user reads. The marker may therefore carry both, and the invariant still holds, because the
    // invariant is not "the model bolded it" but "the shipped text contains it": `presentedNames`
    // is resolved against `finalText`, so a name the marker adds that the text lacks is the only
    // thing that could widen the turn. This asserts exactly that, on the case most likely to
    // break it.
    const text = await run('Mình chưa tìm được quán phù hợp.', { places: [QUAN_A, QUAN_B] })
    const payload = placesPayload(text)!
    const prose = text.slice(0, text.indexOf('[TAPPY_PLACES]'))

    expect(payload.places.length).toBeGreaterThan(0)
    for (const p of payload.places) expect(prose).toContain(p.name as string)
  })

  it('I. an empty collector leaves the reply exactly as it was', async () => {
    const text = await run('Mình gợi ý **Quán A** nhé.', { places: [] })
    expect(text).toContain('Mình gợi ý')
    expect(text).not.toContain('[TAPPY_PLACES]')
  })
})
