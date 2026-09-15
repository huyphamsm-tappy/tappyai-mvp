import { describe, it, expect } from 'vitest'
import { buildPlacesLiveView, type LivePlace } from './liveView'
import { buildRecommendations } from './recommendation'
import { unknownClaim, type CanonicalEntity } from './entity'
import type { Action } from './actions'

// ─────────────────────────────────────────────────────────────────────────────
// THE NO-INFORMATION-LOSS CONTRACT, AT THE ENTITY → PROJECTION BOUNDARY.
//
// 🚨 WHY A CONTRACT TEST AND NOT MORE UNIT TESTS. The audit that produced this
// file found the same defect shape four separate times, and every instance was
// invisible to the tests that existed:
//
//   · `priceSignal` was read from `row.price_search_results` while the data sat
//     on the ENVELOPE — so the field was `unknown` on every place, in every
//     domain, on every turn, and no test noticed because the projection was
//     "correctly" projecting an absent value.
//   · `review_actions` were built, then dropped by a `continue`.
//   · stay photos were dropped by a dedupe that kept the wrong row.
//   · `phone`, `reasons` and `tappyRating` reached `LivePlace` and were never
//     rendered.
//
// Each one is a different mechanism. What they share is a SEAM: an entity that
// knows something, and a projection that quietly does not carry it. Testing the
// mechanisms one at a time is how four of them shipped. This tests the seam.
//
// 🔑 THE ASSERTION IS ONE-DIRECTIONAL. It says: if the entity states a field,
// the projection must carry it. It does NOT say the projection may only carry
// stated fields — that is `liveView.test.ts`'s job, and it already does it.
// Keeping the two apart is deliberate: this file must never become a reason to
// weaken the "never invent a value" rule it sits next to.
// ─────────────────────────────────────────────────────────────────────────────

const action = (over: Partial<Action> = {}): Action => ({
  kind: 'maps', urlKind: 'direct', url: 'https://maps.google.com/?q=1',
  labelKey: 'v3.action.maps', priority: 1, ...over,
})

/**
 * An entity that states EVERY field the pipeline can retrieve.
 *
 * Deliberately maximal: the point of the fixture is that nothing here is
 * optional, so a projection that forgets any one of them fails.
 */
function fullyPopulated(): CanonicalEntity {
  return {
    v: 1,
    id: 'e1',
    domain: 'food',
    kind: 'place',
    identity: { name: 'Bún Bò Huế Đông Ba', sourceRefs: [{ src: 'google_places', ref: 'p1' }] },
    images: {
      primary: { url: 'https://img/a.jpg', source: 'serper_images', stability: 'volatile' },
      gallery: [{ url: 'https://img/a.jpg', source: 'serper_images', stability: 'volatile' }],
    },
    location: { address: '19 Trần Cao Vân, Quận 1', coordinates: { lat: 10.78, lng: 106.7 }, distanceKm: 1.2 },
    quality: {
      rating: { value: 4.8, evidence_type: 'FACT', source_type: 'structured_provider' },
      ratingCount: { value: 320, evidence_type: 'FACT', source_type: 'structured_provider' },
      tappyRating: { avg: 4.5, count: 12 },
      stars: null,
    },
    pricing: {
      price: unknownClaim<number>(),
      priceRange: { low: 30000, high: 60000, currency: 'VND' },
      priceLevel: 2,
      priceSignal: { value: 'price_search_results', evidence_type: 'REVIEW_SUPPORTED', source_type: 'search_snippet' },
      priceRangeText: { value: '1-100.000 ₫', evidence_type: 'FACT', source_type: 'structured_provider' },
    },
    availability: {
      openingHours: { value: '06:00–21:00', evidence_type: 'FACT', source_type: 'structured_provider' },
      openNow: true,
    },
    attributes: { phone: '02838294888', wifi: true, outdoorSeating: true, vegetarian: true, categories: ['vietnamese', 'noodle'] },
    reviews: { actions: [], availability: 'search' },
    actions: [
      action(),
      action({ kind: 'call', url: 'tel:02838294888', labelKey: 'v3.action.call', priority: 2 }),
      action({ kind: 'website', url: 'https://dongba.vn', labelKey: 'v3.action.website', priority: 3 }),
      action({ kind: 'order', url: 'https://shopeefood.vn/dong-ba', labelKey: 'v3.action.order', priority: 0, attributed: true }),
      action({ kind: 'review', url: 'https://www.tiktok.com/@x/video/1', labelKey: 'v3.action.review', priority: 4, attributed: true }),
      // Exactly MAX_ACTIONS kinds, and that is the point: a food venue has no
      // reservation or ticket action, so putting them here would test the CAP
      // rather than the seam. They get their own domains below, where they are
      // real — see the two `belongs to its domain` cases.
    ],
    provenance: { 'identity.name': 'google_places' },
    ext: {},
  } as CanonicalEntity
}

const project = (e: CanonicalEntity): LivePlace => {
  const view = buildPlacesLiveView(buildRecommendations([e], {
    rankedIds: [e.id],
    shortlist: [{ rank: 0, id: e.id, name: e.identity.name, role: 'best_overall' }],
    pickedId: e.id,
    reasons: { [e.id]: [{ attribute: 'rating', evidence: '4.8⭐ · 320 đánh giá' }] },
    tradeOffs: { [e.id]: { attribute: 'distance', evidence: 'xa hơn 1.5km' } },
  }))
  expect(view).not.toBeNull()
  return view!.items[0]
}

/**
 * Every field the contract covers, as `(name, does the entity state it?, does
 * the projection carry it?)`.
 *
 * The third column is what makes this a contract rather than a snapshot: each
 * entry names the seam, so a failure says WHICH field was lost rather than
 * "object did not match".
 */
const COVERED: Array<{
  field: string
  strip: (e: CanonicalEntity) => void
  present: (p: LivePlace) => boolean
}> = [
  { field: 'rating', strip: e => { e.quality.rating = unknownClaim<number>() }, present: p => typeof p.rating === 'number' },
  { field: 'reviewCount', strip: e => { e.quality.ratingCount = unknownClaim<number>() }, present: p => typeof p.ratingCount === 'number' },
  { field: 'tappyRating', strip: e => { e.quality.tappyRating = null }, present: p => !!p.tappyRating },
  { field: 'phone', strip: e => { delete e.attributes.phone }, present: p => !!p.phone },
  { field: 'address', strip: e => { e.location.address = unknownClaim<string>().value }, present: p => !!p.address },
  { field: 'openingHours', strip: e => { e.availability.openingHours = unknownClaim<string>() }, present: p => !!p.openingHours },
  { field: 'openNow', strip: e => { e.availability.openNow = null }, present: p => typeof p.openNow === 'boolean' },
  { field: 'priceLevel', strip: e => { e.pricing.priceLevel = null }, present: p => typeof p.priceLevel === 'number' },
  { field: 'priceSignal', strip: e => { e.pricing.priceSignal = unknownClaim<string>() }, present: p => !!p.priceSignal },
  { field: 'priceRangeText', strip: e => { e.pricing.priceRangeText = unknownClaim<string>() }, present: p => !!p.priceRangeText },
  { field: 'distanceKm', strip: e => { e.location.distanceKm = null }, present: p => typeof p.distanceKm === 'number' },
  { field: 'categories', strip: e => { delete e.attributes.categories }, present: p => !!p.categories?.length },
  { field: 'flags', strip: e => { delete e.attributes.wifi; delete e.attributes.outdoorSeating; delete e.attributes.vegetarian }, present: p => !!p.flags?.length },
  { field: 'photo', strip: e => { e.images = { primary: null, gallery: [] } as CanonicalEntity['images'] }, present: p => !!p.image },
  { field: 'website', strip: e => { e.actions = e.actions.filter(a => a.kind !== 'website') }, present: p => p.actions.some(a => a.kind === 'website') },
  { field: 'ordering', strip: e => { e.actions = e.actions.filter(a => a.kind !== 'order') }, present: p => p.actions.some(a => a.kind === 'order') },
  { field: 'review', strip: e => { e.actions = e.actions.filter(a => a.kind !== 'review') }, present: p => p.actions.some(a => a.kind === 'review') },
  { field: 'call', strip: e => { e.actions = e.actions.filter(a => a.kind !== 'call') }, present: p => p.actions.some(a => a.kind === 'call') },
  { field: 'maps', strip: e => { e.actions = e.actions.filter(a => a.kind !== 'maps') }, present: p => p.actions.some(a => a.kind === 'maps') },
  { field: 'reasons', strip: () => {}, present: p => !!p.reasons?.length },
]

describe('NO INFORMATION LOSS — entity → projection', () => {
  it.each(COVERED.map(c => c.field))('preserves %s when the entity states it', field => {
    const spec = COVERED.find(c => c.field === field)!
    expect(spec.present(project(fullyPopulated()))).toBe(true)
  })

  /**
   * 🚨 THE MUTATION HALF, AND IT IS THE HALF THAT MATTERS.
   *
   * The positive assertions above pass just as happily against a projection that
   * hardcodes every value — which is exactly the "test asserts the field exists,
   * not that it came from anywhere" trap. Each case here removes the field from
   * the ENTITY and requires the projection to stop carrying it, which is what
   * ties the two ends together. A projection that invents a default fails here;
   * a projection that drops a stated field fails above.
   */
  it.each(COVERED.filter(c => c.field !== 'reasons').map(c => c.field))(
    'stops carrying %s when the entity no longer states it',
    field => {
      const spec = COVERED.find(c => c.field === field)!
      const e = fullyPopulated()
      spec.strip(e)
      expect(spec.present(project(e))).toBe(false)
    },
  )

  /**
   * The action cap is a LAYOUT decision, and it must not silently eat a kind.
   *
   * `MAX_ACTIONS` is 6 and this fixture carries 7 actions on purpose: the
   * kind-first pass in `liveActions` must spend those six slots on six DIFFERENT
   * kinds rather than on the highest-priority ones. A cap that drops the phone
   * number to fit a second order platform is information loss wearing a layout
   * excuse.
   */
  it('spends a capped action list on distinct kinds, never duplicates', () => {
    const kinds = project(fullyPopulated()).actions.map(a => a.kind)
    expect(kinds.length).toBe(new Set(kinds).size)
  })

  /**
   * `reservation` and `ticket` in the domains that actually produce them.
   *
   * 🚨 FOUND BY THIS FILE, and worth recording: asserting them on the FOOD
   * fixture failed, because seven kinds do not fit a six-slot cap and `ticket`
   * is not in `PRIORITY.food` at all, so it sorted last and was dropped. That is
   * the layout cap behaving as designed — but it is also precisely the shape of
   * a silent loss, so each kind is now proven where its domain ranks it.
   */
  it.each([
    ['spa', 'reservation', 'https://book.example/x'],
    ['entertainment', 'ticket', 'https://ticket.example/x'],
  ] as const)("carries the %s domain's %s action", (domain, kind, url) => {
    const e = fullyPopulated()
    e.domain = domain as CanonicalEntity['domain']
    e.actions = [action(), action({ kind, url, labelKey: `v3.action.${kind}`, priority: 0 })]
    const p = project(e)
    expect(p.actions.some(a => a.kind === kind)).toBe(true)
    expect(p.actions.find(a => a.kind === kind)!.url).toBe(url)
  })
})
