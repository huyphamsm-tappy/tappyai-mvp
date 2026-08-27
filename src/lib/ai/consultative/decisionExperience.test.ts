import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeShopping } from './candidate'
import { shortlistShopping } from './shortlist'
import { buildShoppingGroundingBlock } from './pick'
import { createEnrichmentCollector } from '../toolResultSplit'
import { buildMemoryBlock } from '@/lib/memory/memoryService'
import { SHOPPING_SHORTLIST } from '@/lib/config/product'

// ── The decision experience: search results become a decision, not a dump ────
//
// Every expectation here traces to something measured on production, not to a preference:
//
//   · a MacBook query returned 40 rows in `search_results` with `shopping_results` ABSENT, so the
//     normalizer — which read only `shopping_results` — produced zero candidates and the whole
//     ranking/Pick apparatus was dead on the path that actually runs;
//   · those 40 rows carried 40 DISTINCT `product_id`s and mixed M1 Pro with M1 Max and like-new
//     with sealed retail at 25.8M–57.99M VND, which is why they may be trimmed but never merged;
//   · the reply ran 3,646–3,803 characters and ~73% of a 14s turn was spent generating it.

/** The live shape: Serper /shopping answered, so structured rows sit in `search_results`. */
const liveShoppingResult = () => ({
  query: 'MacBook Pro 14 M1 32GB 512GB',
  source: 'Google Shopping (Serper)',
  search_results: [
    { title: 'Macbook Pro M1 14,2inch | 32GB | 512GB', link: 'https://a.vn/1', price: '25.800.000₫', price_vnd: 25_800_000, source: 'Zin100.vn', product_id: '16587550932029089691', photo_url: 'https://img/1' },
    { title: 'Macbook Pro 14inch (2021) M1 Pro 32GB/512GB', link: 'https://b.vn/2', price: '26.500.000₫', price_vnd: 26_500_000, source: 'Tín Phát', product_id: '1444565959560143800', photo_url: 'https://img/2' },
    { title: 'Macbook Pro 14 M1 Pro 32Gb/512Gb Likenew', link: 'https://c.vn/3', price: '29.500.000₫', price_vnd: 29_500_000, source: 'Macshop24h.vn', product_id: '5088371680193611190', photo_url: 'https://img/3' },
    { title: 'MacBook Pro M1 Max 14 32Gb/512Gb Chính Hãng', link: 'https://d.vn/4', price: '57.990.000₫', price_vnd: 57_990_000, source: 'Xuân Vinh', product_id: '1405719727327415238', photo_url: 'https://img/4' },
  ],
  links: [],
  note: 'gia tham khao',
})

describe('the live shopping path produces candidates at all', () => {
  it('normalizes structured rows that arrive under search_results', () => {
    // THE DEFECT: reading only `shopping_results` returned [] here, `rankForModel` bailed at its
    // `length < 2` guard, and ranking, the Pick and the ranking instruction block never ran for
    // any shopping turn.
    const candidates = normalizeShopping(liveShoppingResult())

    expect(candidates).toHaveLength(4)
    expect(candidates[0].domain).toBe('shopping')
  })

  it('reads the provider price from price_vnd, never from the display string', () => {
    // `price` on this path is "25.800.000₫" — a string for display. Ranking on it would compare
    // text, and parsing a number out of a title is exactly what the normalizer forbids.
    const [first] = normalizeShopping(liveShoppingResult())

    expect(first.attrs.priceVnd).toBe(25_800_000)
  })

  it('still normalizes the fallback path shape', () => {
    const candidates = normalizeShopping({
      shopping_results: [{ title: 'Laptop A', link: 'https://x/1', price: 20_000_000, productId: 'p1' }],
      search_results: [{ title: 'Đánh giá laptop 2026', link: 'https://news/1', snippet: 'bài viết' }],
    })

    // The structured row is in; the article is not. C3-B.9 measured that organic shape returning
    // phone cases and news articles for an iPhone-vs-Samsung comparison, and ranking it would be
    // provider order dressed up as a score.
    expect(candidates.map((c) => c.name)).toEqual(['Laptop A'])
  })

  it('ignores rows with no structured evidence whichever array they sit in', () => {
    const candidates = normalizeShopping({
      search_results: [
        { title: 'Bài viết về MacBook', link: 'https://news/2', snippet: 'không có giá' },
        { title: 'MacBook Pro 14', link: 'https://shop/2', price_vnd: 30_000_000 },
      ],
    })

    expect(candidates.map((c) => c.name)).toEqual(['MacBook Pro 14'])
  })
})

describe('shortlist trims and never merges', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }))

  it('caps a long result and reports the true total', () => {
    const { rows: kept, totalFound } = shortlistShopping(rows(40))

    expect(kept).toHaveLength(SHOPPING_SHORTLIST)
    // A shortlist presented as the whole market is its own false claim.
    expect(totalFound).toBe(40)
  })

  it('keeps the ranker order — the shortlist is the top of the ranking', () => {
    const { rows: kept } = shortlistShopping(rows(40))

    expect(kept.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('leaves a short result alone and claims no total', () => {
    const { rows: kept, totalFound } = shortlistShopping(rows(3), [{ id: 99 }])

    expect(kept).toHaveLength(4)
    // Nothing was cut, so there is nothing for the reply to qualify.
    expect(totalFound).toBeNull()
  })

  it('returns the rows unchanged — trimming is not merging', () => {
    const original = liveShoppingResult().search_results
    const { rows: kept } = shortlistShopping(original, [], 2)

    // Object identity: a merged or rewritten row would be a new object, and merging these four
    // would put an M1 Pro like-new and an M1 Max retail machine under one price range.
    expect(kept[0]).toBe(original[0])
    expect(kept[1]).toBe(original[1])
  })

  it('drops unranked rows once trimming applies', () => {
    // An unranked row has no claim to a place in a decision set.
    const { rows: kept } = shortlistShopping(rows(10), [{ id: 999 }])

    expect(kept.some((r) => r.id === 999)).toBe(false)
  })
})

describe('image enrichment never reuses one photo for two entries', () => {
  it('gives a duplicate URL to the first claimant only', () => {
    const c = createEnrichmentCollector()

    c.add([{ name: 'Listing A', photo_url: 'https://img/same' }])
    c.add([{ name: 'Listing B', photo_url: 'https://img/same' }])

    expect(c.places[0].photo_url).toBe('https://img/same')
    // Showing one picture under two listings tells the reader they are the same thing — for
    // shopping rows that differ in chip, condition and price, that is the false merge.
    expect(c.places[1].photo_url).toBeUndefined()
  })

  it('keeps the distinct photos in a list and drops only the repeats', () => {
    const c = createEnrichmentCollector()

    c.add([{ name: 'A', photo_urls: ['https://img/1', 'https://img/2'] }])
    c.add([{ name: 'B', photo_urls: ['https://img/2', 'https://img/3'] }])

    expect(c.places[0].photo_urls).toEqual(['https://img/1', 'https://img/2'])
    expect(c.places[1].photo_urls).toEqual(['https://img/3'])
  })

  it('leaves entries with different photos untouched', () => {
    const c = createEnrichmentCollector()

    c.add([{ name: 'A', photo_url: 'https://img/a' }, { name: 'B', photo_url: 'https://img/b' }])

    expect(c.places.map((p) => p.photo_url)).toEqual(['https://img/a', 'https://img/b'])
  })
})

describe('memory is context; the current message is the request', () => {
  const memory = {
    location_base: 'Đà Nẵng',
    history: ['MacBook Pro 14 M1 32GB/512GB'],
  } as Parameters<typeof buildMemoryBlock>[0]

  it('no longer tells the model to skip asking', () => {
    // 🚨 "Khong can hoi lai nhung gi da biet" is what let a remembered MacBook answer a question
    // about a Mac Pro: the model had been instructed not to ask.
    expect(buildMemoryBlock(memory)).not.toContain('Khong can hoi lai nhung gi da biet')
  })

  it('states that the current message wins', () => {
    const block = buildMemoryBlock(memory)

    expect(block).toContain('Tin nhan hien tai cua user moi la yeu cau that')
    expect(block).toContain('LAM THEO TIN NHAN HIEN TAI')
  })

  it('requires a clarification when memory would change WHAT is being searched', () => {
    const block = buildMemoryBlock(memory)

    expect(block).toMatch(/hoi lai mot cau ngan de xac nhan TRUOC KHI tim kiem/)
  })

  it('still carries the remembered values', () => {
    // Precedence is not amnesia — location, budget and preferences still personalise the answer.
    expect(buildMemoryBlock(memory)).toContain('Đà Nẵng')
  })
})

describe('the shopping rulebook forbids a false merge', () => {
  const block = buildShoppingGroundingBlock()

  it('says each row is one listing, not a quote for one machine', () => {
    expect(block).toContain('KHONG GOP CAC KET QUA THANH "MOT SAN PHAM NHIEU NOI BAN"')
    expect(block).toMatch(/KHONG viet "X noi cung ban may nay"/)
  })

  it('explains that the price spread comes from different goods', () => {
    expect(block).toMatch(/gia chenh nhau la vi HANG KHAC NHAU/)
  })

  it('allows calling two rows the same machine only on an exact spec and condition match', () => {
    expect(block).toMatch(/cung cau hinh VA cung tinh\s+trang/)
    expect(block).toMatch(/Khong chac thi coi la hai lua chon rieng/)
  })

  it('asks for a decision, not a catalogue', () => {
    expect(block).toContain('TRA LOI DE USER QUYET DINH DUOC, KHONG PHAI DE LIET KE')
    expect(block).toMatch(/CHON MOT va noi RO VI SAO/)
  })

  it('tells the model what _tappy_total_found means', () => {
    // Without this the shortlist reads as the entire market.
    expect(block).toContain('_tappy_total_found')
    expect(block).toMatch(/KHONG\s+duoc noi hay ngu y rang chi co bay nhieu tin dang ton tai/)
  })
})

describe('the route applies the shortlist to shopping only', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')

  it('trims through the shared pure function', () => {
    expect(route).toContain('shortlistShopping(sorted, untouched)')
  })

  it('reorders every array a shopping candidate can come from', () => {
    // Naming only `shopping_results` meant the live path was reordered by nothing.
    expect(route).toMatch(/\['shopping_results', 'search_results'\]/)
  })

  it('leaves places whole', () => {
    expect(route).toMatch(/toolName === 'search_products'\)? ?\{?[\s\S]{0,200}?shortlistShopping/)
    expect(route).toMatch(/r\[key\] = \[\.\.\.sorted, \.\.\.untouched\]/)
  })
})
