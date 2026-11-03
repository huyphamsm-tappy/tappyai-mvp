// @vitest-environment node
// Phase 7 closeout 2B/2C — VERIFIED vs UNVERIFIED for flight and cinema facts no approved source returns.
import { describe, it, expect } from 'vitest'
import { askedDimensions, verificationLead, UNVERIFIED_SENTENCE_VI } from './verificationLead'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

describe('which dimension the user asked (their own words decide)', () => {
  it.each([
    ['giá bao nhiêu?', ['fare']],
    ['giá vé bao nhiêu?', ['fare']],
    ['chiều về thì sao?', ['fare']],
    ['có chuyến sáng không?', ['schedule']],
    ['mấy giờ bay?', ['schedule']],
    ['chuyến đó đang đúng giờ không?', ['status']],
    ['chuyến đó có bị hoãn không', ['status']],
  ])('flight: %s → %j', (q, d) => expect(askedDimensions(q, 'flight')).toEqual(d))
  it.each([
    ['Trại Buôn Người suất nào?', ['showtime']],
    ['7 giờ có suất không?', ['showtime']],
    ['giá vé bao nhiêu?', ['ticket']],
    ['coi có xuất chiếu ở rạp nào giá nhiêu 1 vé', ['ticket']],
    ['CGV nào?', []],
  ])('movie: %s → %j', (q, d) => expect(askedDimensions(q, 'movie')).toEqual(d))
})

describe('verificationLead — the owner sentence leads unless the reply already says that dimension is unverified', () => {
  it('status question, reply silent → the status sentence', () => {
    expect(verificationLead({ flight: true, movie: false, userText: 'chuyến đó đang đúng giờ không?', prose: 'Bạn xem ở nút bên dưới.', lang: 'vi' })).toBe(`${UNVERIFIED_SENTENCE_VI.status} `)
  })
  it('"giờ bay … chưa xác minh" does not count as the fare being unverified', () => {
    expect(verificationLead({ flight: true, movie: false, userText: 'giá bao nhiêu?', prose: 'Giờ bay và tình trạng chuyến cũng chưa xác minh.', lang: 'vi' })).toBe(`${UNVERIFIED_SENTENCE_VI.fare} `)
  })
  it('a reply that already says it is left as written', () => {
    expect(verificationLead({ flight: true, movie: false, userText: 'giá bao nhiêu?', prose: 'Giá vé TP.HCM → Quy Nhơn ngày 05/10 hiện chưa xác minh được.', lang: 'vi' })).toBe('')
    expect(verificationLead({ flight: false, movie: true, userText: '7 giờ có suất không?', prose: 'Suất chiếu 19:00 tối nay chưa xác minh được.', lang: 'vi' })).toBe('')
  })
  it('no flight / film result this turn → nothing is added', () => {
    expect(verificationLead({ flight: false, movie: false, userText: 'giá bao nhiêu?', prose: 'x', lang: 'vi' })).toBe('')
  })
})

async function turn(toolName: string, args: Record<string, unknown>, result: unknown, userText: string, reply: string) {
  const c = createEnrichmentCollector(userText, []); c.agentMode = true
  const lines = [`9:${JSON.stringify({ toolCallId: 't1', toolName, args })}`, `a:${JSON.stringify({ toolCallId: 't1', result })}`, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, userText, false).body).text()
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('through the real stream filter', () => {
  const FLIGHT = { origin: 'SGN', destination: 'UIH', depart_date: '2026-10-05', fare_status: 'not_verified', booking_links: [], _tappy_verification: { fare_for_date: 'not_verified', schedule: 'not_verified', flight_status: 'not_verified' } }
  it('flight status follow-up: the status sentence leads; no time or status is invented', async () => {
    const out = await turn('get_flight_prices', { origin: 'TP.HCM', destination: 'Quy Nhơn' }, FLIGHT, 'chuyến đó đang đúng giờ không?', 'Bạn có thể kiểm tra trên trang hãng bay ở nút bên dưới.')
    expect(out.startsWith(UNVERIFIED_SENTENCE_VI.status)).toBe(true)
  })
  it('morning-flight follow-up: the schedule sentence leads', async () => {
    const out = await turn('get_flight_prices', { origin: 'TP.HCM', destination: 'Quy Nhơn' }, FLIGHT, 'có chuyến sáng không?', 'Bạn xem các chuyến theo giờ ở nút bên dưới.')
    expect(out.startsWith(UNVERIFIED_SENTENCE_VI.schedule)).toBe(true)
  })
  it('film follow-up "7 giờ có suất không?": the showtime sentence leads (the film tool returns no showtime source)', async () => {
    const MOVIE = { results: [], _tappy_movie: { title: 'Trại Buôn Người', showtimes: null, ticketPrice: null, showingToday: true, sources: [], asOf: 'x' } }
    const out = await turn('get_movie_showtimes', { movieTitle: 'Trại Buôn Người' }, MOVIE, '7 giờ có suất không?', 'Bạn mở trang phim bên dưới để chọn rạp.')
    expect(out.startsWith(UNVERIFIED_SENTENCE_VI.showtime)).toBe(true)
  })
  it('film follow-up "giá vé bao nhiêu?": the ticket-price sentence leads', async () => {
    const MOVIE = { results: [], _tappy_movie: { title: 'Trại Buôn Người', showtimes: null, ticketPrice: null, showingToday: true, sources: [], asOf: 'x' } }
    const out = await turn('get_movie_showtimes', { movieTitle: 'Trại Buôn Người' }, MOVIE, 'giá vé bao nhiêu?', 'Bạn xem giá khi chọn suất trên trang rạp.')
    expect(out.startsWith(UNVERIFIED_SENTENCE_VI.ticket)).toBe(true)
  })
})
