import { describe, expect, it } from 'vitest'
import { mergeCandidates, normalizeToolCandidates } from './candidateEvidence'
import { splitToolResult } from './toolResultSplit'
import { buildStateContextBlock } from './stateContext'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'

const NOW = 1_700_000_000_000

/** Shaped exactly like searchPlaces' Google-Places branch (tools/food.ts). */
const PLACES_RESULT = {
  results: [
    {
      place_id: 'gp-1',
      name: 'Cà Phê AnAn',
      address: '22 Phố Lý Quốc Sư',
      google_rating: '4.9⭐ (2,015 đánh giá)',
      maps_link: 'https://maps.google.com/?q=place_id:gp-1',
      website_uri: 'http://anancoffee.com',
      photo_urls: ['https://gstatic/a.jpg'],
      order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/x' }],
    },
    { place_id: 'gp-2', name: 'Quán Không Có Gì' }, // identity only — no facts
    { name: '' }, // no identity at all
  ],
  google_maps_search: 'https://maps.google.com/?q=cafe',
}

describe('candidates are harvested from the MODEL half, so facts survive B4', () => {
  it('keeps every fact B4 does not carve out', () => {
    // Run the real B4 split first — this is the regression that matters.
    const { model } = splitToolResult('search_places', PLACES_RESULT)

    const [anan] = normalizeToolCandidates('search_places', model, NOW)

    expect(anan.name).toBe('Cà Phê AnAn')
    expect(anan.candidateId).toBe('gp-1')
    expect(anan.source).toBe('search_places')
    expect(anan.retrievedAt).toBe(NOW)
    expect(anan.facts.address).toBe('22 Phố Lý Quốc Sư')
    expect(anan.facts.google_rating).toBe('4.9⭐ (2,015 đánh giá)')
    expect(anan.url).toBe('http://anancoffee.com')
  })

  it('never carries enrichment B4 removed — photos and order links stay server-side', () => {
    const { model } = splitToolResult('search_places', PLACES_RESULT)

    const [anan] = normalizeToolCandidates('search_places', model, NOW)

    expect(JSON.stringify(anan)).not.toContain('gstatic')
    expect(JSON.stringify(anan)).not.toContain('shopeefood')
  })

  it('leaves absent facts ABSENT rather than inventing empty values', () => {
    const { model } = splitToolResult('search_places', PLACES_RESULT)

    const bare = normalizeToolCandidates('search_places', model, NOW)
      .find(c => c.name === 'Quán Không Có Gì')!

    expect(bare.facts).toEqual({})
    expect('address' in bare.facts).toBe(false)
    expect(bare.url).toBeUndefined()
  })

  it('drops entries with no identity', () => {
    const { model } = splitToolResult('search_places', PLACES_RESULT)

    expect(normalizeToolCandidates('search_places', model, NOW)).toHaveLength(2)
  })

  it('normalizes hotel/product search_results and keeps a price only when supplied', () => {
    const result = {
      search_results: [
        { title: 'Muong Thanh - Da Nang - Booking.com', link: 'https://booking.com/x', price: '1.200.000 ₫' },
        { title: 'Some Hotel - Agoda', link: 'https://agoda.com/y' },
      ],
    }

    const out = normalizeToolCandidates('get_hotel_prices', result, NOW)

    expect(out[0].name).toBe('Muong Thanh')       // B4's own " - " rule
    expect(out[0].type).toBe('hotel')
    expect(out[0].facts.price).toBe('1.200.000 ₫')
    expect(out[1].facts.price).toBeUndefined()     // absent, not 0 and not ''
  })

  it('returns nothing for an empty or malformed result instead of inventing candidates', () => {
    expect(normalizeToolCandidates('search_places', { results: [] }, NOW)).toEqual([])
    expect(normalizeToolCandidates('search_places', null, NOW)).toEqual([])
    expect(normalizeToolCandidates('get_weather', { temp: 30 }, NOW)).toEqual([])
  })

  it('merges newest-wins by candidateId', () => {
    const a: Candidate = { candidateId: 'x', name: 'Old', type: 'place', source: 's', retrievedAt: 1, facts: {} }
    const b: Candidate = { candidateId: 'x', name: 'New', type: 'place', source: 's', retrievedAt: 2, facts: {} }

    expect(mergeCandidates([a], [b])).toEqual([b])
  })
})

describe('state context block — what the model actually reads', () => {
  function stateWithCandidates() {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'alice' }))
    s.goal = 'tìm quán cà phê làm việc'
    s.hardConstraints.push({ key: 'ram_gb', op: '>=', value: 32, statedAs: 'dram 32gb', turn: 1 })
    s.softPreferences.push({ key: 'quiet', weight: 1, statedAs: 'yên tĩnh hơn', turn: 2 })
    s.rejections.push({ ref: 'Cà Phê HAN', turn: 3 })
    s.candidates.push(
      { candidateId: 'gp-1', name: 'Cà Phê AnAn', type: 'place', source: 'search_places', retrievedAt: NOW, facts: { address: '22 Lý Quốc Sư' } },
      { candidateId: 'gp-2', name: 'Quán Trống', type: 'place', source: 'search_places', retrievedAt: NOW, facts: {} },
    )
    return s
  }

  it('carries goal, hard constraints, preferences, rejections and candidate facts', () => {
    const block = buildStateContextBlock(stateWithCandidates())

    expect(block).toContain('tìm quán cà phê làm việc')
    expect(block).toContain('ram_gb >= 32')
    expect(block).toContain('dram 32gb')          // the user's own words survive
    expect(block).toContain('yên tĩnh hơn')
    expect(block).toContain('Cà Phê HAN')          // rejection
    expect(block).toContain('22 Lý Quốc Sư')       // tool evidence
  })

  it('labels provenance so a requirement is never demoted to an inference', () => {
    const block = buildStateContextBlock(stateWithCandidates())

    expect(block).toContain('YEU CAU BAT BUOC (USER-STATED')
    expect(block).toContain('TOOL-EVIDENCE')
    expect(block).not.toMatch(/inferred|suy doan/i)
  })

  it('marks a candidate that has no facts, instead of leaving a fillable gap', () => {
    const block = buildStateContextBlock(stateWithCandidates())

    expect(block).toContain('Quán Trống')
    expect(block).toContain('(khong co du lieu khac)')
  })

  it('LEAKS NOTHING — no ownerScope, storage key, auth id or internal timestamp', () => {
    const s = stateWithCandidates()
    s.ownerScope = 'SECRET_OWNER_SCOPE_VALUE'
    // Anything added to the type later must still not appear: the projection is
    // an allow-list, so an unknown field has no path out.
    ;(s as unknown as Record<string, unknown>).authToken = 'SECRET_TOKEN'

    const block = buildStateContextBlock(s)

    expect(block).not.toContain('SECRET_OWNER_SCOPE_VALUE')
    expect(block).not.toContain('SECRET_TOKEN')
    expect(block).not.toContain('ownerScope')
    expect(block).not.toContain('tappy:convstate')
    expect(block).not.toContain(s.conversationId)
    expect(block).not.toContain(String(s.expiresAt))
  })

  it('is empty when there is no state and when the state is still blank', () => {
    expect(buildStateContextBlock(null)).toBe('')
    expect(buildStateContextBlock(createState(newConversationId(), 'scope'))).toBe('')
  })
})

/**
 * Candidate identity. The measured failure: a reply named "MacBook Pro 16 inch
 * M1 Pro 32GB/512GB" at 29.550.000 ₫, a price belonging to a DIFFERENT 14-inch
 * listing. Titles were being cut at the first " - ", so the specs that tell two
 * listings apart never reached the model and two listings could share a name.
 */
describe('product identity survives the whole path', () => {
  const listing = (over: Record<string, unknown>) => ({
    title: 'Macbook Pro 13 2020 - Core i7/32GB/512GB - Like New',
    link: 'https://www.google.com/search?ibp=oshop&q=a&prds=productid:111',
    price: '19.990.000 ₫', price_vnd: 19_990_000, source: 'Lapvip', product_id: '111',
    ...over,
  })
  const norm = (items: unknown[]) => normalizeToolCandidates('search_products', { search_results: items }, 0)

  it('keeps the FULL listing title — the specs are the identity', () => {
    const [c] = norm([listing({})])
    expect(c.name).toBe('Macbook Pro 13 2020 - Core i7/32GB/512GB - Like New')
  })

  it('CASE A — similar titles, different URLs and prices stay separate', () => {
    const out = norm([
      listing({ title: 'MacBook Pro 16 2019 32GB/512GB', product_id: '1', link: 'l1', price: '22.390.000 ₫', price_vnd: 22_390_000 }),
      listing({ title: 'MacBook Pro 16 2019 32GB/512GB ', product_id: '2', link: 'l2', price: '29.550.000 ₫', price_vnd: 29_550_000 }),
    ])
    expect(out).toHaveLength(2)
    expect(out.map(c => c.facts.price_vnd)).toEqual([22_390_000, 29_550_000])
  })

  it('CASE B — same title, different seller stays separate', () => {
    const out = norm([
      listing({ product_id: 'a', source: 'Lapvip' }),
      listing({ product_id: 'b', source: 'Mac24h', price: '21.000.000 ₫', price_vnd: 21_000_000 }),
    ])
    expect(out).toHaveLength(2)
    expect(out.map(c => c.facts.source_site)).toEqual(['Lapvip', 'Mac24h'])
  })

  it('CASE C — the same listing repeated collapses to one', () => {
    expect(norm([listing({}), listing({})])).toHaveLength(1)
  })

  it('CASE D — matching titles never merge across different productIds', () => {
    const out = norm([listing({ product_id: 'x' }), listing({ product_id: 'y' })])
    expect(out).toHaveLength(2)
    expect(new Set(out.map(c => c.candidateId)).size).toBe(2)
  })

  it('CASE E/F — every price and spec stays on the candidate that supplied it', () => {
    const out = norm([
      listing({ title: 'MacBook Pro 14 M1 Pro 32GB/512GB cũ', product_id: '14', price: '29.550.000 ₫', price_vnd: 29_550_000, ram_gb: 32, storage_gb: 512, condition: 'used', spec_source: 'MacBook Pro 14 M1 Pro 32GB/512GB cũ' }),
      listing({ title: 'Macbook Pro 16 M1 Max 32GB/512GB', product_id: '16', price: '34.500.000 ₫', price_vnd: 34_500_000, ram_gb: 32, storage_gb: 512, spec_source: 'Macbook Pro 16 M1 Max 32GB/512GB' }),
    ])
    const byName = Object.fromEntries(out.map(c => [c.name, c.facts]))

    expect(byName['MacBook Pro 14 M1 Pro 32GB/512GB cũ'].price_vnd).toBe(29_550_000)
    expect(byName['Macbook Pro 16 M1 Max 32GB/512GB'].price_vnd).toBe(34_500_000)
    // The exact conflation that was measured: the 16-inch must not carry the
    // 14-inch's price, and must not inherit its `used` condition either.
    expect(byName['Macbook Pro 16 M1 Max 32GB/512GB'].price_vnd).not.toBe(29_550_000)
    expect(byName['Macbook Pro 16 M1 Max 32GB/512GB'].condition).toBeUndefined()
    expect(byName['MacBook Pro 14 M1 Pro 32GB/512GB cũ'].spec_source).toContain('14')
  })

  it('every fact carries the identity of its own listing', () => {
    const [c] = norm([listing({})])
    expect(c.candidateId).toBe('pid:111')
    expect(c.facts.source_site).toBe('Lapvip')
    expect(c.facts.price).toBe('19.990.000 ₫')
    expect(c.url).toContain('productid:111')
  })

  it('falls back to the link, then the title, when the provider gives no id', () => {
    expect(norm([listing({ product_id: undefined, link: 'https://shop/x' })])[0].candidateId).toBe('https://shop/x')
    expect(norm([listing({ product_id: undefined, link: undefined })])[0].candidateId).toContain('Macbook Pro 13 2020')
  })
})

/**
 * Evidence contract: absence of evidence is absence of fact.
 *
 * Measured on honest captured data: MVTTS carried only an address and a maps
 * link, and the reply said "mở cả ngày"; Orick got "WiFi tốt, giá hợp lý".
 * Neither fact existed. The candidate line said nothing at all about hours,
 * wifi or price, and silence is what the model fills in.
 */
describe('missing dimensions are named per candidate', () => {
  const bare = (name: string, facts: Record<string, string | number>) => ({
    candidateId: `pid-${name}`, name, type: 'place' as const, source: 'search_places',
    retrievedAt: 0, facts,
  })

  function stateWith(cands: ReturnType<typeof bare>[]): ConversationState {
    const s = createState(newConversationId(), ownerScopeFor({ userId: 'u' }))
    s.candidates = cands
    return s
  }

  const lineFor = (block: string, name: string) =>
    block.split('\n').find(l => l.includes(name)) ?? ''

  it('10. no opening_hours -> the gap is stated explicitly', () => {
    const block = buildStateContextBlock(stateWith([bare('MVTTS', { address: '5 Nhà Thờ' })]))
    expect(lineFor(block, 'MVTTS')).toContain('gio_mo_cua=UNKNOWN')
  })

  it('11. no price -> price is listed as missing', () => {
    const block = buildStateContextBlock(stateWith([bare('Orick', { address: '46 Lý Thường Kiệt' })]))
    expect(lineFor(block, 'Orick')).toContain('gia=UNKNOWN')
  })

  it('12. no wifi evidence -> wifi is listed as missing', () => {
    const block = buildStateContextBlock(stateWith([bare('Orick', { address: 'x' })]))
    expect(lineFor(block, 'Orick')).toContain('wifi=UNKNOWN')
  })

  it('13. candidate A\'s evidence never appears on candidate B\'s line', () => {
    const block = buildStateContextBlock(stateWith([
      bare('AnAn', { address: '22 Lý Quốc Sư', opening_hours: 'Mo-Su 08:00-22:30' }),
      bare('MVTTS', { address: '5 Nhà Thờ' }),
    ]))

    expect(lineFor(block, 'AnAn')).toContain('08:00-22:30')
    // MVTTS must neither carry AnAn's hours nor be silent about the gap.
    expect(lineFor(block, 'MVTTS')).not.toContain('08:00-22:30')
    expect(lineFor(block, 'MVTTS')).toContain('gio_mo_cua=UNKNOWN')
  })

  it('14. evidence that DOES exist is still stated, and not listed as missing', () => {
    const line = lineFor(
      buildStateContextBlock(stateWith([bare('HAN', { address: '4 Hàng Bạc', opening_hours: 'Mo-Su 06:30-23:30' })])),
      'HAN',
    )

    expect(line).toContain('06:30-23:30')
    expect(line).not.toContain('gio_mo_cua=UNKNOWN')
    expect(line).not.toContain('dia_chi=UNKNOWN')
  })

  it('15. a candidate with nothing at all names every dimension as missing', () => {
    const line = lineFor(buildStateContextBlock(stateWith([bare('Trống', {})])), 'Trống')

    for (const dim of ['gio_mo_cua', 'gia', 'danh_gia', 'wifi', 'khong_gian_quy_mo', 'dia_chi']) {
      expect(line).toContain(`${dim}=UNKNOWN`)
    }
  })
})
