import { describe, it, expect } from 'vitest'
import { admitsStay, admitStays, isAggregateTitle, stayNameFromTitle, stayIdentityTokens, sameStay, isCategoryOnlyName } from './stayAdmission'
import { cityForName } from '@/lib/ai/tools/vietnamCities'

// The eight cards this file exists to reduce to three. Verbatim from the live
// run on 2026-09-10, query "khách sạn Đà Nẵng giá rẻ".
const OTA = 'https://www.booking.com/hotel/vn/oc-tien-sa.vi.html'
const OTA2 = 'https://www.agoda.com/oc-tien-sa-hotel/hotel/da-nang-vn.html'
const OTA3 = 'https://www.booking.com/hotel/vn/dai-long.vi.html'
const SEARCH_PAGE = 'https://www.booking.com/searchresults.vi.html?city=-3712125'
const CITY_PAGE = 'https://www.booking.com/city/vn/da-nang.vi.html'

const DA_NANG = cityForName('Da Nang')

describe('an ARTICLE is not a hotel', () => {
  it.each([
    '10 khách sạn tốt nhất tại Đà Nẵng năm 2026',
    'Top 15 resort Đà Nẵng đáng ở nhất',
    'Danh sách khách sạn giá rẻ Đà Nẵng',
    'Các khách sạn view biển Đà Nẵng',
    'Kinh nghiệm đặt phòng Đà Nẵng',
  ])('rejects %s', title => {
    expect(isAggregateTitle(title)).toBe(true)
    expect(admitsStay({ title, link: OTA })).toBe(false)
  })

  it('a real hotel whose name merely contains a superlative-ish word survives', () => {
    expect(isAggregateTitle('Muong Thanh Grand Da Nang')).toBe(false)
    expect(admitsStay({ title: 'Muong Thanh Grand Da Nang', link: OTA })).toBe(true)
  })
})

describe('a SEARCH or CITY page is not a hotel', () => {
  it('rejects an OTA search-results page', () => {
    expect(admitsStay({ title: 'Khách sạn Đà Nẵng', link: SEARCH_PAGE })).toBe(false)
  })
  it('rejects an OTA city landing page', () => {
    expect(admitsStay({ title: 'Đà Nẵng', link: CITY_PAGE })).toBe(false)
  })
  it('rejects a snippet with no link at all', () => {
    expect(admitsStay({ title: 'Oc Tien Sa Hotel' })).toBe(false)
  })
})

describe('the WRONG CITY is not this city', () => {
  it('rejects the Hội An hotel that appeared on a Đà Nẵng query', () => {
    expect(admitsStay({ title: 'Dai Long Hotel | Hoi An 2026 UPDATED DEALS', link: OTA3 }, DA_NANG)).toBe(false)
  })

  it('keeps the same hotel when the destination IS Hội An', () => {
    expect(admitsStay({ title: 'Dai Long Hotel | Hoi An 2026', link: OTA3 }, cityForName('Hoi An'))).toBe(true)
  })

  /**
   * Asymmetric on purpose, exactly like `belongsToDestination`: a title naming
   * no city we know is KEPT. "I cannot tell" must never become "wrong", or the
   * guard empties legitimate result sets — most OTA titles name no city at all.
   */
  it('keeps a title that resolves to no known city', () => {
    expect(admitsStay({ title: 'Sunrise Boutique Hotel', link: OTA }, DA_NANG)).toBe(true)
  })

  it('is inert when no destination was resolved', () => {
    expect(admitsStay({ title: 'Dai Long Hotel | Hoi An 2026', link: OTA3 }, null)).toBe(true)
  })
})

describe('an OSM row is judged as structured data, not as a snippet', () => {
  it('admits a coordinate row with no link', () => {
    expect(admitsStay({ name: 'Khách sạn Đại Long', lat: 16.05, lng: 108.2 })).toBe(true)
  })
  it('still requires a name', () => {
    expect(admitsStay({ lat: 16.05, lng: 108.2 })).toBe(false)
  })
})

describe('stayNameFromTitle strips OTA chrome', () => {
  it.each([
    ['Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com', 'Oc Tien Sa Hotel Danang'],
    ['Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD', 'Dai Long Hotel'],
    ['Dai Long Hotel, Đà Nẵng (cập nhật giá năm 2026)', 'Dai Long Hotel, Đà Nẵng'],
    ['Oc Tien Sa Hotel - Da Nang - Booking.com', 'Oc Tien Sa Hotel'],
  ])('%s → %s', (raw, want) => {
    expect(stayNameFromTitle(raw)).toBe(want)
  })
})

describe('ONE hotel is ONE card, however many URLs point at it', () => {
  it('collapses the four Ốc Tiên Sa rows the live run produced', () => {
    const tokens = [
      'Oc Tien Sa Hotel',
      'Oc Tien Sa Hotel Danang',
      'Khách sạn Ốc Tiên Sa, Hải Châu, Đà Nẵng',
      'Oc Tien Sa Hotel Danang Da Nang Vietnam',
    ].map(stayIdentityTokens)
    for (const t of tokens.slice(1)) expect(sameStay(tokens[0], t)).toBe(true)
  })

  it('does NOT collapse two genuinely different hotels', () => {
    expect(sameStay(stayIdentityTokens('Oc Tien Sa Hotel'), stayIdentityTokens('Dai Long Hotel'))).toBe(false)
  })

  /**
   * The containment rule needs two tokens. A one-token name is too weak to
   * absorb another by subset — "Grand" would otherwise swallow "Grand Mercure".
   */
  it('a single-token name only matches an identical single-token name', () => {
    expect(sameStay(['grand'], ['grand', 'mercure'])).toBe(false)
    expect(sameStay(['grand'], ['grand'])).toBe(true)
  })
})

describe('a name that is only a CATEGORY is not an identity', () => {
  it.each(['Nơi ở', 'Khách sạn', 'Hotel', 'Nhà nghỉ'])('rejects %s', n => {
    expect(isCategoryOnlyName(n)).toBe(true)
  })
  it('keeps a real name', () => {
    expect(isCategoryOnlyName('Khách sạn Đại Long')).toBe(false)
  })
})

describe('admitStays — the full live result set', () => {
  const LIVE = [
    { name: 'Oc Tien Sa Hotel', lat: 16.06, lng: 108.22, address: '52 Loseby' },
    { name: 'Nơi ở', lat: 16.07, lng: 108.21, address: 'x' },
    { title: 'Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com', link: OTA2, photo_url: 'https://img/oc.jpg' },
    { title: 'Dai Long Hotel | Hoi An 2026 UPDATED DEALS', link: OTA3 },
    { title: 'Dai Long Hotel, Đà Nẵng (cập nhật giá năm 2026)', link: OTA3, photo_url: 'https://img/dl.jpg' },
    { title: '10 khách sạn tốt nhất tại Đà Nẵng năm 2026', link: OTA },
    { title: 'Khách sạn Đà Nẵng', link: SEARCH_PAGE },
  ]

  it('reduces seven rows to two real hotels', () => {
    const out = admitStays(LIVE, DA_NANG)
    expect(out.map(o => o.name)).toEqual(['Oc Tien Sa Hotel', 'Dai Long Hotel, Đà Nẵng'])
  })

  /**
   * 🚨 THE REGRESSION THIS CAUGHT WHILE BEING WRITTEN. Collapsing the duplicates
   * removed every stay photo, because the OSM row wins the identity and has no
   * image while the snippet it absorbed did. Dedupe must MERGE, not discard.
   */
  it('merges the absorbed duplicate’s fields into the winner instead of dropping them', () => {
    const out = admitStays(LIVE, DA_NANG)
    expect(out[0].name).toBe('Oc Tien Sa Hotel')
    expect((out[0] as { photo_url?: string }).photo_url).toBe('https://img/oc.jpg')
    // …and the structured row keeps authority over what it already stated.
    expect((out[0] as { address?: string }).address).toBe('52 Loseby')
  })

  it('an empty input stays empty rather than throwing', () => {
    expect(admitStays([], DA_NANG)).toEqual([])
  })
})
