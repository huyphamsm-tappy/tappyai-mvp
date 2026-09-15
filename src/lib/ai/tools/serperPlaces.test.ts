import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperPlaces, serperPlaceToRow, isOpenNow, hoursForDay, vietnamNow } from './serperPlaces'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// THE FIXTURE IS A REAL RESPONSE, NOT AN INVENTED ONE.
//
// Captured from the live provider on 2026-09-10 for "quán bún bò ngon TP.HCM"
// (credits: 3, 20 rows). Using a real payload is the whole point: a hand-written
// fixture would agree with whatever the parser happens to do, which is how a
// field the provider actually sends ends up silently unread.
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_ROW = {
  position: 1,
  title: 'Bún bò Huế - Bến Ngự',
  address: '585 Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh 700000, Việt Nam',
  latitude: 10.74105,
  longitude: 106.72996549999999,
  rating: 4.4,
  ratingCount: 589,
  priceLevel: '1-100.000 ₫',
  type: 'Quán ăn nhỏ',
  types: ['Quán ăn nhỏ'],
  phoneNumber: '+84 917 607 088',
  openingHours: {
    'Thứ Năm': '06:00–20:00', 'Thứ Sáu': '06:00–19:00', 'Thứ Bảy': '06:00–20:00',
    'Chủ Nhật': '06:00–20:00', 'Thứ Hai': '06:00–12:00', 'Thứ Ba': '06:00–20:00',
    'Thứ Tư': '06:00–20:00',
  },
  thumbnailUrl: 'https://lh3.googleusercontent.com/gps-cs-s/abc',
  website: 'https://benngu.example/',
  cid: '8252027741556609696',
  fid: '0x1234:0x5678',
}

let captured: Array<{ url: string; body: Record<string, unknown> }>

function stub(payload: unknown, ok = true) {
  captured = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    captured.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(payload), { status: ok ? 200 : 500 })
  }))
}

beforeEach(() => { __clearToolCache(); vi.stubEnv('SERPER_API_KEY', 'test-key') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('serperPlaces — every field the provider sends is kept', () => {
  it('parses the live row without losing a single field', async () => {
    stub({ places: [LIVE_ROW], credits: 3 })
    const out = await serperPlaces('quán bún bò ngon TP.HCM')
    expect(out).toHaveLength(1)
    expect(out![0]).toMatchObject({
      title: 'Bún bò Huế - Bến Ngự',
      address: '585 Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh 700000, Việt Nam',
      latitude: 10.74105,
      rating: 4.4,
      ratingCount: 589,
      priceLevel: '1-100.000 ₫',
      type: 'Quán ăn nhỏ',
      types: ['Quán ăn nhỏ'],
      phoneNumber: '+84 917 607 088',
      cid: '8252027741556609696',
    })
    expect(out![0].openingHours?.['Thứ Hai']).toBe('06:00–12:00')
    expect(out![0].thumbnailUrl).toContain('googleusercontent')
    expect(out![0].website).toContain('benngu.example')
  })

  it('hits /maps, not /search', async () => {
    stub({ places: [LIVE_ROW] })
    await serperPlaces('x')
    expect(captured[0].url).toBe('https://google.serper.dev/maps')
  })

  /**
   * 🚨 `ll` IS THE ONLY TARGETING THAT WORKS. Measured: the documented `location`
   * string returned ZERO rows for 'Ho Chi Minh City, Vietnam', while `ll`
   * returned 20/20 rows genuinely in the requested city. Sending the wrong one
   * would silently un-scope every remote search — BUG-011, re-entering through
   * the provider.
   */
  it('targets with ll and never with a location string', async () => {
    stub({ places: [LIVE_ROW] })
    await serperPlaces('khách sạn', { lat: 16.0544, lng: 108.2022 })
    expect(captured[0].body.ll).toBe('@16.0544,108.2022,14z')
    expect(captured[0].body).not.toHaveProperty('location')
  })

  it('omits ll entirely when no centre was resolved', async () => {
    stub({ places: [LIVE_ROW] })
    await serperPlaces('x', null)
    expect(captured[0].body).not.toHaveProperty('ll')
  })

  it('refuses to invent: absent provider fields stay absent', async () => {
    stub({ places: [{ title: 'Quán Trơ' }] })
    const out = await serperPlaces('x')
    const rec = out![0]
    expect(rec.title).toBe('Quán Trơ')
    for (const k of ['rating', 'ratingCount', 'priceLevel', 'phoneNumber', 'website', 'thumbnailUrl', 'address']) {
      expect(rec).not.toHaveProperty(k)
    }
  })

  it('rejects a rating outside 0–5 rather than passing it through', async () => {
    stub({ places: [{ ...LIVE_ROW, rating: 9 }] })
    expect((await serperPlaces('x'))![0]).not.toHaveProperty('rating')
  })

  it('degrades to null on a failed call, so callers keep their fallback', async () => {
    stub({}, false)
    expect(await serperPlaces('x')).toBeNull()
  })

  it('returns null without a key rather than calling the provider', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    stub({ places: [LIVE_ROW] })
    expect(await serperPlaces('x')).toBeNull()
    expect(captured).toHaveLength(0)
  })

  it('caches, so the same query is not billed twice in one turn', async () => {
    stub({ places: [LIVE_ROW] })
    await serperPlaces('bún bò', { lat: 10.77, lng: 106.7 })
    await serperPlaces('bún bò', { lat: 10.77, lng: 106.7 })
    expect(captured).toHaveLength(1)
  })

  /**
   * 🚨 THE SAME QUERY AT TWO CENTRES IS TWO DIFFERENT QUESTIONS. Sharing a cache
   * entry between them would answer "khách sạn" in Đà Nẵng with Sài Gòn hotels —
   * BUG-011 re-entering through the cache rather than the request.
   */
  it('does NOT share a cache entry between two cities', async () => {
    stub({ places: [LIVE_ROW] })
    await serperPlaces('khách sạn', { lat: 10.77, lng: 106.7 })
    await serperPlaces('khách sạn', { lat: 16.05, lng: 108.2 })
    expect(captured).toHaveLength(2)
  })
})

describe('serperPlaceToRow — the provider record becomes a pipeline row', () => {
  const ratingText = (r: number, c: number | undefined) => `${r}⭐ (${c} đánh giá)`
  // A Thursday 09:00 in Vietnam: inside the published 06:00–20:00 window.
  const THU_0900 = new Date('2026-09-10T02:00:00Z')

  it('carries every retrievable field onto the row', () => {
    const row = serperPlaceToRow(LIVE_ROW, { ratingText, now: THU_0900 })
    expect(row).toMatchObject({
      name: 'Bún bò Huế - Bến Ngự',
      rating_value: 4.4,
      rating_count: 589,
      google_rating: '4.4⭐ (589 đánh giá)',
      phone: '+84 917 607 088',
      price_range_text: '1-100.000 ₫',
      place_types: ['Quán ăn nhỏ'],
      website_uri: 'https://benngu.example/',
      opening_hours: '06:00–20:00',
      open_now: true,
      lat: 10.74105,
    })
    expect(row.maps_link).toBe('https://maps.google.com/?cid=8252027741556609696')
    expect(row.photo_url).toContain('googleusercontent')
  })

  /**
   * 🔑 THE THUMBNAIL IS WHY THE ENDPOINT SWITCH PAYS FOR ITSELF. A photo arriving
   * WITH the record is one `/images` request not made, per place, per turn.
   */
  it('attaches the thumbnail as the row photo, needing no /images call', () => {
    const row = serperPlaceToRow(LIVE_ROW, { ratingText, now: THU_0900 })
    expect(row.photo_urls).toEqual([LIVE_ROW.thumbnailUrl])
  })

  /**
   * 🚨 NOT PARSED INTO A NUMBER. "1-100.000 ₫" has a low end of 1, and a 1 VND
   * price is the documented placeholder the shopping guard rejects. Parsing it
   * would let a placeholder win a "cheapest" ranking.
   */
  it('keeps the price band as the provider\'s string, never a number', () => {
    const row = serperPlaceToRow(LIVE_ROW, { ratingText, now: THU_0900 })
    expect(row.price_range_text).toBe('1-100.000 ₫')
    expect(row).not.toHaveProperty('price_level')
    expect(row).not.toHaveProperty('price_range')
  })

  it('emits distance only when the search was centred on the user (BUG-011 D2)', () => {
    const near = serperPlaceToRow(LIVE_ROW, {
      ratingText, now: THU_0900,
      userAt: { lat: 10.7756, lng: 106.7019 },
      distanceKm: () => 4.2,
    })
    expect(near.distance_km).toBe(4.2)
    const remote = serperPlaceToRow(LIVE_ROW, { ratingText, now: THU_0900, userAt: null, distanceKm: () => 600 })
    expect(remote).not.toHaveProperty('distance_km')
  })

  /**
   * 🚨 AN ABSENT FIELD MUST HAVE NO KEY, NOT AN EMPTY ONE — and a mutation
   * proved this was untested. `serperPlaces` was covered for invention;
   * `serperPlaceToRow` was not, and it is the half the MODEL reads. A row
   * carrying `address: ''` is not "no address": it is an address the model can
   * quote, and an empty string rendered next to a venue name reads as a fact
   * about that venue.
   */
  it('gives an absent provider field NO KEY on the row — never an empty one', () => {
    const row = serperPlaceToRow({ title: 'Quán Trơ' }, { ratingText, now: THU_0900 })
    expect(Object.keys(row)).toEqual(['name'])
    for (const k of ['address', 'phone', 'website_uri', 'price_range_text', 'rating_value',
                     'rating_count', 'opening_hours', 'open_now', 'photo_url', 'place_types', 'maps_link']) {
      expect(row).not.toHaveProperty(k)
    }
  })

  it('omits open_now when the provider published no hours', () => {
    const { openingHours, ...noHours } = LIVE_ROW
    void openingHours
    const row = serperPlaceToRow(noHours, { ratingText, now: THU_0900 })
    expect(row).not.toHaveProperty('open_now')
    expect(row).not.toHaveProperty('opening_hours')
  })
})

describe('opening hours — a schedule is not a live state', () => {
  it('reads the right day, in the provider\'s own language', () => {
    expect(hoursForDay(LIVE_ROW.openingHours, 1)).toBe('06:00–12:00') // Monday
    expect(hoursForDay(LIVE_ROW.openingHours, 0)).toBe('06:00–20:00') // Sunday
    expect(hoursForDay(undefined, 3)).toBeUndefined()
  })

  it('handles English day keys too, since hl is a parameter', () => {
    expect(hoursForDay({ Monday: '08:00–17:00' }, 1)).toBe('08:00–17:00')
  })

  it.each([
    ['06:00–20:00', 9 * 60, true],
    ['06:00–20:00', 21 * 60, false],
    ['06:00–20:00', 5 * 60, false],
    ['18:00–02:00', 23 * 60, true],   // crosses midnight
    ['18:00–02:00', 1 * 60, true],
    ['18:00–02:00', 15 * 60, false],
    ['06:00–11:00, 17:00–21:00', 18 * 60, true],  // split shift
    ['06:00–11:00, 17:00–21:00', 13 * 60, false],
  ])('%s at %i minutes → %s', (text, minutes, want) => {
    expect(isOpenNow(text, { minutes })).toBe(want)
  })

  /**
   * 🚨 "I CANNOT TELL" MUST NEVER BECOME "CLOSED". Closed is a claim about the
   * venue; null is the absence of one, and the entity models the two differently.
   */
  it('returns null for anything undecidable', () => {
    expect(isOpenNow(undefined, { minutes: 600 })).toBeNull()
    expect(isOpenNow('Mở cả ngày theo lịch hẹn', { minutes: 600 })).toBeNull()
  })

  it('reads an explicit closed day as closed, not as unknown', () => {
    expect(isOpenNow('Đóng cửa', { minutes: 600 })).toBe(false)
  })

  it('computes the day and minute in Vietnam time regardless of server zone', () => {
    // 2026-09-10T02:00:00Z is 09:00 on Thursday in UTC+7.
    const t = vietnamNow(new Date('2026-09-10T02:00:00Z'))
    expect(t.day).toBe(4)
    expect(t.minutes).toBe(9 * 60)
  })
})
