// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { readPlacesLiveView, type PlacesLiveView } from '@/lib/recommendation/liveView'
import { readProgress, buildProgressAnnotation, PROGRESS_ANNOTATION_KIND } from '@/lib/recommendation/progressAnnotation'

// ─────────────────────────────────────────────────────────────────────────────
// A1(a)+(b) — THE FOLD IS NOT BLANK WHILE THE PROSE IS WRITTEN.
//
// A place turn holds every post-tool byte until `d:` (the guards are not prefix-stable), so for
// 6–10 s the client had nothing but a generic hint. Now, the moment the rows land, the stream
// carries (1) a progress frame with the row count and (2) the ENGINE's set as a `preliminary`
// place frame — unranked, no pick, no reasons — and at `d:` a "finishing" frame before the
// guards and photos run. The decision frame after the prose replaces the preliminary one; the
// readers on both surfaces take the LAST frame of the kind.
//
// Everything is an `8:` annotation: nothing here reaches the message text, TTS or persistence.
// ─────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const row = (name: string, i: number) => ({ place_id: `g-${i}`, name, address: `${10 + i} Nguyễn Trãi, Quận 1`, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`, text_ranked: true })
const NAMES = ['Quán ăn ngon Sài Gòn', 'Béo Ơi Quán - Món ngon Hà Nội', 'Cơm Tấm Ba Ghiền', 'Ốc Đào']
const PROSE = 'Mình chọn **Béo Ơi Quán** (4.1⭐): bún chả đúng vị.\n\nNếu muốn thay thế: **Cơm Tấm Ba Ghiền** (4.2⭐) cũng ngon.'

async function run(frames: string[]) {
  const result = { source: 'serper_maps', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'food' }
  const collector = createEnrichmentCollector()
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM', { name: NAMES[0], reasons: [{ attribute: 'rating', evidence: 'rated 4.0' }] }), producerSubject('search_places', 'food'))
  collector.setRendersDecisionCard(rendersDecisionCard('android'))
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector)
  const out = await new Response(res.body).text()
  const lines = out.split('\n').filter(Boolean)
  const frames8 = lines.map((l, i) => ({ i, l })).filter(x => x.l.startsWith('8:')).map(x => ({ i: x.i, a: (JSON.parse(x.l.slice(2)) as unknown[])[0] as Record<string, unknown> }))
  return { lines, frames8, annotations: frames8.map(f => f.a) }
}

const PLACE_TURN = [
  '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán ăn ngon","location":"Quận 1"}}',
  'a:' + JSON.stringify({ toolCallId: 't1', result: { source: 'serper_maps', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'food' } }),
  line0(PROSE),
  END,
]

describe('cards first + progress on a place turn', () => {
  it('right after the tool result: a "found" frame with the row count, then the preliminary set — before any prose', async () => {
    const { lines, frames8 } = await run(PLACE_TURN)
    const aIdx = lines.findIndex(l => l.startsWith('a:'))
    const firstText = lines.findIndex((l, i) => i > aIdx && l.startsWith('0:'))
    const found = frames8.find(f => f.a.kind === PROGRESS_ANNOTATION_KIND && f.a.stage === 'found')!
    const prelim = frames8.find(f => f.a.kind === 'tappy.places.v1' && f.a.preliminary === true)!
    expect(found).toBeDefined()
    expect(found.a.count).toBe(4)
    expect(found.a.text).toBe('Đã có 4 chỗ phù hợp — đang chọn cho bạn…')
    expect(prelim).toBeDefined()
    expect(found.i).toBeGreaterThan(aIdx)
    expect(prelim.i).toBeGreaterThan(found.i)
    expect(prelim.i).toBeLessThan(firstText)
  })
  it('the preliminary set is the engine\'s, unranked, with no pick, no emphasis and no reasons', async () => {
    const { annotations } = await run(PLACE_TURN)
    const prelim = annotations.find(a => a.kind === 'tappy.places.v1' && a.preliminary === true) as unknown as PlacesLiveView
    expect(prelim.ranked).toBe(false)
    expect(prelim.picked).toBeUndefined()
    expect(prelim.shown).toBe(3)
    expect(prelim.items.map(i => i.name)).toEqual(NAMES)
    expect(prelim.items.some(i => i.recommended || (i.reasons && i.reasons.length) || i.tradeOff)).toBe(false)
  })
  it('at d: a "finishing" frame goes out before the decision; the decision is the LAST place frame and it is not preliminary', async () => {
    const { frames8 } = await run(PLACE_TURN)
    const finishing = frames8.find(f => f.a.kind === PROGRESS_ANNOTATION_KIND && f.a.stage === 'finishing')!
    const places = frames8.filter(f => f.a.kind === 'tappy.places.v1')
    expect(places).toHaveLength(2)
    expect(finishing.i).toBeGreaterThan(places[0].i)
    expect(finishing.i).toBeLessThan(places[1].i)
    const final = places[1].a as unknown as PlacesLiveView
    expect(final.preliminary).toBeUndefined()
    expect(final.picked?.length).toBe(2)
  })
  it('the readers take the LAST frame: the decision, not the preliminary set; progress reads the latest stage', async () => {
    const { annotations } = await run(PLACE_TURN)
    const view = readPlacesLiveView(annotations)!
    expect(view.preliminary).toBeUndefined()
    expect(view.picked?.length).toBe(2)
    expect(readProgress(annotations)?.stage).toBe('finishing')
    // Mid-stream (before d:) the same reader yields the preliminary set.
    const cut = annotations.slice(0, annotations.findIndex(a => a.kind === PROGRESS_ANNOTATION_KIND && a.stage === 'finishing'))
    expect(readPlacesLiveView(cut)?.preliminary).toBe(true)
    expect(readProgress(cut)?.stage).toBe('found')
  })
  it('a second place search in the same turn (a plan) does not replace the fold again', async () => {
    const second = 'a:' + JSON.stringify({ toolCallId: 't2', result: { source: 'serper_maps', count: 1, results: [row('Ốc Đào', 9)], _tappy_place_domain: 'food' } })
    const { annotations } = await run([PLACE_TURN[0], PLACE_TURN[1], '9:{"toolCallId":"t2","toolName":"search_places","args":{"query":"ốc"}}', second, line0(PROSE), END])
    expect(annotations.filter(a => a.kind === 'tappy.places.v1' && a.preliminary === true)).toHaveLength(1)
    expect(annotations.filter(a => a.kind === PROGRESS_ANNOTATION_KIND && a.stage === 'found')).toHaveLength(1)
  })
  it('nothing on a turn without a place tool: no progress, no preliminary', async () => {
    const { annotations } = await run([line0('Chào bạn! Hôm nay muốn ăn gì?'), END])
    expect(annotations).toHaveLength(0)
  })
  it('the frames never enter the text', async () => {
    const { lines } = await run(PLACE_TURN)
    const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(text).not.toContain('tappy.progress')
    expect(text).not.toContain('Đã có 4 chỗ')
  })
})

describe('progress copy', () => {
  it('is written in the turn\'s language on the server', () => {
    expect(buildProgressAnnotation('found', 'en', 10).text).toBe('Found 10 matching places — choosing for you…')
    expect(buildProgressAnnotation('found', 'vi', 0).text).toBe('Đang xem kết quả tìm được…')
    expect(buildProgressAnnotation('finishing', 'en').text).toBe('Checking details and fetching photos…')
  })
  it('the reader ignores malformed or unknown frames', () => {
    expect(readProgress([{ kind: PROGRESS_ANNOTATION_KIND, stage: 'nope', text: 'x' }, { kind: 'other' }, null])).toBeNull()
  })
})
