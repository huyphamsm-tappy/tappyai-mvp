// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { mentionsTickets, guardPlaceClaimsInText } from './placeClaimGuard'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE NON-PLACE TURN RAN NO GUARD AT ALL.
//
// Measured 2026-09-09. "cuối tuần này ở Quận 1 có sự kiện gì hay, mua vé ở đâu?"
// was answered with `get_news` + `web_search` — NOT `search_places`. So
// `needProfile.domain !== 'places'`, `placeIntent` was false, `bufferMode`
// stayed false, and `emitReconstructed` returns early on `!bufferMode`: the
// entire settle path, every provenance guard, was skipped and the bytes were
// already on the wire.
//
// These tests drive the REAL streaming filter with `placeIntent: false`, which
// is the condition that produced the leak.
// ─────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)

/** A turn with NO place tool: exactly the news/event shape. */
async function runNonPlaceTurn(chunks: string[], userText: string) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      for (const ch of chunks) c.enqueue(enc.encode(line0(ch) + '\n'))
      c.enqueue(enc.encode('d:{"finishReason":"stop"}\n'))
      c.close()
    },
  })
  const res = applyPlaceEnrichmentStreamFilter(
    new Response(body), 'vi', undefined, undefined, undefined, undefined,
    false,        // travelIntent
    userText,     // the user's own message — the trigger
    false,        // placeIntent — NOT a place turn, as measured
  )
  return await new Response(res.body).text()
}

/** The user's message from the measured turn. */
const TICKET_QUESTION = 'cuối tuần này ở Quận 1 có sự kiện gì hay, mua vé ở đâu?'
/** A question that has nothing to do with tickets. */
const WEATHER_QUESTION = 'thời tiết Hà Nội hôm nay thế nào?'

describe('the turn trigger', () => {
  it('recognises the measured ticket question', () => {
    expect(mentionsTickets(TICKET_QUESTION)).toBe(true)
  })

  it('does not fire on unrelated turns', () => {
    expect(mentionsTickets(WEATHER_QUESTION)).toBe(false)
    expect(mentionsTickets('giá vàng hôm nay')).toBe(false)
    expect(mentionsTickets('')).toBe(false)
    expect(mentionsTickets(undefined)).toBe(false)
  })
})

describe('a news/event turn can no longer leak ticket claims', () => {
  it('removes an availability claim on a turn with no place tool', async () => {
    const out = await runNonPlaceTurn(
      ['Sự kiện âm nhạc tại Nhà hát Thành phố ', 'còn vé cho suất 20h tối nay.', ' Bạn quan tâm chứ?'],
      TICKET_QUESTION,
    )
    expect(out).not.toContain('còn vé')
    expect(out).not.toContain('suất 20h')
  })

  it('removes a ticket-sale claim on a turn with no place tool', async () => {
    const out = await runNonPlaceTurn(
      ['Ticketbox có bán vé online cho sự kiện này.', ' Bạn quan tâm chứ?'],
      TICKET_QUESTION,
    )
    expect(out).not.toContain('có bán vé online')
  })

  it('keeps the honest look-it-up sentence', async () => {
    const out = await runNonPlaceTurn(
      ['Bạn có thể kiểm tra thêm trên Ticketbox — nền tảng bán vé sự kiện lớn nhất Việt Nam.'],
      TICKET_QUESTION,
    )
    expect(out).toContain('kiểm tra thêm trên Ticketbox')
  })

  // 🔑 The place-specific rules must NOT fire here: this turn never had a chance
  // to collect place ratings, so fail-closing on them would delete a film score
  // a web snippet really did support.
  it('does not apply place-specific rules to a news turn', async () => {
    const out = await runNonPlaceTurn(
      ['Phim này được 8.5 điểm trên các trang đánh giá. Bạn muốn mua vé không?'],
      TICKET_QUESTION,
    )
    expect(out).toContain('8.5 điểm')
  })

  it('leaves an unrelated turn fully live and untouched', async () => {
    const text = 'Hà Nội hôm nay 28 độ, trời nắng nhẹ.'
    const out = await runNonPlaceTurn([text], WEATHER_QUESTION)
    expect(out).toContain('28 độ')
  })
})

describe('full-text and streaming agree', () => {
  it('the guard removes what the stream withheld', () => {
    const sentence = 'Sự kiện này còn vé cho suất 20h tối nay.'
    const out = guardPlaceClaimsInText(sentence + '\nSự kiện ở Quận 1.', {
      ratings: [], distancesKm: [], texts: [], placeNames: [],
      ticketablePlaces: new Set<string>(),
    }, { scope: 'tickets' })
    expect(out.redacted).toBeGreaterThan(0)
  })
})

// ── C3 (2026-09-20): the SCHEDULE + TICKET unit on a cinema turn that ran no place tool ──
// Measured live (autorun run 19): "tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao
// nhiêu?" was answered from web_search; no rule matched the question, so a made-up ticket band
// "(thường 80k-150k tùy định dạng 2D/3D)" reached the user. The cinema link must stay.
describe('C3 — cinema showtime / ticket price with no fetched row', () => {
  const CINEMA_QUESTION = 'tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?'
  const NL = String.fromCharCode(10)
  const LIVE = [
    'Mình chưa có lịch chiếu trực tuyến của rạp. Bạn xem lịch trên trang CGV:', '',
    '- **Lịch chiếu tối nay** (20/9) tại CGV Vincom Đồng Khởi',
    '- **Giá vé** theo suất chiếu (thường 80k-150k tùy định dạng 2D/3D)',
    '- Suất chiếu lúc 19h30 và 21h45 còn ghế.', '',
    'Bạn muốn xem phim gì? 🎬', '',
    '[CTA_BUTTONS]{"buttons":[{"label":"🎬 Xem lịch chiếu CGV","type":"website","url":"https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/","primary":true}]}[/CTA_BUTTONS]',
  ].join(NL)

  it('the trigger recognises the measured cinema question (and plain admission asks)', () => {
    expect(mentionsTickets(CINEMA_QUESTION)).toBe(true)
    expect(mentionsTickets('giá vé Đầm Sen bao nhiêu?')).toBe(true)
    expect(mentionsTickets('phim nào hay tối nay?')).toBe(false) // a what-to-watch ask is not a ticket turn
  })

  it('cuts the invented ticket band and the showtime, keeps the cinema CTA, and says so once', async () => {
    const out = await runNonPlaceTurn([LIVE], CINEMA_QUESTION)
    expect(out).not.toContain('80k-150k')
    expect(out).not.toContain('19h30')
    expect(out).toContain('cgv-vincom-dong-khoi')
    expect(out).toContain('Lịch chiếu tối nay')
    expect(out.match(/Suất chiếu và giá vé cụ thể mình chưa xác nhận được/g)).toHaveLength(1)
  })

  it('a ticket turn with nothing to cut carries no hedge', async () => {
    const out = await runNonPlaceTurn(['Mình chưa có lịch chiếu trực tuyến — bạn xem trên trang rạp nhé.'], CINEMA_QUESTION)
    expect(out).not.toContain('chưa xác nhận được')
  })
})

// ── C3 (2026-09-20, run 20): a released bold link must not make the settled reply repeat ──
describe('C3 — an early-released sentence with a bold link is sent once, unemphasized', () => {
  const CINEMA_QUESTION = 'tối nay rạp CGV Vincom Đồng Khởi chiếu phim gì, mấy giờ, vé bao nhiêu?'
  const NL = String.fromCharCode(10)
  it('the opening streams early without the bold, and the settled remainder does not restate it', async () => {
    const opening = 'Bạn xem lịch trên **[trang CGV Vincom Đồng Khởi](https://www.cgv.vn/en/cinox/site/cgv-vincom-dong-khoi/)** nhé.' + NL + NL
    const rest = 'Giá vé thường từ 80k-150k tùy suất chiếu. Bạn muốn xem phim gì?'
    const out = await runNonPlaceTurn([opening, rest], CINEMA_QUESTION)
    expect(out.split('trang CGV Vincom Đồng Khởi').length - 1).toBe(1)
    expect(out).not.toContain('**[trang CGV')
    expect(out).not.toContain('80k-150k')
    expect(out).toContain('Bạn muốn xem phim gì?')
  })
})
