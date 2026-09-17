// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rendersDecisionCard, DECISION_CARD_SURFACES } from './decisionSurface'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'

// ─────────────────────────────────────────────────────────────────────────────
// WHICH CLIENTS RENDER THE DECISION CARD — and what that changes in the reply.
//
// The defect this pins (Pixel_8, 2026-09-12): Android rendered the V3 place
// decision section from the `8:` annotation, but the server still treated it
// as a no-card client because only `web` was recognised. The same query came
// back with three injected per-place images and three provider-link rows in
// the prose, and the section started on the third screen. Web, sending
// `x-tappy-surface: web`, got 381 characters of prose and the cards first.
//
// The runtime half drives the REAL stream filter with a REAL `search_places`
// result shape, so "android skips the injection" is measured on the path the
// route takes — not on the helper in isolation.
// ─────────────────────────────────────────────────────────────────────────────

describe('rendersDecisionCard — the surface header', () => {
  it('web renders the card', () => {
    expect(rendersDecisionCard('web')).toBe(true)
  })

  it('android renders the card', () => {
    expect(rendersDecisionCard('android')).toBe(true)
  })

  it('no header, or a surface this server does not know, keeps the no-card reply', () => {
    expect(rendersDecisionCard(null)).toBe(false)
    expect(rendersDecisionCard(undefined)).toBe(false)
    expect(rendersDecisionCard('')).toBe(false)
    expect(rendersDecisionCard('ios')).toBe(false)
    expect(rendersDecisionCard('Web')).toBe(false)       // exact, like the header check it replaced
    expect(rendersDecisionCard('android ')).toBe(false)
  })

  it('the set is exactly the two clients that draw the card today', () => {
    expect([...DECISION_CARD_SURFACES].sort()).toEqual(['android', 'web'])
  })
})

// ── The stream, on a real place turn ─────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const IMG = 'https://img.test/bun-bo-5t.jpg'

/** A `search_places` result as the tool emits it on a food turn (OSM fallback shape, with order links). */
const placeRow = (name: string) => ({
  place_id: `osm-${name}`,
  name,
  address: `70 ${name} Street, Quận 1`,
  maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`,
  order_links: [
    { name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=${encodeURIComponent(name)}` },
    { name: 'GrabFood', url: `https://food.grab.com/vn/en/s?searchKeyword=${encodeURIComponent(name)}` },
  ],
})
const NAMES = ['Bún Bò 5T', 'Bún Bò Huế Đông Ba', 'Bún Bò Huế Gia Hội']
const placesResult = () => ({
  source: 'OpenStreetMap',
  count: NAMES.length,
  results: NAMES.map(placeRow),
  _tappy_place_domain: 'food',
  _tappy_shortlist: NAMES.map((n, i) => ({ rank: i, id: `osm-${n}`, name: n, role: i === 0 ? 'best_overall' : 'value_gem' })),
})
const PROSE = '**Bún Bò 5T** — 70 Nguyễn Trường Tộ, mở từ 6h-21h.\n\n**Bún Bò Huế Đông Ba** — vị đậm đà kiểu Huế.\n\n**Bún Bò Huế Gia Hội** — 19 Trần Cao Vân.'

/** One turn, as the route wires it for a client that sent `surface` (or nothing). */
async function turn(surface: string | null) {
  const result = placesResult()
  const collector = createEnrichmentCollector()
  collector.add(result.results)
  // The producer is what the route passes for a food place search (slotAdmission): a null
  // producer is REFUSED by design, so the food subject is named exactly as route.ts names it.
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM'), producerSubject('search_places', 'food'))
  // Exactly what route.ts does with the header.
  collector.setRendersDecisionCard(rendersDecisionCard(surface))
  const resolvePhotos = async (places: { name?: string }[]) =>
    new Map(places.map(p => [p.name!, [IMG]]))
  const res = applyPlaceEnrichmentStreamFilter(
    new Response([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"bún bò ngon","location":"TP HCM"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result }),
      line0(PROSE),
      END,
    ].join('\n') + '\n'),
    'vi', collector, resolvePhotos,
  )
  const out = await new Response(res.body).text()
  const lines = out.split('\n')
  const prose = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const annotations = lines.filter(l => l.startsWith('8:')).map(l => JSON.parse(l.slice(2)) as unknown[]).flat() as { kind?: string; items?: unknown[] }[]
  const view = annotations.find(a => a.kind === 'tappy.places.v1')
  return { prose, view }
}

describe('what the surface changes on the wire', () => {
  it('android: the card owns the photo and the provider links — none are injected into the prose', async () => {
    const { prose, view } = await turn('android')
    expect(view, 'the annotation still goes out — that is what the card is built from').toBeTruthy()
    expect(view!.items).toHaveLength(3)
    expect(prose).not.toContain('![')
    expect(prose).not.toContain('shopeefood.vn')
    expect(prose).not.toContain('food.grab.com')
    expect(prose).not.toContain(IMG)
    // The model's own words are untouched.
    expect(prose).toContain('**Bún Bò 5T**')
    expect(prose).toContain('19 Trần Cao Vân')
  })

  it('web: identical — the same contract the web already had', async () => {
    const { prose, view } = await turn('web')
    expect(view).toBeTruthy()
    expect(prose).not.toContain('![')
    expect(prose).not.toContain('shopeefood.vn')
    expect(prose).toBe((await turn('android')).prose)
  })

  it('no header: a client without a card keeps the injected block, exactly as before', async () => {
    const { prose, view } = await turn(null)
    expect(view, 'the annotation is not what the header gates').toBeTruthy()
    // The block is the only channel these clients have for the photo and the links.
    expect(prose).toContain('![')
    expect(prose).toContain(IMG)
    expect(prose).toContain('shopeefood.vn')
    expect(prose).toContain('food.grab.com')
  })

  it('an unknown surface is a no-card client too', async () => {
    const { prose } = await turn('ios')
    expect(prose).toContain('shopeefood.vn')
    expect(prose).toBe((await turn(null)).prose)
  })
})
