import { describe, it, expect } from 'vitest'
import { renderPlacesMarker, parsePlacesMarker, toPersisted, mayPersist, PLACES_MARKER_OPEN, PLACES_MARKER_CLOSE } from './marker'
import { buildPlaceEntity, buildProductEntity } from './buildEntity'
import { buildRecommendations } from './recommendation'

// ── PART 11 — [TAPPY_PLACES] serialization, parsing, and survival ────────────
//
// The four shapes every marker parser must survive, from the shared fixture
// contract: closed, bare, unterminated, orphan tag. Strip is UNCONDITIONAL and
// INDEPENDENT of decode — a block that cannot be decoded is still a block the
// user must never read. Those rules are why raw JSON reached production twice.

const OSM_ROW = {
  name: 'Quán Cà Phê Cũ',
  address: '12 Nguyễn Huệ, Quận 1',
  opening_hours: 'Mo-Su 07:00-22:00',
  phone: '+84 28 999',
  maps_link: 'https://maps.google.com/?q=10.77,106.7',
  lat: 10.77,
  lng: 106.7,
}
const GOOGLE_ROW = {
  place_id: 'ChIJ_g',
  name: 'The Log Coffee',
  address: '123 Lê Lợi',
  rating_value: 4.5,
  rating_count: 2847,
  opening_hours: 'Thứ Hai: 07:00–22:00',
  phone: '+84 28 111',
  maps_link: 'https://maps.google.com/?cid=1',
}

const osmRecs = () => buildRecommendations([buildPlaceEntity(OSM_ROW, { domain: 'food', source: 'osm' })])
const googleRecs = () => buildRecommendations([buildPlaceEntity(GOOGLE_ROW, { domain: 'food', source: 'google_places' })])

describe('serialization', () => {
  it('renders a versioned, closed block', () => {
    const m = renderPlacesMarker(osmRecs())
    expect(m.startsWith(PLACES_MARKER_OPEN)).toBe(true)
    expect(m.endsWith(PLACES_MARKER_CLOSE)).toBe(true)
    expect(JSON.parse(m.slice(PLACES_MARKER_OPEN.length, -PLACES_MARKER_CLOSE.length)).v).toBe(1)
  })

  it('round-trips through the text channel', () => {
    const text = `Mình gợi ý vài quán nhé.\n\n${renderPlacesMarker(osmRecs())}`
    const { text: visible, payload } = parsePlacesMarker(text)
    expect(visible).toBe('Mình gợi ý vài quán nhé.')
    expect(payload?.items[0].name).toBe('Quán Cà Phê Cũ')
  })

  it('carries the actions with their urlKind all the way to the frontend contract', () => {
    const { payload } = parsePlacesMarker(renderPlacesMarker(osmRecs()))
    const maps = payload!.items[0].actions.find(a => a.kind === 'maps')!
    expect(maps.urlKind).toBe('direct')
    expect(maps.labelKey).toBe('v3.action.maps')
  })

  it('survives a reload — the payload lives in the message text, not in tool state', () => {
    // What "survives reload" means concretely: the string is all there is, and
    // parsing it again yields the same structured data.
    const stored = `Đây là gợi ý.\n\n${renderPlacesMarker(osmRecs())}`
    const first = parsePlacesMarker(stored)
    const second = parsePlacesMarker(stored)
    expect(second.payload).toEqual(first.payload)
    expect(second.payload!.items).toHaveLength(1)
  })
})

describe('the four shapes — strip is unconditional and independent of decode', () => {
  const body = 'Quán này ngon lắm.'

  it('closed', () => {
    const r = parsePlacesMarker(`${body}\n${renderPlacesMarker(osmRecs())}`)
    expect(r.text).toBe(body)
    expect(r.payload).not.toBeNull()
  })

  it('bare — an opening tag with no closing one, followed by nothing', () => {
    const r = parsePlacesMarker(`${body}\n${PLACES_MARKER_OPEN}{"v":1,"items":[{"id":"a","domain":"food","kind":"place","rank":0,"actions":[]}]}`)
    expect(r.text).toBe(body)
    expect(r.payload?.items).toHaveLength(1)
  })

  it('unterminated — truncated mid-payload still strips, and does not throw', () => {
    const r = parsePlacesMarker(`${body}\n${PLACES_MARKER_OPEN}{"v":1,"items":[{"id":`)
    expect(r.text).toBe(body)
    expect(r.payload).toBeNull()
  })

  it('orphan closing tag — no opening to anchor on', () => {
    const r = parsePlacesMarker(`${body}\n${PLACES_MARKER_CLOSE}`)
    expect(r.text).toBe(body)
    expect(r.payload).toBeNull()
  })

  it('no marker at all is returned untouched', () => {
    expect(parsePlacesMarker(body)).toEqual({ text: body, payload: null })
  })

  it('an empty items array decodes to null rather than an empty card', () => {
    expect(parsePlacesMarker(`${PLACES_MARKER_OPEN}{"v":1,"items":[]}${PLACES_MARKER_CLOSE}`).payload).toBeNull()
  })

  it('prose containing braces is not mistaken for a payload', () => {
    const prose = 'Giá khoảng {50k} một tô.'
    expect(parsePlacesMarker(prose).text).toBe(prose)
  })
})

describe('the persistence policy is enforced, not remembered', () => {
  // 🚨 This repository already states the rule, at tools/common.ts: Google Places
  // content must not be stored beyond the request; only place_id and lat/lng are
  // exempt. A marker frozen into a chat message IS storage, permanently.

  it('Google-sourced content is not written into the persisted payload', () => {
    const p = toPersisted(googleRecs()[0])
    expect(p.name).toBeUndefined()
    expect(p.address).toBeUndefined()
    expect(p.rating).toBeUndefined()
    expect(p.openingHours).toBeUndefined()
    expect(p.phone).toBeUndefined()
  })

  it('OSM-sourced content persists in full — different terms, different answer', () => {
    const p = toPersisted(osmRecs()[0])
    expect(p.name).toBe('Quán Cà Phê Cũ')
    expect(p.address).toBe('12 Nguyễn Huệ, Quận 1')
    expect(p.openingHours).toBe('Mo-Su 07:00-22:00')
  })

  it('a Serper product persists in full', () => {
    const rec = buildRecommendations([buildProductEntity({
      title: 'MacBook Air M2', link: 'https://shop.example/mba', price_vnd: 24990000, source: 'CellphoneS', rating: 4.8, photo_url: 'https://cdn.example/x.jpg',
    })])[0]
    const p = toPersisted(rec)
    expect(p.name).toBe('MacBook Air M2')
    expect(p.rating).toBe(4.8)
    expect(p.image).toBe('https://cdn.example/x.jpg')
  })

  it('a Google Photo URL is never persisted, whatever the row said', () => {
    const rec = buildRecommendations([
      buildPlaceEntity({ ...GOOGLE_ROW, photo_url: 'https://lh3.googleusercontent.example/p.jpg' }, { domain: 'food', source: 'google_places', imageSource: 'google_photo' }),
    ])[0]
    expect(toPersisted(rec).image).toBeUndefined()
  })

  it('what the application computed itself always persists', () => {
    // Rank, actions and match are ours — no provider terms apply to them.
    const p = toPersisted(googleRecs()[0])
    expect(p.rank).toBe(0)
    expect(p.actions.length).toBeGreaterThan(0)
    expect(p.id).toBe('place:google:ChIJ_g')
  })

  it('🚨 a field the source never stated is ABSENT, not the unknown sentinel', () => {
    // The entity records an unstated field as the string 'KHONG CO DU LIEU', so persisting it
    // by a bare typeof check froze that sentence into the message as if it were the place's real
    // address — and any client rendering the payload faithfully printed it. `liveView` guards its
    // own projection the same way; absent must mean absent on both sides.
    const bare = buildRecommendations([buildPlaceEntity(
      { name: 'Quán Vỉa Hè', maps_link: 'https://maps.google.com/?q=10.78,106.69', lat: 10.78, lng: 106.69 },
      { domain: 'food', source: 'osm' },
    )])[0]
    const p = toPersisted(bare)
    expect(p.address).toBeUndefined()
    expect(p.openingHours).toBeUndefined()
    expect(JSON.stringify(p)).not.toContain('KHONG CO DU LIEU')
    // What the row DID state still persists — the guard removes fabrications, not facts.
    expect(p.name).toBe('Quán Vỉa Hè')
    expect(p.actions.length).toBeGreaterThan(0)
  })

  it('mayPersist names google_places and nothing else', () => {
    expect(mayPersist('google_places')).toBe(false)
    for (const s of ['osm', 'serper_shopping', 'serper_search', 'serper_images', 'travelpayouts', 'tappy_reviews', 'computed'] as const) {
      expect(mayPersist(s), s).toBe(true)
    }
  })
})
