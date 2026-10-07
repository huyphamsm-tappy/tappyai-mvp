import { describe, it, expect, vi } from 'vitest'
import { enrichWithTikTok, buildTikTokQuery, worthQuerying, tiktokQueryName, MAX_TIKTOK_ENTITIES, MAX_TIKTOK_BATCHES, namesAnotherCity, droppedTailTokens } from './tiktokEnrichment'

// ─────────────────────────────────────────────────────────────────────────────
// THE V1/V2 CAPABILITY, AND WHY IT WENT MISSING.
//
// V1/V2 (commit d42ece4) shipped TikTok review links. V3 kept every validator
// and attributor and still produced none, because the search was gated off.
// The gate was a response to a real measurement — 17 live turns, 0 attributed
// links — whose cause was misread.
//
// Re-measured against the live provider on 2026-09-10:
//
//   AREA query, exactly what V1/V2 and gated-V3 both sent:
//     "Quán bún bò ngon ở TP.HCM TP.HCM review site:tiktok.com"
//     → 8 organic, 8 VALID TikTok post URLs, 0 attributable:
//       "13 Quán Bún Bò Ngon Nhất Sài Gòn" (listicle)
//       "Top 5 Quán Bún Bò Ngon Nhất Tại Sài Gòn" (listicle)
//       "Review quán bún bò Bà Ba hấp dẫn tại TP.HCM" (a DIFFERENT venue)
//
//   ENTITY queries, what this module sends:
//     '"Bánh Mì Huỳnh Hoa" TP.HCM site:tiktok.com'  → 8/8 attributed
//     '"Cơm Tấm Ba Ghiền" …' → 6/6 · '"Phở Hòa Pasteur" …' → 5/5
//     '"Bún Bò Huế Đông Ba" …' → 4/4 · '"Bà Nà Hills" Đà Nẵng …' → 8/8
//
//   BATCHED, one credit for the whole card:
//     '"Bún Bò Huế Đông Ba" OR "Phở Hòa Pasteur" OR "Bánh Mì Huỳnh Hoa"
//      OR "Cơm Tấm Ba Ghiền" TP.HCM site:tiktok.com'  → 3 of 4 attributed
//
// The fixtures below are those real responses.
// ─────────────────────────────────────────────────────────────────────────────

/** Verbatim from the live area query — every URL valid, none attributable. */
const AREA_RESULTS = [
  { title: '13 Quán Bún Bò Ngon Nhất Sài Gòn Bạn Không Nên Bỏ Qua - TikTok', link: 'https://www.tiktok.com/@didauofficial/video/7556564054332984583', snippet: '' },
  { title: 'Top 5 Quán Bún Bò Ngon Nhất Tại Sài Gòn - TikTok', link: 'https://www.tiktok.com/@tieusanhanuong/video/7501228020049530120', snippet: '' },
  { title: 'Review quán bún bò Bà Ba hấp dẫn tại TP.HCM - TikTok', link: 'https://www.tiktok.com/@vinhnoithiet/video/7400722024814873874', snippet: '' },
]

/** Verbatim from the live batched entity query. */
const ENTITY_RESULTS = [
  { title: 'Bún Bò Huế Đông Ba tại Nguyễn Văn Thủ, TP.HCM | TikTok', link: 'https://www.tiktok.com/@dbtuyen_/photo/7666723553600916757', snippet: '' },
  { title: 'Review Bánh Mì Huỳnh Hoa tại Sài Gòn | TikTok', link: 'https://www.tiktok.com/@kieu_van_thai/video/6926100708349562114', snippet: '' },
  { title: 'Cơm Tấm Ba Ghiền - Tiệm Michelin Độc Đáo Tại Sài Gòn | TikTok', link: 'https://www.tiktok.com/@tinhtungtangvn/video/7241863920590294277', snippet: '' },
]

const CARD = ['Bún Bò Huế Đông Ba', 'Phở Hòa Pasteur', 'Bánh Mì Huỳnh Hoa', 'Cơm Tấm Ba Ghiền']

describe('THE REGRESSION: entity evidence exists and must reach the entity', () => {
  it('attributes each real video to the venue it names', async () => {
    const search = vi.fn(async () => ENTITY_RESULTS)
    const out = await enrichWithTikTok(CARD, 'TP.HCM', search)

    expect(out.perPlace.get('Bún Bò Huế Đông Ba')).toBe('https://www.tiktok.com/@dbtuyen_/photo/7666723553600916757')
    expect(out.perPlace.get('Bánh Mì Huỳnh Hoa')).toBe('https://www.tiktok.com/@kieu_van_thai/video/6926100708349562114')
    expect(out.perPlace.get('Cơm Tấm Ba Ghiền')).toBe('https://www.tiktok.com/@tinhtungtangvn/video/7241863920590294277')
  })

  it('leaves a venue the search did not cover WITHOUT a link — no placeholder', async () => {
    const out = await enrichWithTikTok(CARD, 'TP.HCM', async () => ENTITY_RESULTS)
    expect(out.perPlace.has('Phở Hòa Pasteur')).toBe(false)
  })

  /**
   * 🚨 THE HEART OF IT. These three URLs are all genuine TikTok posts and all
   * would have passed a naive "is it a tiktok.com link" check. None is about any
   * venue on the card. This is what the old area query returned, every time.
   */
  it('rejects the entire AREA result set — listicles are not entity evidence', async () => {
    const out = await enrichWithTikTok(CARD, 'TP.HCM', async () => AREA_RESULTS)
    expect(out.perPlace.size).toBe(0)
  })

  it('offers an unattributable post as a BATCH link, never as a venue review', async () => {
    const out = await enrichWithTikTok(CARD, 'TP.HCM', async () => AREA_RESULTS)
    expect(out.batch).toBeTruthy()
    expect(out.perPlace.size).toBe(0)
  })
})

describe('what may never become a TikTok review action', () => {
  it.each([
    ['a profile', 'https://www.tiktok.com/@foodordershushu'],
    ['a search page', 'https://www.tiktok.com/search?q=bun+bo'],
    ['a hashtag feed', 'https://www.tiktok.com/tag/bunbo'],
    ['the homepage', 'https://www.tiktok.com/'],
    ['a lookalike host', 'https://tiktok.com.evil.example/@a/video/123'],
    ['a fabricated non-numeric id', 'https://www.tiktok.com/@quan/video/bun-bo-hue-dong-ba'],
  ])('rejects %s', async (_label, link) => {
    const out = await enrichWithTikTok(['Bún Bò Huế Đông Ba'], 'TP.HCM', async () => [
      { title: 'Bún Bò Huế Đông Ba', link, snippet: '' },
    ])
    expect(out.perPlace.size).toBe(0)
    expect(out.batch).toBeNull()
  })

  it('does not attach one venue\'s video to a similarly named other venue', async () => {
    // Real trap: two GÓC HUẾ branches. A video naming only one must not claim both.
    const out = await enrichWithTikTok(['GÓC HUẾ Kỳ Đồng', 'GÓC HUẾ An Dương Vương'], 'TP.HCM', async () => [
      { title: 'Review GÓC HUẾ Kỳ Đồng quận 3 | TikTok', link: 'https://www.tiktok.com/@a/video/7000000000000000001', snippet: '' },
    ])
    expect(out.perPlace.get('GÓC HUẾ Kỳ Đồng')).toBeTruthy()
    expect(out.perPlace.has('GÓC HUẾ An Dương Vương')).toBe(false)
  })

  /**
   * 🚨 THE ONE ATTRIBUTION DEFECT UAT FOUND — a chain's OTHER BRANCH.
   *
   * Live result: the card entity "Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1,
   * TP. HCM" was given a genuine video titled "Vua Chả Cá Lã Vọng: Ăn Nhóm
   * Không Đi Một Mình" — about the same brand at a HANOI branch. Trimming the
   * branch suffix is what makes attribution possible at all, and it is also what
   * makes a sibling branch matchable; this is the compensating guard.
   */
  it('rejects the same brand in a DIFFERENT city', async () => {
    const out = await enrichWithTikTok(['Vua Chả Cá'], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá Lã Vọng Mỹ Đình Hà Nội | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000010', snippet: '' },
    ])
    expect(out.perPlace.size).toBe(0)
    expect(out.batch).toBeNull()
  })

  it('keeps the same brand in the SEARCHED city', async () => {
    const out = await enrichWithTikTok(['Vua Chả Cá'], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá Lã Vọng quận 1 Sài Gòn | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000011', snippet: '' },
    ])
    expect(out.perPlace.get('Vua Chả Cá')).toBeTruthy()
  })

  /**
   * Asymmetric on purpose: most genuine reviews name NO city, and rejecting them
   * would throw away the majority of real evidence. Only a DIFFERENT known city
   * is a mismatch.
   */
  it('keeps a result that names no city at all', async () => {
    const out = await enrichWithTikTok(['Vua Chả Cá'], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá ngon nức tiếng | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000012', snippet: '' },
    ])
    expect(out.perPlace.get('Vua Chả Cá')).toBeTruthy()
  })

  /**
   * 🚨 A TRIMMED NAME MUST EARN THE CITY BACK. Found twice in UAT on the same
   * venue: "Vua Chả Cá - Số 42-44-46 … Q.1, TP. HCM" trims to the bare brand,
   * and Vua Chả Cá Lã Vọng is a Hanoi-origin CHAIN. Both times the search
   * returned a real video about a Hanoi branch, and the second slipped past the
   * "different city" rule because the city appeared only in hashtags on the
   * video page, never in the snippet the guard can read.
   *
   * When trimming weakened the identity, silence is no longer good enough.
   */
  it('a TRIMMED name requires the city to be named, not merely un-contradicted', async () => {
    const trimmed = 'Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM'
    const silent = await enrichWithTikTok([trimmed], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá Lã Vọng ăn nhóm không đi một mình | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000020', snippet: '' },
    ])
    expect(silent.perPlace.size).toBe(0)

    const corroborated = await enrichWithTikTok([trimmed], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá Lã Vọng Trần Hưng Đạo Sài Gòn | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000021', snippet: '' },
    ])
    expect(corroborated.perPlace.get(trimmed)).toBeTruthy()
  })

  /**
   * 🚨 THE BUG THE FIRST GUARD HAD: it filtered the RESULT LIST with
   * `asked.some(...)`, so one untrimmed name in the chunk waved every result
   * through for every other name. The Hanoi video came back a third time in UAT
   * because a sibling entity in the same chunk had an untrimmed name. The rule
   * belongs on the (name, URL) pair attribution actually produced.
   */
  it('one untrimmed name in the chunk does not excuse a trimmed one', async () => {
    const trimmed = 'Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM'
    const out = await enrichWithTikTok([trimmed, 'Bánh Mì Huỳnh Hoa'], 'TP.HCM', async () => [
      { title: 'Vua Chả Cá Lã Vọng ăn nhóm không đi một mình | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000030', snippet: '' },
      { title: 'Review Bánh Mì Huỳnh Hoa | TikTok',
        link: 'https://www.tiktok.com/@b/video/7000000000000000031', snippet: '' },
    ])
    expect(out.perPlace.has(trimmed)).toBe(false)
    expect(out.perPlace.get('Bánh Mì Huỳnh Hoa')).toBeTruthy()
  })

  /**
   * 🚨 CITY WAS NOT ENOUGH, MEASURED. Serper's snippets mix cities inside one
   * fragment — "… TP.HCM … Mô hình kinh doanh của Vua Chả Cá Hà Nội …" — so a
   * Hanoi video can satisfy a TP.HCM city test. The correct result instead names
   * the branch: "Vua Chả Cá Vietnamese Restaurant - Số 42-44-46 Trần Hưng Đạo".
   * When trimming removed the branch, the branch is what must come back.
   */
  it('a trimmed name is proven by its BRANCH, not by a city mentioned in passing', async () => {
    const full = 'Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM'
    expect(droppedTailTokens(full)).toContain('tran')

    const cityOnlyHanoiVideo = await enrichWithTikTok([full], 'TP.HCM', async () => [
      { title: 'Khám Phá Chả Cá Lã Vọng - TikTok',
        snippet: '... TP.HCM ... Mô hình kinh doanh của Vua Chả Cá Hà Nội có gì ...',
        link: 'https://www.tiktok.com/@a/video/7000000000000000040' },
    ])
    expect(cityOnlyHanoiVideo.perPlace.size).toBe(0)

    const branchNamed = await enrichWithTikTok([full], 'TP.HCM', async () => [
      { title: 'Mê ăn chả cá thì tới lẹ đi #vuachaca - TikTok',
        snippet: 'Vua Chả Cá Vietnamese Restaurant - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. ...',
        link: 'https://www.tiktok.com/@b/video/7000000000000000041' },
    ])
    expect(branchNamed.perPlace.get(full)).toBe('https://www.tiktok.com/@b/video/7000000000000000041')
  })

  /**
   * 🚨 THE CITY MAY NOT STAND IN FOR THE BRANCH. Three separate UAT runs put the
   * Hanoi "Vua Chả Cá Lã Vọng" video on a District 1 card, because Serper
   * snippets splice fragments — one can name TP.HCM while the video is about
   * Hanoi. If a branch was removed to make the name matchable, only that branch
   * proves the match.
   */
  it('a city mentioned in the snippet cannot substitute for the branch', async () => {
    const full = 'Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM'
    const out = await enrichWithTikTok([full], 'TP.HCM', async () => [
      { title: 'Khám Phá Chả Cá Lã Vọng Ngày Quốc Khánh - TikTok',
        snippet: '... TP.HCM ... Mô hình kinh doanh của Vua Chả Cá Hà Nội có gì ...',
        link: 'https://www.tiktok.com/@a/video/7000000000000000050' },
    ])
    expect(out.perPlace.size).toBe(0)
  })

  it('an UNTRIMMED name keeps the lenient rule — silence is still fine', async () => {
    const out = await enrichWithTikTok(['Bánh Mì Huỳnh Hoa'], 'TP.HCM', async () => [
      { title: 'Review Bánh Mì Huỳnh Hoa | TikTok',
        link: 'https://www.tiktok.com/@a/video/7000000000000000022', snippet: '' },
    ])
    expect(out.perPlace.get('Bánh Mì Huỳnh Hoa')).toBeTruthy()
  })

  it('is inert when the turn resolved no city', () => {
    expect(namesAnotherCity('Vua Chả Cá Lã Vọng Hà Nội', undefined)).toBe(false)
    expect(namesAnotherCity('Vua Chả Cá Lã Vọng Hà Nội', 'TP.HCM')).toBe(true)
    expect(namesAnotherCity('Vua Chả Cá ngon', 'TP.HCM')).toBe(false)
  })

  it('never gives two venues the SAME url', async () => {
    const out = await enrichWithTikTok(['Bún Bò Huế Đông Ba', 'Bánh Mì Huỳnh Hoa'], 'TP.HCM', async () => [
      { title: 'Bún Bò Huế Đông Ba và Bánh Mì Huỳnh Hoa | TikTok', link: 'https://www.tiktok.com/@a/video/7000000000000000002', snippet: '' },
    ])
    expect(new Set(out.perPlace.values()).size).toBe(out.perPlace.size)
  })
})

describe('cost: one request, for the card only', () => {
  it('asks ONCE for a four-venue card, not once per venue', async () => {
    const search = vi.fn(async () => ENTITY_RESULTS)
    await enrichWithTikTok(CARD, 'TP.HCM', search)
    expect(search).toHaveBeenCalledTimes(1)
  })

  /**
   * 🚨 CHUNKED AT FOUR, AND THE CLIFF IS WHY. Measured on a live eight-venue
   * card: one 8-way OR query returned ZERO valid TikTok posts, while the same
   * eight split into two chunks of four returned 4/4 and 2/4. Batching the whole
   * card looked cheaper and produced nothing — 1 attributed link across 40
   * rendered entities in the first live run.
   */
  it('splits a full card into chunks of four, capped at two requests', async () => {
    const eight = [...CARD, 'Bánh Mì Hồng Hoa', 'Bánh Mì Mẹ Ỉn', 'Vua Chả Cá', 'Bò Tơ Quán Mộc']
    const search = vi.fn(async (_q: string) => ENTITY_RESULTS)
    await enrichWithTikTok(eight, 'TP.HCM', search)
    expect(search).toHaveBeenCalledTimes(2)
    expect(MAX_TIKTOK_BATCHES).toBe(2)
    for (const call of search.mock.calls) {
      expect(((call[0] as string).match(/ OR /g) ?? []).length).toBeLessThanOrEqual(3)
    }
  })

  it('never buys more than the chunk cap, however long the card', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `Quán Số ${i} Đặc Biệt`)
    const search = vi.fn(async (_q: string) => [])
    await enrichWithTikTok(many, 'TP.HCM', search)
    expect(search.mock.calls.length).toBeLessThanOrEqual(2)
  })

  /**
   * A card name often carries its own address — "Vua Chả Cá - Số 42-44-46 Trần
   * Hưng Đạo, Q.1, TP. HCM" was live. Every distinctive token must appear in the
   * video's text, so an address in the name makes attribution impossible.
   */
  it('searches the venue, not the venue plus its street address', () => {
    expect(tiktokQueryName('Vua Chả Cá - Số 42-44-46 Trần Hưng Đạo, Q.1, TP. HCM')).toBe('Vua Chả Cá')
    expect(tiktokQueryName('Bánh Mì Huynh Hoa - Lê Thị Riêng')).toBe('Bánh Mì Huynh Hoa')
    // Nothing left to identify a venue ⇒ keep the original rather than widen it.
    expect(tiktokQueryName('Ann - Quán')).toBe('Ann - Quán')
  })

  // The street-number strip had a literal 0x08 byte where `\b` was meant (commit 28e1d7d, a
  // heredoc turned "\b" into backspace) — the regex could never match, so a name with no dash
  // before its address kept the whole address and was never attributed.
  it('strips a street number that follows the name without a dash', () => {
    expect(tiktokQueryName('Bánh Mì Huỳnh Hoa Số 26 Lê Thị Riêng')).toBe('Bánh Mì Huỳnh Hoa')
    expect(tiktokQueryName('Bun Cha Huong Lien so 24 Le Van Huu')).toBe('Bun Cha Huong Lien')
    // A trailing digit with no "số" is part of the name.
    expect(tiktokQueryName('Cơm Tấm Phúc Lộc Thọ 1')).toBe('Cơm Tấm Phúc Lộc Thọ 1')
  })

  it('falls back to full names when trimming would merge two branches', async () => {
    const search = vi.fn(async (_q: string) => [])
    await enrichWithTikTok(['GÓC HUẾ - Kỳ Đồng', 'GÓC HUẾ - An Dương Vương'], 'TP.HCM', search)
    const q = search.mock.calls[0][0] as string
    // Both trim to "GÓC HUẾ"; the collision must keep the distinguishing tails.
    expect(q).toContain('Kỳ Đồng')
    expect(q).toContain('An Dương Vương')
  })

  it('names every venue and restricts the domain', async () => {
    const q = buildTikTokQuery(['Bún Bò Huế Đông Ba', 'Phở Hòa Pasteur'], 'TP.HCM')!
    expect(q).toContain('"Bún Bò Huế Đông Ba"')
    expect(q).toContain('"Phở Hòa Pasteur"')
    expect(q).toContain(' OR ')
    expect(q).toContain('site:tiktok.com')
    expect(q).toContain('TP.HCM')
  })

  /**
   * 🔑 THE COST RULE THE OLD GATE GOT BACKWARDS: fewer UNNECESSARY calls, not
   * zero calls. A request that cannot produce an attributable answer is the only
   * kind worth not making.
   */
  it('makes NO request when nothing is worth asking about', async () => {
    const search = vi.fn(async () => ENTITY_RESULTS)
    const out = await enrichWithTikTok(['Spa', 'Nơi ở'], 'TP.HCM', search)
    expect(search).not.toHaveBeenCalled()
    expect(out.searched).toBe(false)
  })

  it('makes NO request for an empty card', async () => {
    const search = vi.fn(async () => ENTITY_RESULTS)
    await enrichWithTikTok([], 'TP.HCM', search)
    expect(search).not.toHaveBeenCalled()
  })

  /**
   * 🚨 ASSERTED AGAINST A LITERAL, NOT AGAINST THE CONSTANT IT GUARDS. A
   * mutation raising `MAX_TIKTOK_ENTITIES` to 500 SURVIVED the first run,
   * because the test read the same constant and moved with it. A ceiling test
   * that imports its own ceiling measures nothing.
   */
  it('never asks about more venues than the card can render', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Quán Số ${i} Đặc Biệt`)
    const q = buildTikTokQuery(many, 'TP.HCM')!
    expect((q.match(/ OR /g) ?? []).length).toBeLessThanOrEqual(7)
    expect(MAX_TIKTOK_ENTITIES).toBe(8)
  })

  /**
   * 🚨 QUOTED NAMES ARE THE WHOLE DIFFERENCE between this query and the area
   * query that yielded nothing. An unquoted OR-chain is a bag of words about a
   * district again — which is exactly what `attributeTikTok` cannot use.
   */
  it('quotes every name, so the provider matches the venue and not the words', () => {
    const q = buildTikTokQuery(['Bún Bò Huế Đông Ba', 'Phở Hòa Pasteur'], 'TP.HCM')!
    const quoted = q.match(/"[^"]+"/g) ?? []
    expect(quoted).toEqual(['"Bún Bò Huế Đông Ba"', '"Phở Hòa Pasteur"'])
    expect(q).not.toMatch(/(^|\s)Bún Bò Huế Đông Ba(\s|$)/)
  })

  it('drops names too weak to be attributed rather than paying for them', () => {
    expect(worthQuerying('Spa')).toBe(false)
    expect(worthQuerying('Nơi ở')).toBe(false)
    expect(worthQuerying('Bún Bò Huế Đông Ba')).toBe(true)
  })

  /**
   * 🚨 THE QUERY BUILDER FILTERS ON ITS OWN, and a mutation proved that was not
   * yet tested: `enrichWithTikTok` also filters, so removing the builder's filter
   * SURVIVED — the two were redundant and one could be deleted unnoticed.
   * `buildTikTokQuery` is exported and used directly, so it has to hold its own
   * contract rather than lean on its caller's.
   */
  /**
   * 🚨 A JUNK NAME MUST NOT CONSUME THE BUDGET. The chunk cap is two requests;
   * if unattributable names ("Spa", "Nơi ở") are allowed to fill chunk slots,
   * the real venues behind them are never asked about at all. A mutation that
   * removed the pre-chunk filter SURVIVED until this case existed, because a
   * second filter inside the query builder masked it for every input that did
   * not test SLOT consumption.
   */
  it('weak names do not consume chunk slots that real venues need', async () => {
    const search = vi.fn(async (_q: string) => [])
    // Eight weak names — exactly the two chunks the cap allows. If they are not
    // filtered out BEFORE chunking, they consume every slot and the two real
    // venues behind them are never asked about at all.
    const names = ['Spa', 'Nơi ở', 'Quán', 'Hotel', 'Bar', 'Gym', 'Cafe', 'Chợ',
                   'Bún Bò Huế Đông Ba', 'Bánh Mì Huỳnh Hoa']
    await enrichWithTikTok(names, 'TP.HCM', search)
    const asked = search.mock.calls.map(c => c[0] as string).join(' ')
    expect(asked).toContain('"Bún Bò Huế Đông Ba"')
    expect(asked).toContain('"Bánh Mì Huỳnh Hoa"')
  })

  it('buildTikTokQuery refuses a weak name even when handed one directly', () => {
    expect(buildTikTokQuery(['Spa', 'Nơi ở'], 'TP.HCM')).toBeNull()
    const q = buildTikTokQuery(['Spa', 'Bún Bò Huế Đông Ba'], 'TP.HCM')!
    expect(q).toContain('"Bún Bò Huế Đông Ba"')
    expect(q).not.toContain('"Spa"')
  })
})

describe('a TikTok failure never costs the recommendation', () => {
  it('survives a thrown search', async () => {
    const out = await enrichWithTikTok(CARD, 'TP.HCM', async () => { throw new Error('provider down') })
    expect(out.perPlace.size).toBe(0)
    expect(out.batch).toBeNull()
  })

  it('survives a null and an empty result', async () => {
    expect((await enrichWithTikTok(CARD, 'TP.HCM', async () => null)).perPlace.size).toBe(0)
    expect((await enrichWithTikTok(CARD, 'TP.HCM', async () => [])).perPlace.size).toBe(0)
  })
})
