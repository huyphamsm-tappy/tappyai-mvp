import { describe, it, expect } from 'vitest'
import { buildPlacesLiveView, readPlacesLiveView, PLACES_ANNOTATION_KIND } from './liveView'
import { buildRecommendations } from './recommendation'
import type { CanonicalEntity } from './entity'
import { unknownClaim } from './entity'
import type { Action } from './actions'

// ─────────────────────────────────────────────────────────────────────────────
// THE COMPOSITION GAP THIS EXISTS FOR.
//
// The audit established that a place turn already computes everything a
// recommendation needs — a deterministic Pick, its reasons, the runner-up's
// trade-off, a shortlist of alternatives and real action URLs — and then throws
// all of it away, because the only delivery channel for place structure
// (`[TAPPY_PLACES]`) is flag-gated off for two reasons that still stand:
// Android/iOS cannot strip a marker they were never told about, and a marker in
// the message text is PERMANENT STORAGE, which Google Places terms forbid for
// Places content.
//
// So the facts reached the user only if the model happened to write them into a
// paragraph — "quán này 4.8 sao, mở tới 22:30, giá hợp lý…" — which is exactly
// the "information buried in prose" the redesign targets.
//
// This projection is the app-owned, TRANSIENT view of that same decision. It
// invents nothing: every field is copied from the canonical entity the ranker
// already produced, or omitted.
// ─────────────────────────────────────────────────────────────────────────────

function action(over: Partial<Action> = {}): Action {
  return { kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?q=1', labelKey: 'action.maps', priority: 1, ...over }
}

function place(id: string, name: string, over: Partial<CanonicalEntity> = {}): CanonicalEntity {
  return {
    v: 1,
    id,
    domain: 'food',
    kind: 'place',
    identity: { name, sourceRefs: [] },
    images: { primary: { url: `https://img/${id}.jpg`, source: 'serper_images', stability: 'volatile' }, gallery: [] },
    location: { address: '12 Lý Quốc Sư, Hoàn Kiếm', coordinates: null, distanceKm: 1.2 },
    quality: {
      rating: { value: 4.8, evidence_type: 'FACT', source_type: 'google_places' },
      ratingCount: { value: 320, evidence_type: 'FACT', source_type: 'google_places' },
      tappyRating: null,
      stars: null,
    },
    pricing: { price: unknownClaim<number>(), priceRange: null, priceLevel: 2, priceSignal: unknownClaim<string>() },
    availability: { openingHours: { value: '08:00–22:30', evidence_type: 'FACT', source_type: 'google_places' }, openNow: true },
    attributes: { phone: '02412345678' },
    reviews: { actions: [], coverage: 'search' },
    actions: [action()],
    provenance: {},
    ext: {},
    ...over,
  } as CanonicalEntity
}

/** The shape `withShortlist` produces: ranked ids, a shortlist and one pick. */
function recsFrom(entities: CanonicalEntity[], pickedId: string | null, shortlisted: string[] = entities.map(e => e.id)) {
  return buildRecommendations(entities, {
    rankedIds: entities.map(e => e.id),
    shortlist: shortlisted.map((id, i) => ({ rank: i, id, name: id, role: i === 0 ? 'best_overall' : 'value_gem' })),
    pickedId,
    reasons: pickedId ? { [pickedId]: [{ attribute: 'rating', evidence: '4.8⭐ · 320 đánh giá' }] } : {},
    tradeOffs: pickedId ? { [pickedId]: { attribute: 'distance', evidence: 'xa hơn 1.5km so với lựa chọn kia' } } : {},
  })
}

describe('buildPlacesLiveView — one obvious primary, compact alternatives', () => {
  it('returns the ranked list with the Pick first', () => {
    const view = buildPlacesLiveView(recsFrom([place('a', 'Cà Phê AnAn'), place('b', 'Cosa Nostra'), place('c', 'Cà Phê HAN')], 'a'))
    expect(view).not.toBeNull()
    expect(view!.items.map(i => i.name)).toEqual(['Cà Phê AnAn', 'Cosa Nostra', 'Cà Phê HAN'])
    expect(view!.items[0].recommended).toBe(true)
    // The hierarchy is the point: only one entry is ever the lead.
    expect(view!.items.slice(1).every(a => !a.recommended)).toBe(true)
  })

  it('leads with the shortlist head when the engine marked it best_overall but declined a Pick', () => {
    // Measured live on "quán cafe view đẹp": shortlist of three led by
    // `best_overall`, `derivePick` null (a bare request states no criteria), and
    // the reply still opened "mình nghiêng về Cà Phê AnAn" — prompt rule R1b
    // requires exactly that. The card follows the same rule the prose follows.
    const view = buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], null))
    expect(view?.items[0].name).toBe('A')
    // It is the shortlist head, not a Pick: nothing claims the engine chose it.
    expect(view?.items[0].recommended).toBeUndefined()
  })

  it('🚨 returns null when the engine did NOT choose at all — never a fabricated recommendation', () => {
    // Flights, transport and any unrankable turn land here. A card that invents
    // a "Tappy's Pick" for visual symmetry is the failure mode being prevented.
    expect(buildPlacesLiveView([])).toBeNull()
    // A shortlist with no role LABEL is still an ordered shortlist — measured on
    // "Quán cafe view đẹp ở Quận 1", where ten OSM rows carried no rating and no
    // price, so no role could be justified and all three came back `role: null`.
    // The engine still said which three and in which order, so the cards render;
    // what it did NOT do is pick, so nothing is flagged as the pick.
    const unlabelled = buildRecommendations([place('a', 'A'), place('b', 'B')], {
      rankedIds: ['a', 'b'],
      shortlist: [{ rank: 0, id: 'a', name: 'A', role: null as unknown as string }, { rank: 1, id: 'b', name: 'B', role: null as unknown as string }],
      pickedId: null,
    })
    const view = buildPlacesLiveView(unlabelled)
    expect(view?.items[0].name).toBe('A')
    expect(view?.items[0].recommended).toBeUndefined()
    // Ranked but never shortlisted — the ranker declined (fewer than two
    // candidates, or nothing rankable).
    // 🚨 CONTRACT CHANGE, measured 2026-09-08. This used to return null, and null
    // meant no card — so the stream filter fell back to injecting loose images
    // and bare links into the prose. Ten real malls and four real cinemas
    // rendered that way. Real retrieved places now render in the product's own
    // composition; what RANK-07 protects is the CLAIM, so `ranked: false` travels
    // with them and the card drops its position badges.
    const unranked = buildRecommendations([place('a', 'A'), place('b', 'B')], { rankedIds: ['a', 'b'], pickedId: null })
    const unrankedView = buildPlacesLiveView(unranked)
    expect(unrankedView).not.toBeNull()
    expect(unrankedView!.ranked).toBe(false)
    expect(unrankedView!.items.map(i => i.name)).toEqual(['A', 'B'])
    expect(unrankedView!.items.some(i => i.recommended)).toBe(false)
  })

  it('never renders a product — Shopping keeps its own decision card', () => {
    const product = place('p', 'MacBook Air M2', { kind: 'product', domain: 'shopping' })
    expect(buildPlacesLiveView(recsFrom([product, place('b', 'B')], 'p'))).toBeNull()
  })

  it('carries the whole ranked result set, so a filter has something to filter', () => {
    // The approved composition shows "Tất cả (8)" over three cards: the UI shows
    // the top of the list and the filters re-select from the rest, which is only
    // possible if the payload carries more than the three on screen.
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => place(id, id.toUpperCase()))
    const view = buildPlacesLiveView(recsFrom(many, 'a'))
    expect(view!.items).toHaveLength(6)
    expect(view!.items[0].name).toBe('A')
  })

  it('keeps the engine order and marks which entries the shortlist named', () => {
    const view = buildPlacesLiveView(recsFrom(
      [place('a', 'A'), place('b', 'B'), place('c', 'C')],
      'a',
      ['a', 'b'],
    ))
    expect(view!.items.map(i => i.shortlistPosition)).toEqual([1, 2, undefined])
  })

  it('carries the provider map search when the tool returned one', () => {
    const url = 'https://www.google.com/maps/search/cafe+view+dep+Quan+1'
    const view = buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'), { mapsSearchUrl: url })
    expect(view!.mapsSearchUrl).toBe(url)
    // Never a fabricated destination.
    expect(buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'), { mapsSearchUrl: 'not a url' })!.mapsSearchUrl).toBeUndefined()
    expect(buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'))!.mapsSearchUrl).toBeUndefined()
  })

  it('carries the real attributes a chip can be built from, and no others', () => {
    const withAttrs = place('a', 'A', {
      attributes: { wifi: true, outdoorSeating: true, categories: ['coffee shop', 'cafe'] },
    } as never)
    const view = buildPlacesLiveView(recsFrom([withAttrs, place('b', 'B')], 'a'))!
    expect(view.items[0].flags).toEqual(['wifi', 'outdoorSeating'])
    expect(view.items[0].categories).toEqual(['coffee shop', 'cafe'])
    // The second place states none, so it carries none.
    expect(view.items[1].flags).toBeUndefined()
  })
})

describe('buildPlacesLiveView — facts are copied, never invented', () => {
  it('carries the scannable facts the card shows', () => {
    const view = buildPlacesLiveView(recsFrom([place('a', 'Cà Phê AnAn'), place('b', 'B')], 'a'))!
    const p = view.items[0]
    expect(p.rating).toBe(4.8)
    expect(p.ratingCount).toBe(320)
    expect(p.address).toBe('12 Lý Quốc Sư, Hoàn Kiếm')
    expect(p.openingHours).toBe('08:00–22:30')
    expect(p.openNow).toBe(true)
    expect(p.priceLevel).toBe(2)
    expect(p.distanceKm).toBe(1.2)
    expect(p.image).toBe('https://img/a.jpg')
  })

  it('🚨 omits a field the entity does not know — no zeros, no placeholders', () => {
    const bare = place('a', 'Quán không rõ', {
      images: { primary: null, gallery: [] },
      quality: { rating: unknownClaim<number>(), ratingCount: unknownClaim<number>(), tappyRating: null, stars: null },
      availability: { openingHours: unknownClaim<string>(), openNow: null },
      pricing: { price: unknownClaim<number>(), priceRange: null, priceLevel: null, priceSignal: unknownClaim<string>(), priceRangeText: unknownClaim<string>() },
      location: { address: unknownClaim<string>() as never, coordinates: null, distanceKm: null },
      attributes: {},
    })
    const p = buildPlacesLiveView(recsFrom([bare, place('b', 'B')], 'a'))!.items[0]
    for (const key of ['rating', 'ratingCount', 'address', 'openingHours', 'openNow', 'priceLevel', 'distanceKm', 'image', 'phone']) {
      expect(p, `${key} must be absent, not empty`).not.toHaveProperty(key)
    }
    expect(p.name).toBe('Quán không rõ')
  })

  it('carries the deterministic reason and trade-off, and nothing it made up', () => {
    const p = buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'))!.items[0]
    expect(p.reasons).toEqual([{ attribute: 'rating', evidence: '4.8⭐ · 320 đánh giá' }])
    expect(p.tradeOff).toEqual({ attribute: 'distance', evidence: 'xa hơn 1.5km so với lựa chọn kia' })
  })

  it('drops an action with no usable destination', () => {
    const broken = place('a', 'A', {
      actions: [
        action({ url: 'javascript:alert(1)' }),
        action({ kind: 'website', url: '', labelKey: 'action.website' }),
        action({ kind: 'order', url: 'https://shopeefood.vn/tim-kiem?q=A', labelKey: 'action.order', platform: 'ShopeeFood', urlKind: 'search' }),
      ],
    })
    const p = buildPlacesLiveView(recsFrom([broken, place('b', 'B')], 'a'))!.items[0]
    expect(p.actions.map(a => a.url)).toEqual(['https://shopeefood.vn/tim-kiem?q=A'])
    // The honesty field survives: a search URL must not be labelled as a direct one.
    expect(p.actions[0].urlKind).toBe('search')
  })

  it('🚨 every rendered option gets its own actions — a card without them is a dead end', () => {
    // The approved composition shows Maps / order / review on #2 and #3 as well,
    // so a secondary entry carries the same action set as the lead.
    const view = buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'))!
    expect(view.items[1].actions.length).toBeGreaterThan(0)
    for (const a of view.items[1].actions) expect(a.url).toMatch(/^https?:/)
  })

  it('reports the domain so each surface can render its own information architecture', () => {
    const spa = [place('a', 'Sen Spa', { domain: 'spa' }), place('b', 'B', { domain: 'spa' })]
    expect(buildPlacesLiveView(recsFrom(spa, 'a'))!.domain).toBe('spa')
  })
})

describe('readPlacesLiveView — the annotation channel', () => {
  it('finds the view among unrelated annotations', () => {
    const view = buildPlacesLiveView(recsFrom([place('a', 'A'), place('b', 'B')], 'a'))!
    expect(readPlacesLiveView([{ other: true }, view as unknown as Record<string, unknown>])).toEqual(view)
  })

  it('is inert on anything it does not recognise, and never throws', () => {
    expect(readPlacesLiveView(undefined)).toBeNull()
    expect(readPlacesLiveView([])).toBeNull()
    expect(readPlacesLiveView([null, 'text', 42, { kind: 'something.else' }])).toBeNull()
    expect(readPlacesLiveView([{ kind: PLACES_ANNOTATION_KIND }])).toBeNull() // no items → not renderable
    expect(readPlacesLiveView([{ kind: PLACES_ANNOTATION_KIND, items: [] }])).toBeNull()
  })
})
