// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  guardPlaceClaimsInText, mayRedactPlaceClaim,
  isTicketSaleClaim, isTicketAvailabilityClaim, isDirectTicketUrl,
} from './placeClaimGuard'
import { safeFlushPoint } from './progressiveFlush'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 ENTERTAINMENT HAD NO TICKET BOUNDARY AT ALL.
//
// Reproduced 2026-09-09 on "rạp phim ở Quận 1 tối nay chiếu gì, đặt vé thế nào?".
// `ORDERING_RE` knows the FOOD verbs (đặt bàn / gọi món / giao hàng) and nothing
// about vé, so every sentence below passed the guard AND streamed early against
// an empty evidence set.
//
// Fixtures are the real batch and the real retrieved links from that turn.
// ─────────────────────────────────────────────────────────────────────────────

/** The cinemas live Overpass actually returned for District 1. */
const BATCH = ['Galaxy Cinema', 'Rạp Phim Cinestar', 'rạp chiếu phim CGV']

/** Verbatim retrieved links from the measured turn. */
const CHAIN_HOMEPAGE_A = 'https://www.galaxycine.vn/'
const CHAIN_HOMEPAGE_B = 'https://cinestar.com.vn/'
const VENUE_OWN_PAGE = 'https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/'

const ev = (o: object = {}) => ({
  ratings: [] as number[], distancesKm: [] as number[], texts: [] as string[],
  placeNames: BATCH,
  ratingsByEntity: new Map<string, number[]>(),
  reviewCountsByEntity: new Map<string, number[]>(),
  phonesByEntity: new Map<string, string[]>(),
  ticketablePlaces: new Set<string>(),
  ...o,
})
const TAIL = '\nRạp nằm ở Quận 1.'

describe('a homepage is not an entity-level ticket URL', () => {
  it('rejects chain homepages', () => {
    expect(isDirectTicketUrl(CHAIN_HOMEPAGE_A)).toBe(false)
    expect(isDirectTicketUrl(CHAIN_HOMEPAGE_B)).toBe(false)
  })

  it("accepts a venue's own deep page", () => {
    expect(isDirectTicketUrl(VENUE_OWN_PAGE)).toBe(true)
  })

  it('rejects a search URL however deep', () => {
    expect(isDirectTicketUrl('https://www.galaxycine.vn/tim-kiem?q=phim')).toBe(false)
    expect(isDirectTicketUrl('https://ticketbox.vn/search/results?query=concert')).toBe(false)
  })

  it('rejects nothing at all', () => {
    expect(isDirectTicketUrl(undefined)).toBe(false)
    expect(isDirectTicketUrl('not a url')).toBe(false)
  })
})

describe('ticket SALE claims need a direct entity ticket page', () => {
  const MEASURED = [
    'Bạn có thể mua vé online tại Galaxy Cinema.',
    'Rạp chiếu phim CGV có bán vé online.',
    'Đặt vé ngay tại Galaxy Cinema để giữ chỗ.',
  ]

  it.each(MEASURED)('removes the unsupported sale claim: %s', (sentence) => {
    expect(guardPlaceClaimsInText(sentence + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  it.each(MEASURED)('holds it back from early streaming: %s', (sentence) => {
    expect(mayRedactPlaceClaim(sentence)).toBe(true)
    expect(safeFlushPoint(sentence + ' Còn nhiều rạp khác.')).toBe(0)
  })

  it('a chain homepage does NOT make the claim supportable', () => {
    // Exactly the shape retrieved for Galaxy: an attributed link, but a front door.
    expect(isDirectTicketUrl(CHAIN_HOMEPAGE_A)).toBe(false)
    expect(guardPlaceClaimsInText('Galaxy Cinema có bán vé online.' + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  it("a venue's own deep page does", () => {
    const out = guardPlaceClaimsInText('Rạp chiếu phim CGV có bán vé online.' + TAIL,
      ev({ ticketablePlaces: new Set(['rạp chiếu phim CGV']) }))
    expect(out.redacted).toBe(0)
  })

  it('does not lend one cinema another cinema ticket page', () => {
    expect(guardPlaceClaimsInText('Galaxy Cinema có bán vé online.' + TAIL,
      ev({ ticketablePlaces: new Set(['rạp chiếu phim CGV']) })).redacted).toBeGreaterThan(0)
  })
})

describe('availability and showtimes are never supportable', () => {
  const MEASURED = [
    'Rạp Phim Cinestar còn vé cho suất 20h tối nay.',
    'Galaxy Cinema đang chiếu suất 21h tối nay.',
    'Vé xem phim tại Galaxy Cinema đã bán hết.',
  ]

  it.each(MEASURED)('removes it: %s', (sentence) => {
    expect(guardPlaceClaimsInText(sentence + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  // 🚨 THE POINT OF THE SEPARATE RULE: a ticket page lets the user CHECK
  // availability; it never tells us the answer.
  it.each(MEASURED)('stays removed even with a direct ticket page: %s', (sentence) => {
    const out = guardPlaceClaimsInText(sentence + TAIL, ev({
      ticketablePlaces: new Set(BATCH),
    }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it.each(MEASURED)('holds it back from early streaming: %s', (sentence) => {
    expect(mayRedactPlaceClaim(sentence)).toBe(true)
  })
})

describe('the honest instructional sentence survives', () => {
  // 🔑 The measured reply directed the user to each cinema's own site. That is
  // the correct form and widening the vocabulary must not delete it.
  it('keeps "vào website để xem lịch chiếu và đặt vé"', () => {
    const text = 'Để xem lịch chiếu tối nay và đặt vé, bạn vào website hoặc app của từng rạp.'
    expect(isTicketSaleClaim(text)).toBe(false)
    expect(guardPlaceClaimsInText(text + TAIL, ev()).redacted).toBe(0)
  })

  it('but an assertion inside a framing sentence is still caught', () => {
    const text = 'Bạn vào website Galaxy Cinema, rạp này có bán vé online.'
    expect(isTicketSaleClaim(text)).toBe(true)
  })

  it('treats "kiểm tra trên <platform>" as framing, not a sale claim', () => {
    // The aggregator homepage is a place to LOOK, and the sentence says so.
    const text = 'Bạn có thể kiểm tra thêm trên Ticketbox — nền tảng bán vé sự kiện lớn nhất Việt Nam.'
    expect(isTicketSaleClaim(text)).toBe(false)
  })

  it('leaves a question alone', () => {
    const q = 'Bạn muốn mình tìm suất chiếu tối nay không?'
    expect(isTicketSaleClaim(q)).toBe(false)
    expect(isTicketAvailabilityClaim(q)).toBe(false)
  })

  it('does not fire on ordinary cinema prose', () => {
    for (const t of ['Galaxy Cinema nằm trên đường Nguyễn Du.', 'Rạp này cách bạn 0.4km.']) {
      expect(isTicketSaleClaim(t)).toBe(false)
      expect(isTicketAvailabilityClaim(t)).toBe(false)
    }
  })
})

describe('guard and flush cannot drift on tickets', () => {
  it('every ticket sentence the guard removes is one the flush holds', () => {
    const all = [
      'Bạn có thể mua vé online tại Galaxy Cinema.',
      'Rạp Phim Cinestar còn vé cho suất 20h tối nay.',
      'Galaxy Cinema đang chiếu suất 21h tối nay.',
    ]
    for (const s of all) {
      expect(guardPlaceClaimsInText(s + TAIL, ev()).redacted).toBeGreaterThan(0)
      expect(mayRedactPlaceClaim(s)).toBe(true)
    }
  })
})

// ── The same boundary through the REAL streaming filter ─────────────────────
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const line0 = (s: string) => '0:' + JSON.stringify(s)

async function runStreamed(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const ch of chunks) c.enqueue(enc.encode(line0(ch) + '\n'))
      c.close()
    },
  })
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(body), 'vi', undefined, undefined, undefined, undefined,
    false, '', true /* placeIntent — a cinema turn */,
  )
  return await new Response(res.body).text()
}

describe('entertainment ticket claims cannot escape through the stream', () => {
  it('does not leak an availability claim through the early prefix', async () => {
    const out = await runStreamed([
      'Galaxy Cinema đang chiếu ', 'suất 21h tối nay.', ' Rạp nằm ở Quận 1.',
    ])
    expect(out).not.toContain('suất 21h')
  })

  it('does not leak a ticket-sale claim through the early prefix', async () => {
    const out = await runStreamed([
      'Rạp chiếu phim CGV có bán vé online.', ' Rạp nằm ở Quận 1.',
    ])
    expect(out).not.toContain('bán vé online')
  })

  it('still delivers the honest instructional sentence', async () => {
    const out = await runStreamed([
      'Để xem lịch chiếu tối nay và đặt vé, bạn vào website của từng rạp.',
      ' Bạn muốn xem phim gì?',
    ])
    expect(out).toContain('vào website của từng rạp')
  })

  // Verbatim from the event UAT. It DOES carry ticket vocabulary ("bán vé"), so
  // the framing exemption is what saves it — an earlier version of this test used
  // a sentence with no ticket words at all and therefore proved nothing.
  it('keeps a "kiểm tra trên <platform>" framing sentence', async () => {
    const out = await runStreamed([
      'Bạn có thể kiểm tra thêm trên Ticketbox — nền tảng bán vé sự kiện lớn nhất Việt Nam.',
      ' Bạn quan tâm loại sự kiện nào?',
    ])
    expect(out).toContain('kiểm tra thêm trên Ticketbox')
  })
})
