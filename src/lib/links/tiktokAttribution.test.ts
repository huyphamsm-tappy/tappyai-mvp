import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { attributeTikTok } from './tiktokAttribution'
import { splitToolResult, createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

// ── Attribution, not decoration ─────────────────────────────────────────────
//
// The batch below is the REAL production result for "tìm quán bún bò huế ngon ở phú nhuận": eight
// places, six TikTok results, and not one of the six titles names any of the eight. The shipped
// code attached the first URL to `results[0]` and the UI captioned it "Review TikTok" inside that
// restaurant's card — a claim about a video that is about somewhere else.

const PLACES = [
  'BÚN BÒ HUẾ THẢO - HOÀNG DIỆU',
  'Bún Bò Huế O Lạc CN 2',
  'Bún Bò Huế Ngọc Hân Quán.',
  'Bún Bò Huế O Lạc',
  'Bún Bò O Ty Tràng Tiền',
  'Bún bò Huế Nhiêu Tứ',
  'Nhà Ôn | Bún Bò Huế Phú Nhuận | Cơm Trưa Văn Phòng',
  'Quán Bún Bò Cao',
]

/** Verbatim from Serper for that query. */
const REAL_RESULTS = [
  { title: 'Bún Bò Huế Ngon Nhất Q.Phú Nhuận', link: 'https://www.tiktok.com/@lulureview_/video/7536948899538373896', snippet: '' },
  { title: 'Bún bò bà O — Review & địa điểm ăn bún bò ngon ở Sài Gòn', link: 'https://www.tiktok.com/@vinhthichanngon/video/7637820487120293137', snippet: '' },
  { title: 'Bún Bò Mỡ Nổi 24/7 Tại Phú Nhuận', link: 'https://www.tiktok.com/@khanhsoda/video/7445504140127653127', snippet: '' },
  { title: 'Review Bún Bò - Hương Vị Khác Lạ tại Phú Nhuận', link: 'https://www.tiktok.com/@diadiemanuong/video/7256720956851375361', snippet: '' },
  { title: 'Review quán bún bò ruột ngon bất ngờ', link: 'https://www.tiktok.com/@bonapptitsaigon/video/7643060794086706453', snippet: '' },
  // A /discover/ page, not a video — rejected by isValidTikTokContentUrl.
  { title: 'Bún Bò Phú Nhuận', link: 'https://www.tiktok.com/discover/b%C3%BAn-b%C3%B2-ph%C3%BA-nhu%E1%BA%ADn', snippet: '' },
]

describe('the production batch that exposed the bug', () => {
  it('attributes the video to NO place', () => {
    const { perPlace } = attributeTikTok(REAL_RESULTS, PLACES)

    // Every title says "bún bò" and "phú nhuận"; none says "thảo", "o lạc" or "ngọc hân".
    expect([...perPlace.keys()]).toEqual([])
  })

  it('still offers one link, as a batch-level discovery link', () => {
    const { batch } = attributeTikTok(REAL_RESULTS, PLACES)

    expect(batch).toBe('https://www.tiktok.com/@lulureview_/video/7536948899538373896')
  })

  it('never returns the /discover/ page as a review', () => {
    const { perPlace, batch } = attributeTikTok(REAL_RESULTS, PLACES)

    const all = [...perPlace.values(), batch].filter(Boolean) as string[]
    expect(all.some((u) => u.includes('/discover/'))).toBe(false)
  })
})

describe('a title that genuinely names a place', () => {
  const results = [
    { title: 'Review Bún Bò Huế Ngọc Hân — quán ruột của mình', link: 'https://www.tiktok.com/@a/video/1111111111111111111', snippet: '' },
    { title: 'Bún bò ngon ở Phú Nhuận', link: 'https://www.tiktok.com/@b/video/2222222222222222222', snippet: '' },
  ]

  it('attributes it to that place and nobody else', () => {
    const { perPlace } = attributeTikTok(results, PLACES)

    expect(perPlace.get('Bún Bò Huế Ngọc Hân Quán.')).toBe('https://www.tiktok.com/@a/video/1111111111111111111')
    expect(perPlace.size).toBe(1)
  })

  it('leaves the unattributed one as the batch link', () => {
    const { batch } = attributeTikTok(results, PLACES)

    expect(batch).toBe('https://www.tiktok.com/@b/video/2222222222222222222')
  })

  it('matches through diacritics and case', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'REVIEW BUN BO HUE NGOC HAN cuc pham', link: 'https://www.tiktok.com/@c/video/3333333333333333333', snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('Bún Bò Huế Ngọc Hân Quán.')).toBeDefined()
  })
})

describe('one URL never lands on two places', () => {
  it('is claimed by the first place it matches', () => {
    // Both places share "o lạc", so neither can claim on it; "cn" is a stopword and "2" survives
    // only on the branch. The video names the branch.
    const { perPlace } = attributeTikTok(
      [{ title: 'Bún Bò Huế O Lạc CN 2 ngon', link: 'https://www.tiktok.com/@d/video/4444444444444444444', snippet: '' }],
      ['Bún Bò Huế O Lạc CN 2', 'Bún Bò Huế O Lạc'],
    )

    const urls = [...perPlace.values()]
    expect(new Set(urls).size).toBe(urls.length)
    expect(perPlace.get('Bún Bò Huế O Lạc')).toBeUndefined()
  })

  it('does not hand one video to two places that both match it', () => {
    // Both names are distinctive, and the title names BOTH. Without the claimed-URL guard each
    // place would take the same video and the reply would show one clip as two restaurants' review.
    const { perPlace } = attributeTikTok(
      [{ title: 'So sanh Quan Alpha va Quan Beta', link: 'https://www.tiktok.com/@f/video/6666666666666666666', snippet: '' }],
      ['Quan Alpha', 'Quan Beta'],
    )

    expect([...perPlace.keys()]).toEqual(['Quan Alpha'])
    expect(perPlace.get('Quan Beta')).toBeUndefined()
  })

  it('gives a place with no distinctive token nothing at all', () => {
    // Two identically-named places: no token separates them, so neither may be attributed.
    const { perPlace } = attributeTikTok(
      [{ title: 'Review Bún Bò Huế', link: 'https://www.tiktok.com/@e/video/5555555555555555555', snippet: '' }],
      ['Bún Bò Huế', 'Bún Bò Huế'],
    )

    expect(perPlace.size).toBe(0)
  })
})

describe('nothing is invented', () => {
  it('returns nothing when the search found nothing', () => {
    expect(attributeTikTok([], PLACES)).toEqual({ perPlace: new Map(), batch: null })
    expect(attributeTikTok(null, PLACES).batch).toBeNull()
  })

  it('returns nothing when every result is an invalid TikTok URL', () => {
    const { perPlace, batch } = attributeTikTok(
      [{ title: 'Bún Bò Huế Ngọc Hân', link: 'https://example.com/not-tiktok', snippet: '' }],
      PLACES,
    )

    expect(perPlace.size).toBe(0)
    expect(batch).toBeNull()
  })

  it('only ever returns URLs that came from the provider', () => {
    const { perPlace, batch } = attributeTikTok(REAL_RESULTS, PLACES)
    const provided = new Set(REAL_RESULTS.map((r) => r.link))

    for (const u of [...perPlace.values(), batch].filter(Boolean) as string[]) {
      expect(provided.has(u)).toBe(true)
    }
  })
})

describe('the batch link never reaches the model and never sits in a card', () => {
  const result = () => ({
    results: [
      { name: 'Quán A', address: 'x', tiktok_review_url: 'https://www.tiktok.com/@a/video/1111111111111111111' },
      { name: 'Quán B', address: 'y' },
    ],
    tiktok_discovery_url: 'https://www.tiktok.com/@z/video/9999999999999999999',
  })

  it('carves the batch URL out of the model-facing payload', () => {
    const { model } = splitToolResult('search_places', result())

    // The model must not be able to write it — same rule as photos and order links.
    expect(JSON.stringify(model)).not.toContain('9999999999999999999')
    expect((model as Record<string, unknown>).tiktok_discovery_url).toBeUndefined()
  })

  it('hands the batch URL to the caller separately', () => {
    const { batchTikTokUrl } = splitToolResult('search_places', result())

    expect(batchTikTokUrl).toBe('https://www.tiktok.com/@z/video/9999999999999999999')
  })

  it('keeps a per-place review URL attached to ITS place', () => {
    const { enrichment } = splitToolResult('search_places', result())

    const a = enrichment.find((e) => e.name === 'Quán A')
    expect(a?.tiktok_review_url).toBe('https://www.tiktok.com/@a/video/1111111111111111111')
    // Quán B carried nothing, so it must not acquire A's video.
    expect(enrichment.find((e) => e.name === 'Quán B')?.tiktok_review_url).toBeUndefined()
  })

  it('is not modelled as a place', () => {
    const { enrichment } = splitToolResult('search_places', result())

    // Treating a batch result as a PlaceEnrichment is exactly how it ended up captioned as a
    // restaurant's review in the first place.
    expect(enrichment.some((e) => e.tiktok_review_url?.includes('9999999999999999999'))).toBe(false)
  })

  it('the collector keeps the first batch URL and ignores later ones', () => {
    const c = createEnrichmentCollector()
    c.setBatchTikTokUrl('https://www.tiktok.com/@z/video/9999999999999999999')
    c.setBatchTikTokUrl('https://www.tiktok.com/@y/video/8888888888888888888')

    // A trip plan runs several searches; the reply carries one related-video line, not one each.
    expect(c.batchTikTokUrl).toBe('https://www.tiktok.com/@z/video/9999999999999999999')
  })

  it('the collector stays empty when no search produced one', () => {
    const c = createEnrichmentCollector()
    c.setBatchTikTokUrl(undefined)

    expect(c.batchTikTokUrl).toBeUndefined()
  })
})

describe('the rendered wording matches what the evidence supports', () => {
  const filter = readFileSync('src/lib/ai/streamEnrichment.ts', 'utf8')

  it('labels the batch link as a related video, not a review', () => {
    expect(filter).toContain("'Video liên quan trên TikTok'")
    expect(filter).toContain("'Related video on TikTok'")
  })

  it('still labels a per-place video as that place’s review', () => {
    expect(filter).toContain("escapeMarkdownLabel('Review TikTok')")
  })

  it('folds the batch link in BEFORE the grounding detector reads the reply', () => {
    // The detector must analyse byte-for-byte what the user receives.
    const foldAt = filter.indexOf('const finalText = (scaffoldStripped && batchTikTok')
    const detectAt = filter.indexOf('ungroundedNames = ungroundedNamesIn(')
    expect(foldAt).toBeGreaterThan(-1)
    expect(detectAt).toBeGreaterThan(foldAt)
  })

  it('re-validates the URL at the render boundary', () => {
    expect(filter).toMatch(/batchTikTok && isValidTikTokContentUrl\(batchTikTok\)/)
  })
})

describe('searchPlaces wires attribution the way the evidence allows', () => {
  // `searchPlaces` cannot be unit-run — it calls Google Places and Serper — so the wiring is
  // asserted on the source, the same approach the repo already uses for native and architecture
  // contracts. Each assertion names an EXPRESSION, not a token, so a disabled branch fails here.
  // Comments are stripped so an assertion can never be satisfied by the prose that explains it —
  // a mistake already made once in this repo, where a guard matched its own KDoc.
  const code = readFileSync('src/lib/ai/tools/food.ts', 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n')

  it('takes each place its OWN attributed video', () => {
    expect(code).toContain("const own = tiktok.perPlace.get((place.name as string) || '')")
  })

  it('never falls back to the batch video for a place', () => {
    // `perPlace.get(...) ?? tiktok.batch` would put one unattributed clip on every card.
    expect(code).not.toMatch(/perPlace\.get\([^\n]*\)\s*\?\?/)
    expect(code).not.toMatch(/i === 0 && tiktokUrl/)
    expect(code).not.toMatch(/indexOf\(place\) === 0/)
  })

  it('keeps the unattributed result as a batch-level link instead of discarding it', () => {
    expect(code).toContain('if (tiktok.batch) extra.tiktok_discovery_url = tiktok.batch')
  })

  it('passes the whole batch of names, so "distinctive" is computed against them', () => {
    expect(code).toContain('const tiktok = attributeTikTok(tiktokResults, placeNames)')
    expect(code).toMatch(/placeNames = places\.map\(p => \(p\.name as string\) \|\| ''\)\.filter\(Boolean\)/)
  })

  it('no longer imports the index-based picker', () => {
    expect(code).not.toContain('pickTikTokReviewUrl')
  })
})

// ── The substring collisions found by the production E2E ─────────────────────
//
// The first version of the matcher asked `haystack.includes(token)`. Every case below was
// REPRODUCED against the real batch before this suite existed; each one attributed a video to a
// restaurant the video says nothing about. They are kept as separate tests because they fail for
// three different reasons, and a fix that only addresses one of them still ships a false claim.

/**
 * A batch whose only distinguishing word for the first place is the 2-character "ty".
 *
 * Two places, not one: "bún" and "bò" are only useless as evidence when more than one place in the
 * batch uses them. Passing a single name would make every word in it distinctive — which is the
 * frequency rule working correctly, and would test nothing about token length.
 */
const TY_BATCH = ['Bún Bò O Ty', 'Bún Bò Ngọc Hân']

describe('a token must be a whole word, not a fragment of one', () => {
  const url = 'https://www.tiktok.com/@x/video/9999999999999999999'

  it('does not read "cao" out of "cacao"', () => {
    const { perPlace, batch } = attributeTikTok(
      [{ title: 'Quán bún bò cacao độc lạ Sài Gòn', link: url, snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('Quán Bún Bò Cao')).toBeUndefined()
    expect([...perPlace.keys()]).toEqual([])
    // The video is not discarded — it is offered as a batch-level related video instead.
    expect(batch).toBe(url)
  })

  it('does not read "ty" out of "city"', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'city tour an bun bo', link: url, snippet: '' }],
      TY_BATCH,
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('does not read a token out of the middle of a longer word', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'Quan bun bo Thaomoc Hoangkim Dieuky', link: url, snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('BÚN BÒ HUẾ THẢO - HOÀNG DIỆU')).toBeUndefined()
  })
})

describe('a token too short to identify anything never attributes', () => {
  const url = 'https://www.tiktok.com/@x/video/8888888888888888888'

  it('ignores 2-character tokens even when they appear as whole words', () => {
    // "ty", "tu" and "on" are the only 2-char distinctive tokens the real batch produced, and each
    // is a common Vietnamese word in its own right. A title using them is not naming a restaurant.
    const { perPlace } = attributeTikTok(
      [{ title: 'cong ty nay ban bun bo', link: url, snippet: '' }],
      TY_BATCH,
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('leaves a place whose only evidence is too short unmatchable, and falls back to the batch', () => {
    const { perPlace, batch } = attributeTikTok(
      [{ title: 'Bun bo O Ty ngon', link: url, snippet: '' }],
      TY_BATCH,
    )

    expect([...perPlace.keys()]).toEqual([])
    expect(batch).toBe(url)
  })

  it('still attributes on a 3-character token, because raising the floor to 4 destroys real evidence', () => {
    // "Quán Bún Bò Cao" has exactly one distinctive token, "cao". A floor of 4 would silence a real
    // place; the floor is 3 because 3 is the highest value that costs the measured batch nothing.
    const { perPlace } = attributeTikTok(
      [{ title: 'Review quan bun bo Cao o Phu Nhuan', link: url, snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('Quán Bún Bò Cao')).toBe(url)
  })
})

describe('diacritics are evidence when the video bothers to write them', () => {
  const url = 'https://www.tiktok.com/@x/video/7777777777777777777'

  it('does not accept "tiện" as the "Tiền" of "Tràng Tiền"', () => {
    // Folded, both are the string "tien" — spelling is the ONLY thing separating them.
    const { perPlace } = attributeTikTok(
      [{ title: 'Bun bo Tràng tiện đường ghé', link: url, snippet: '' }],
      ['Bún Bò O Ty Tràng Tiền'],
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('still accepts an undecorated title, because Serper often returns plain ASCII', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'REVIEW BUN BO HUE TRANG TIEN cuc pham', link: url, snippet: '' }],
      ['Bún Bò O Ty Tràng Tiền'],
    )

    expect(perPlace.get('Bún Bò O Ty Tràng Tiền')).toBe(url)
  })

  it('accepts the place’s own spelling', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'Bún bò Tràng Tiền ngon nhất', link: url, snippet: '' }],
      ['Bún Bò O Ty Tràng Tiền'],
    )

    expect(perPlace.get('Bún Bò O Ty Tràng Tiền')).toBe(url)
  })
})

describe('the name must sit inside one clause', () => {
  const url = 'https://www.tiktok.com/@x/video/6666666666666666666'

  it('does not assemble "Tràng Tiền" out of "Nha Trang," plus "tiện đường"', () => {
    // The exact title that exposed the bug in production.
    const { perPlace, batch } = attributeTikTok(
      [{ title: 'Bún bò ngon ở Nha Trang, tiện đường đi city tour', link: url, snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('Bún Bò O Ty Tràng Tiền')).toBeUndefined()
    expect([...perPlace.keys()]).toEqual([])
    expect(batch).toBe(url)
  })

  it('rejects a name split across a comma even when both words are spelled correctly', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'Ghé Tràng, Tiền cũng được', link: url, snippet: '' }],
      ['Bún Bò O Ty Tràng Tiền'],
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('never assembles a name out of one word in the title and one in the snippet', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'Bun bo Trang', link: url, snippet: 'Tien cho ngon' }],
      ['Bún Bò O Ty Tràng Tiền'],
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('does not split on the hyphen or pipe that real place names contain', () => {
    // "BÚN BÒ HUẾ THẢO - HOÀNG DIỆU" and "Nhà Ôn | … | Cơm Trưa Văn Phòng" both carry them, so
    // treating them as clause breaks would tear a genuine match in half.
    const { perPlace } = attributeTikTok(
      [{ title: 'Review BUN BO HUE THAO - HOANG DIEU ngon', link: url, snippet: '' }],
      PLACES,
    )

    expect(perPlace.get('BÚN BÒ HUẾ THẢO - HOÀNG DIỆU')).toBe(url)
  })
})

describe('the invariants the fix must not weaken', () => {
  const url = 'https://www.tiktok.com/@x/video/5555555555555555555'

  it('still requires EVERY distinctive token, not merely one of them', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'Review bun bo Thao ngon', link: url, snippet: '' }],
      PLACES,
    )

    // "thao" is distinctive and present; "hoang" and "dieu" are not. One out of three is not evidence.
    expect(perPlace.get('BÚN BÒ HUẾ THẢO - HOÀNG DIỆU')).toBeUndefined()
  })

  it('still refuses to attribute on tokens shared across the batch', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'bun bo hue ngon o phu nhuan', link: url, snippet: '' }],
      PLACES,
    )

    expect([...perPlace.keys()]).toEqual([])
  })

  it('still gives one URL to at most one place', () => {
    const { perPlace } = attributeTikTok(
      [{ title: 'So sanh Quan Alpha va Quan Beta', link: url, snippet: '' }],
      ['Quan Alpha', 'Quan Beta'],
    )

    expect([...perPlace.values()]).toEqual([url])
  })
})
