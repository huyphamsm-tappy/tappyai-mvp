import { describe, it, expect } from 'vitest'

// ── Gate 2 N1/N2 (I1): every receiver admits an image only as a safe https URL ──
//
// The sources are checked (imageUrlSources.test.ts), but values cached BEFORE that check, a stored
// message and any future source that forgets the rule still reach these receivers. So each one
// checks again with `isSafeHttpsUrl`: `entityImage` (R-1, the shopping card), the live place card
// (R-2), the client read-back of a STORED place card (R-3 — the only path covering old messages on
// the web) and `buildImages` (R-5). NT-* ids are registered in gate2/n12/N12-ADDENDUM.md.

import { buildShoppingSynthesis } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, renderShoppingMarker, parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import type { Candidate } from '@/lib/ai/consultative/candidate'
import { buildPlacesLiveView, readPlacesLiveView, PLACES_ANNOTATION_KIND } from './liveView'
import { buildRecommendations } from './recommendation'
import { buildImages } from './buildEntity'
import { unknownClaim, type CanonicalEntity } from './entity'

const BAD = [
  'http://cdn.example/a.jpg',
  'data:image/png;base64,iVBORw0KGgo',
  'javascript:alert(1)',
  'httpfoo://x/a.jpg',
  'https://localhost/a.jpg',
  'https://127.0.0.1/a.jpg',
  'https://10.0.0.5/a.jpg',
  'https://u:p@cdn.example/a.jpg',
  'https://[::1]/a.jpg',
]
const GOOD = 'https://cdn.example/a.jpg'
const REQUEST = 'Tôi muốn mua tai nghe Sony WH-1000XM5'

function cand(seller: string, extra: Record<string, unknown>): Candidate {
  const name = 'Tai nghe Sony WH-1000XM5'
  return {
    id: `${seller}:${name}`, name, domain: 'shopping',
    attrs: { priceVnd: 6_990_000, rating: 4.7, reviewCount: 120 },
    link: `https://shop.example/${seller}`,
    raw: { title: name, source: seller, price_vnd: 6_990_000, link: `https://shop.example/${seller}`, rating: 4.7, rating_count: 120, ...extra },
  }
}
const imageOf = (raw: Record<string, unknown>) => buildSynthesisView(buildShoppingSynthesis([cand('ShopA', raw)], null, REQUEST)).entities[0]?.image

describe('NT-5 — entityImage (R-1)', () => {
  for (const bad of BAD) {
    it(`photo_url ${bad.slice(0, 32)} → no image`, () => expect(imageOf({ photo_url: bad })).toBeNull())
  }
  it('an unsafe imageUrl (the shopping-row field) → no image', () => expect(imageOf({ imageUrl: 'http://cdn.example/b.jpg' })).toBeNull())
  it('control: a public https photo is the image', () => expect(imageOf({ photo_url: GOOD })).toBe(GOOD))
})

describe('NT-11 — the [TAPPY_SHOPPING] marker the route builds from a row served from cache (no source check on the way)', () => {
  it('the marker JSON carries no unsafe image; the safe one survives the round trip', () => {
    const v = buildSynthesisView(buildShoppingSynthesis([cand('Cached', { photo_url: 'http://cdn.example/cached.jpg' }), cand('Fresh', { photo_url: GOOD })], null, REQUEST))
    const marker = renderShoppingMarker(v)
    expect(marker).not.toContain('http://cdn.example/cached.jpg')
    const parsed = parseShoppingMarker(marker).view!
    const imgs = parsed.entities.map(e => e.image).filter(Boolean)
    expect(imgs).not.toContain('http://cdn.example/cached.jpg')
  })
})

function place(id: string, name: string, image: string): CanonicalEntity {
  return {
    v: 1, id, domain: 'food', kind: 'place',
    identity: { name, sourceRefs: [] },
    images: { primary: { url: image, source: 'serper_images', stability: 'volatile' }, gallery: [] },
    location: { address: '12 Lý Quốc Sư, Hoàn Kiếm', coordinates: null, distanceKm: 1.2 },
    quality: { rating: { value: 4.8, evidence_type: 'FACT', source_type: 'google_places' }, ratingCount: { value: 320, evidence_type: 'FACT', source_type: 'google_places' }, tappyRating: null, stars: null },
    pricing: { price: unknownClaim<number>(), priceRange: null, priceLevel: 2, priceSignal: unknownClaim<string>() },
    availability: { openingHours: { value: '08:00–22:30', evidence_type: 'FACT', source_type: 'google_places' }, openNow: true },
    attributes: { phone: '02412345678' },
    reviews: { actions: [], coverage: 'search' },
    actions: [{ kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?q=1', labelKey: 'action.maps', priority: 1 }],
    provenance: {}, ext: {},
  } as unknown as CanonicalEntity
}
const recsOf = (entities: CanonicalEntity[]) => buildRecommendations(entities, {
  rankedIds: entities.map(e => e.id),
  shortlist: entities.map((e, i) => ({ rank: i, id: e.id, name: e.id, role: i === 0 ? 'best_overall' : 'value_gem' })),
  pickedId: entities[0]?.id ?? null,
  reasons: {}, tradeOffs: {},
} as never)

describe('NT-6 — the live place card (R-2)', () => {
  for (const bad of BAD) {
    it(`primary image ${bad.slice(0, 32)} → the card item has no image; the safe neighbour keeps its own`, () => {
      const view = buildPlacesLiveView(recsOf([place('b', 'Quán xấu', bad), place('g', 'Quán tốt', GOOD)]))!
      const byId = new Map(view.items.map(i => [i.id, i]))
      expect(byId.get('b')).toBeDefined()
      expect(byId.get('b')!.image).toBeUndefined()
      expect(byId.get('g')?.image).toBe(GOOD)
    })
  }
})

describe('NT-7 — reading back a STORED place card (R-3)', () => {
  it('an unsafe image is dropped; name, id, actions and the safe image are kept', () => {
    const items = [...BAD.map((u, i) => ({ id: `b${i}`, name: `Quán ${i}`, image: u, actions: [{ kind: 'maps', url: 'https://maps.google.com/?q=1' }] })), { id: 'g', name: 'Quán tốt', image: GOOD, actions: [] }]
    const view = readPlacesLiveView([{ kind: PLACES_ANNOTATION_KIND, v: 1, items }])!
    expect(view.items).toHaveLength(items.length)
    view.items.forEach((it, i) => {
      expect(it.name).toBe(items[i].name)
      expect(it.id).toBe(items[i].id)
      if (i < BAD.length) {
        expect(it.image).toBeUndefined()
        expect(it.actions).toHaveLength(1)
      } else expect(it.image).toBe(GOOD)
    })
  })
})

describe('NT-9 — buildImages (R-5)', () => {
  it('an unsafe URL is neither primary nor in the gallery; a safe one is', () => {
    for (const bad of BAD) {
      const imgs = buildImages({ photo_url: bad }, 'serper_images')
      expect(imgs.primary).toBeNull()
      expect(imgs.gallery).toHaveLength(0)
    }
    const ok = buildImages({ photo_url: GOOD, photo_urls: ['http://cdn.example/x.jpg', GOOD] }, 'serper_images')
    expect(ok.primary?.url).toBe(GOOD)
    expect(ok.gallery.map(g => g.url)).toEqual([GOOD])
  })
})
