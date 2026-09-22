// @vitest-environment node
/**
 * G1b — the evidence-only fallback sentence (PLACE_GUARD_ATTRIBUTION_V2 only).
 *
 * When the guards have taken every body sentence and the engine made a Pick with a
 * retrieved rating, ONE sentence built from card fields replaces the empty body:
 * name, rating, review count, "giờ mở cửa theo Google Maps: …". It is placed where
 * the body was — before [CTA_BUTTONS]/[FOLLOWUPS] — never says "đang mở", and is
 * Vietnamese unless the user's message is confidently English (owner rules).
 */
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'

const ROWS = [
  { place_id: 'p1', name: 'Bún Bò Huế Đông Ba', address: 'Quận 1', google_rating: '⭐ 4.9 (7.166 đánh giá)', rating_value: 4.9, rating_count: 7166, opening_hours: '06:00–22:00', maps_link: 'https://maps.google.com/?cid=1', amenity: 'restaurant' },
  { place_id: 'p2', name: 'Bún Bò Gánh', address: 'Quận 3', google_rating: '⭐ 4.5 (912 đánh giá)', rating_value: 4.5, rating_count: 912, maps_link: 'https://maps.google.com/?cid=2', amenity: 'restaurant' },
]
const CTA = '[CTA_BUTTONS]{"buttons":[{"label":"📍 Maps","type":"maps","url":"https://maps.google.com/?cid=1","primary":true}]}[/CTA_BUTTONS]'
const FOLLOWUPS = '[FOLLOWUPS]Quán khác|Giá món[/FOLLOWUPS]'

async function runTurn(reply: string, opts: { v2: boolean; userText?: string; lang?: string; rows?: Array<Record<string, unknown>>; withPick?: boolean }) {
  const saved = process.env.PLACE_GUARD_ATTRIBUTION_V2
  // v2 is the default since Session C (2026-09-22); "without the flag" now means the explicit rollback value.
  if (opts.v2) process.env.PLACE_GUARD_ATTRIBUTION_V2 = '1'; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = '0'
  try {
    const rows = opts.rows ?? ROWS
    const toolResult = { results: rows, place_search_status: 'has_results' }
    const collector = createEnrichmentCollector(opts.userText ?? 'quán bún bò ngon ở Quận 1')
    if (opts.withPick !== false) collector.setPlacesRecommendations(placeRecommendations(toolResult, 'TP.HCM', { name: String(rows[0].name) }), 'food')
    const lines = [
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult)}}`,
      '0:' + JSON.stringify(reply),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'), opts.lang ?? 'vi', collector, undefined,
      undefined, undefined, false, opts.userText ?? 'quán bún bò ngon ở Quận 1', true,
    )
    return await new Response(res.body).text()
  } finally {
    if (saved === undefined) delete process.env.PLACE_GUARD_ATTRIBUTION_V2; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = saved
  }
}

/** The reply's prose, decoded from the data-stream `0:` frames. */
const prose = (stream: string): string => stream.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

// A body that is nothing but unsupported claims: v2 removes all of it (never hands it back).
const ALL_CLAIMS = `Quán này 3.1 sao, hơn 99.999 đánh giá, giao hàng tận nơi.\n\n${CTA}\n\n${FOLLOWUPS}`

describe('G1b evidence-only fallback', () => {
  it('fires under v2 when the body is empty after the guards, from card fields only, before the markers', async () => {
    const out = prose(await runTurn(ALL_CLAIMS, { v2: true }))
    expect(out).not.toContain('3.1 sao')
    expect(out).not.toContain('99.999')
    const pick = ROWS[0].name
    const sentence = `Mình chọn **${pick}** — `
    expect(out).toContain(sentence)
    expect(out).toContain('đánh giá Google Maps')
    expect(out).toMatch(/giờ mở cửa theo Google Maps: /)
    expect(out).not.toMatch(/đang mở/i)
    expect(out.indexOf(sentence)).toBeLessThan(out.indexOf('[CTA_BUTTONS]'))
    expect(out.indexOf('[CTA_BUTTONS]')).toBeLessThan(out.indexOf('[FOLLOWUPS]'))
  })
  it('does not fire when the body survived', async () => {
    const out = prose(await runTurn(`Mình chọn **Bún Bò Huế Đông Ba** cho bạn, nước dùng đậm đà, ngồi thoải mái cho cả nhóm.\n\n${CTA}`, { v2: true }))
    expect(out).not.toContain('giờ mở cửa theo Google Maps')
    expect(out).toContain('nước dùng đậm đà')
  })
  it('does not fire without the flag (v1 keeps its last-resort behaviour)', async () => {
    const out = prose(await runTurn(ALL_CLAIMS, { v2: false }))
    expect(out).not.toContain('giờ mở cửa theo Google Maps')
  })
  it('stays silent when the pick has no retrieved rating (nothing to vouch for)', async () => {
    const rows = ROWS.map(r => ({ ...r, google_rating: null, rating_value: undefined, rating_count: undefined }))
    const out = prose(await runTurn(ALL_CLAIMS, { v2: true, rows }))
    expect(out).not.toContain('Mình chọn')
    expect(out).not.toContain('3.1 sao')
  })
  it('writes English only when the user is confidently English', async () => {
    const en = prose(await runTurn(ALL_CLAIMS, { v2: true, lang: 'en', userText: 'find me a good bun bo restaurant near District 1 please' }))
    expect(en).toMatch(/I'd go with \*\*.+\*\* — 4\.\d⭐ \([\d,]+ Google Maps reviews\); opening hours per Google Maps: /)
    // Undiacriticked Vietnamese reads as "en" to the detector but is not confidently English.
    const vi = prose(await runTurn(ALL_CLAIMS, { v2: true, lang: 'en', userText: 'quan bun bo ngon o quan 1' }))
    expect(vi).toContain('Mình chọn')
  })
})
