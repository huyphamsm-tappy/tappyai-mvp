// CP2 — flight / cinema follow-ups: real-source extraction, verification labels, follow-up state. No network.
import { describe, it, expect, vi } from 'vitest'
import { extractMovieFacts, movieFactsPayload, movieQuery, filmPageLinks } from '@/lib/ai/searchIntel/movieShowtimes'
import { labelFlightVerification } from './agentTools'
import { statePatchFrom } from './index'
import { followUpContextLines, agentContext, AGENT_SYSTEM as AGENT_SYSTEM_TEXT } from './prompt'
import { nextChatSessionState } from '@/lib/ai/consultative/chatSessionState'

const NOW = new Date('2026-10-04T05:00:00Z')
// The REAL Serper answer to "lịch chiếu Trại Buôn Người moveek" / "Trại Buôn Người lịch chiếu hôm nay CGV" (2026-10-04), trimmed.
const FILM = { results: [
  { title: 'Trại Buôn Người', link: 'https://moveek.com/phim/trai-buon-nguoi/', snippet: 'Trại Buôn Người ; Hài lòng 95% ; Khởi chiếu 25/09/2026 ; Thời lượng 135 phút ; Giới hạn tuổi. T18.' },
  { title: 'TRẠI BUÔN NGƯỜI', link: 'https://www.cgv.vn/default/trai-buon-nguoi.html', snippet: 'Đạo diễn: Toni Dương Bảo Anh ; Diễn viên: Steven Nguyễn, Quách Ngọc Ngoan ; Thể loại: Hành Động, Hồi hộp ; Khởi chiếu: 25/09/2026.' },
  { title: 'Mua vé', link: 'https://moveek.com/mua-ve/', snippet: 'Trại Buôn Người. T18 · 2h15\' · 2D Phụ Đề Anh 11:25 14:00 15:00 15:35 16:35 17:35 19:45 20:45 ...' },
  { title: 'Tàu Buôn Người', link: 'https://moveek.com/phim/tau-buon-nguoi/', snippet: 'Lịch chiếu Tàu Buôn Người và review phim. Mutiny - Action, Thriller.' },
  { title: 'CGV post', link: 'https://www.facebook.com/cgvcinemavietnam/posts/1', snippet: 'TRẠI BUÔN NGƯỜI chính thức khởi chiếu tại CGV.' },
] }

describe('cinema: a specific film — real metadata, never invented showtimes', () => {
  it('reads genre, runtime, age, release, score, director from the trusted film pages only', () => {
    const f = extractMovieFacts('Trại Buôn Người', FILM, ['Trại Buôn Người', 'Út Lan 2'], NOW)
    expect(f).toMatchObject({ genre: 'Hành Động, Hồi hộp', runtimeMin: 135, ageRating: 'T18', releaseDate: '25/09/2026', audienceScore: 95, director: 'Toni Dương Bảo Anh', showingToday: true })
    expect(f.sources.map(s => s.host)).toEqual(['moveek.com', 'cgv.vn'])
    expect(f.sources.some(s => /mua-ve|facebook|tau-buon/.test(s.url))).toBe(false)
  })
  it('showtimes and ticket price are null and the payload says NOT VERIFIED (the unattributed /mua-ve times are never used)', () => {
    const f = extractMovieFacts('Trại Buôn Người', FILM, ['Trại Buôn Người'], NOW)
    expect(f.showtimes).toBeNull(); expect(f.ticketPrice).toBeNull()
    const p = movieFactsPayload(f)
    expect(JSON.stringify(p)).not.toMatch(/19:45|11:25/)
    expect(p._tappy_movie_note).toMatch(/CHƯA XÁC MINH/)
  })
  it('a film not in today\'s list is flagged; no trusted page → no facts, no sources', () => {
    expect(extractMovieFacts('Trại Buôn Người', FILM, ['Út Lan 2'], NOW).showingToday).toBe(false)
    const none = extractMovieFacts('Phim Không Có', { results: [{ link: 'https://example.com/x', snippet: 'Thể loại: Hài' }] }, null, NOW)
    expect(none).toMatchObject({ genre: null, sources: [], showingToday: null })
    expect(movieQuery('Trại Buôn Người')).toBe('Trại Buôn Người lịch chiếu')
  })
})

// The REAL Serper answer to "Trại Buôn Người lịch chiếu" on 2026-10-04 at UAT time: no genre/runtime this time, the facts sit on the chains' own pages.
const FILM_UAT = { results: [
  { link: 'https://www.cgv.vn/default/trai-buon-nguoi.html', title: 'TRẠI BUÔN NGƯỜI 2026 | Thông tin - Lịch chiếu', snippet: 'TRẠI BUÔN NGƯỜI · Chi tiết · Trailer · cgv. Chăm sóc khách hàng. Hotline: 1900 6017. Giờ làm việc: 8:00 - 22:00 (Tất cả các ...' },
  { link: 'https://moveek.com/phim/trai-buon-nguoi/', title: 'Trại Buôn Người - Lịch chiếu, Mua vé, Review phim', snippet: 'Vì cứu em gái sa bẫy buôn người ở vùng biên giới, Ny (Steven Nguyễn) cùng bạn thân bị bắt làm nô dịch trong sào huyệt lừa đảo tàn bạo.' },
  { link: 'https://www.galaxycine.vn/dat-ve/trai-buon-nguoi/', title: 'Đặt vé phim Trại Buôn Người (2026)', snippet: 'Phim mới Trại Buôn Người suất chiếu sớm 24.09 (không áp dụng Movie voucher), dự kiến khởi chiếu 25.09.2026 tại các rạp chiếu phim toàn quốc.' },
  { link: 'https://cinestar.com.vn/movie/b07925ab-2c6e-489f-903d-8a376b743c12', title: 'TRẠI BUÔN NGƯỜI (T18) - Cinestar', snippet: 'Diễn viên: Steven Nguyễn, Quách Ngọc Ngoan, NSND Như Quỳnh, NSƯT Tuyết Thu, Long Điền... Khởi chiếu: 25/09/2026. NỘI DUNG PHIM. Vì cứu em gái sa bẫy buôn người ...' },
  { link: 'https://www.facebook.com/galaxycinevn/videos/1', title: 'Teaser Trailer Trại Buôn Người', snippet: 'Trại Buôn Người dự kiến khởi chiếu lễ 02.09.2026 tại Galaxy Cinema' },
] }

describe('cinema (UAT 04/10): facts from the chains\' own film pages + film pages as SYSTEM links', () => {
  it('reads age from a page title, release date, cast and the plot line; page chrome is never a synopsis; social posts never count', () => {
    const f = extractMovieFacts('Trại Buôn Người', FILM_UAT, ['Trại Buôn Người'], NOW)
    expect(f).toMatchObject({ ageRating: 'T18', releaseDate: '25/09/2026', cast: 'Steven Nguyễn, Quách Ngọc Ngoan, NSND Như Quỳnh, NSƯT Tuyết Thu, Long Điền', showingToday: true })
    expect(f.synopsis).toMatch(/^Vì cứu em gái sa bẫy buôn người/)
    expect(f.synopsis).not.toMatch(/Hotline|Đặt vé/)
    expect(f.sources.some(s => /facebook/.test(s.url))).toBe(false)
    expect(f.showtimes).toBeNull(); expect(f.ticketPrice).toBeNull()
  })
  it('film pages go through the commerce registry: CGV + Galaxy become film_links with _tappy_commerce; a non-registry page is dropped; no food limitation leaks', () => {
    const l = filmPageLinks('Trại Buôn Người', FILM_UAT, NOW)
    expect(l.film_links?.map(x => x.platform)).toEqual(['CGV', 'Galaxy Cinema'])
    expect(l.film_links?.every(x => /^https:\/\/(www\.)?(cgv|galaxycine)\.vn\//.test(x.url))).toBe(true)
    expect(l._tappy_commerce).toHaveLength(2)
    expect(JSON.stringify(l._tappy_commerce)).not.toMatch(/món|nhà hàng/)
    expect(filmPageLinks('Trại Buôn Người', { results: [{ link: 'https://evil.example/phim/trai-buon-nguoi', title: 'Trại Buôn Người' }] }, NOW)).toEqual({})
  })
  it('the stream filter shows the system links and keeps the "not verified" sentence', async () => {
    const { applyPlaceEnrichmentStreamFilter } = await import('@/lib/ai/streamEnrichment')
    const { createEnrichmentCollector } = await import('@/lib/ai/toolResultSplit')
    const result = { results: [], ...movieFactsPayload(extractMovieFacts('Trại Buôn Người', FILM_UAT, ['Trại Buôn Người'], NOW)), ...filmPageLinks('Trại Buôn Người', FILM_UAT, NOW) }
    const c = createEnrichmentCollector('coi thử Trại Buôn Người tối nay chiếu suất nào', []); c.agentMode = true
    const reply = 'Trại Buôn Người (T18) khởi chiếu 25/09/2026 và đang chiếu hôm nay. Suất chiếu theo rạp và giá vé tối nay hiện chưa xác minh được.'
    const lines = ['9:{"toolCallId":"t1","toolName":"get_movie_showtimes","args":{"movieTitle":"Trại Buôn Người"}}', `a:${JSON.stringify({ toolCallId: 't1', result })}`, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
    const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c).body).text()
    const text = raw.split('\n').filter(x => x.startsWith('0:')).map(x => JSON.parse(x.slice(2)) as string).join('')
    expect(text).toContain('chưa xác minh')
    expect(text).toContain('](https://www.cgv.vn/default/trai-buon-nguoi.html)')
  })
  it('"đang chiếu hôm nay" passes the ticket guard only when today\'s list named the film; a clock time never does', async () => {
    const { applyPlaceEnrichmentStreamFilter } = await import('@/lib/ai/streamEnrichment')
    const { createEnrichmentCollector } = await import('@/lib/ai/toolResultSplit')
    const run = async (listed: string[], reply: string) => {
      const result = { results: [], ...movieFactsPayload(extractMovieFacts('Trại Buôn Người', FILM_UAT, listed, NOW)) }
      const c = createEnrichmentCollector('coi thử Trại Buôn Người tối nay chiếu suất nào', []); c.agentMode = true
      const lines = ['9:{"toolCallId":"t1","toolName":"get_movie_showtimes","args":{"movieTitle":"Trại Buôn Người"}}', `a:${JSON.stringify({ toolCallId: 't1', result })}`, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
      const ask = 'coi thử Trại Buôn Người tối nay chiếu suất nào'
      const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, ask, true).body).text()
      return raw.split('\n').filter(x => x.startsWith('0:')).map(x => JSON.parse(x.slice(2)) as string).join('')
    }
    const s = 'Trại Buôn Người (T18) đang chiếu hôm nay. Giờ chiếu theo rạp chưa xác minh được.'
    expect(await run(['Trại Buôn Người'], s)).toContain('đang chiếu hôm nay')
    expect(await run(['Út Lan 2'], s)).not.toContain('đang chiếu hôm nay')
    expect(await run(['Trại Buôn Người'], 'Trại Buôn Người đang chiếu suất 21h tối nay. Giờ chiếu khác chưa xác minh được.')).not.toMatch(/21h/)
  })
})

describe('flight: booking hand-off only — every fare / time / status field is not verified', () => {
  it('labels: all not_verified, the exact owner sentence, booking links kept', () => {
    const r = labelFlightVerification({ fare_status: 'not_verified', booking_links: [{ name: 'Trip.com', url: 'https://vn.trip.com/x' }] }) as { _tappy_verification: Record<string, string>; booking_links: unknown[] }
    expect(r._tappy_verification).toMatchObject({ fare_for_date: 'not_verified', schedule: 'not_verified', flight_status: 'not_verified' })
    expect(r._tappy_verification.note).toContain('Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có.')
    expect(r.booking_links).toHaveLength(1)
  })
  it('even a row that looks like a fare is never labelled verified (no approved source)', () => {
    const r = labelFlightVerification({ flights: [{ price_vnd: 899000, departure_at: '2026-10-06T08:15:00+07:00' }] }) as { _tappy_verification: Record<string, string> }
    expect(r._tappy_verification.fare_for_date).toBe('not_verified')
  })
  it('getFlightPrices: no network call, no fare, approved booking links + the not-verified note', async () => {
    const { getFlightPrices } = await import('@/lib/ai/tools/travel')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await getFlightPrices('TP.HCM', 'Đà Nẵng', 'vi', '2026-10-20') as Record<string, unknown>
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    expect(r).toMatchObject({ origin: 'SGN', destination: 'DAD', depart_date: '2026-10-20', fare_status: 'not_verified' })
    expect(r.flights).toBeUndefined()
    expect(String(r.note)).toContain('Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có.')
    const hosts = (r.booking_links as Array<{ url: string }>).map(l => new URL(l.url).hostname)
    expect(hosts.length).toBeGreaterThan(0)
    expect(hosts.every(h => /(^|\.)(trip\.com|traveloka\.com)$/.test(h))).toBe(true)
  })
})

describe('follow-up state: flight / movie / plan context is stored and shown as DATA', () => {
  const events = (list: Array<[string, Record<string, unknown>]>) => list.map(([name, args], i) => ({ round: i, name, args, why: null, ms: 1, outcome: 'ok' as const }))
  it('derived from executed tool calls (flight, film, plan only when a plan was written)', () => {
    const run = { toolEvents: events([['get_hotel_prices', { location: 'Đà Nẵng' }], ['get_flight_prices', { origin: 'TP.HCM', destination: 'Đà Nẵng', departDate: '2026-10-06', passengers: 2 }], ['get_movie_showtimes', { movieTitle: 'Trại Buôn Người', date: '2026-10-04' }]]), text: 'Lịch… [TAPPY_PLAN]{}[/TAPPY_PLAN]' }
    const p = statePatchFrom(run, new Map([['1:get_flight_prices', { booking_links: [{ name: 'Trip.com', url: 'https://vn.trip.com/x' }, { name: 'Traveloka', url: 'https://www.traveloka.com/y' }] }]]), NOW)
    expect(p.flight).toMatchObject({ origin: 'TP.HCM', destination: 'Đà Nẵng', departDate: '2026-10-06', passengers: 2, sources: ['Trip.com', 'Traveloka'], lastVerifiedAt: null })
    expect(p.movie).toMatchObject({ title: 'Trại Buôn Người', date: '2026-10-04' })
    expect(p.plan).toMatchObject({ destination: 'Đà Nẵng' })
    expect(statePatchFrom({ ...run, text: 'không có kế hoạch' }, new Map(), NOW).plan).toBeUndefined()
  })
  it('persisted across turns and shown in the DATA block with the "do not rebuild" line', () => {
    const s1 = nextChatSessionState(null, { agentState: { flight: { origin: 'TP.HCM', destination: 'Đà Nẵng', departDate: '2026-10-06', sources: ['Trip.com'], lastVerifiedAt: null, at: NOW.toISOString() }, plan: { destination: 'Đà Nẵng', at: NOW.toISOString() } } })
    const s2 = nextChatSessionState(s1, {})
    expect(s2.flight?.destination).toBe('Đà Nẵng')
    const lines = followUpContextLines(s2)
    expect(lines[0]).toMatch(/Chuyến bay đang bàn: TP\.HCM → Đà Nẵng, đi 06\/10\/2026 .*link đã đưa: Trip\.com .*giá vé \/ giờ bay \/ trạng thái chuyến: chưa xác minh/)
    expect(lines[1]).toMatch(/Kế hoạch đã lập: Đà Nẵng .*KHÔNG lập lại/)
    const ctx = agentContext({ now: NOW, userText: 'giá vé bao nhiêu?', lang: 'vi', gps: true, state: { extra: lines } })
    expect(ctx.data).toContain('Chuyến bay đang bàn')
    expect(ctx.system).not.toContain('Chuyến bay đang bàn')
  })
})

import { tripDataTool, TRIP_PART_CREDITS } from './index'
import { withSerperToolBudget, admitWithinToolBudget } from '@/lib/ai/tools/serperToolBudget'
describe('CP4 — travel bundle: one agent call, three parallel parts, each capped, frames as the original tools', () => {
  it('runs hotels / sights / food concurrently, each under its own Serper cap, emitting each part as its own tool frame', async () => {
    const started: string[] = []
    const part = (label: string) => ({ execute: async (a: Record<string, unknown>) => { started.push(label); let n = 0; for (let i = 0; i < 6; i++) if (admitWithinToolBudget(1)) n++; await new Promise(r => setTimeout(r, 10)); return { results: [{ name: `${label} 1` }], admitted: n, args: a } } })
    const hotels = part('hotel'), places = part('place')
    const frames: Array<[string, Record<string, unknown>]> = []
    const t = tripDataTool({ get_hotel_prices: hotels, search_places: places } as never, (name, args) => frames.push([name, args])) as unknown as { execute: (a: unknown) => Promise<Record<string, { admitted: number }>> }
    const wrapped = await withSerperToolBudget(TRIP_PART_CREDITS * 3, () => t.execute({ destination: 'Đà Nẵng', interests: 'hải sản' }))
    expect(started).toHaveLength(3)
    expect([wrapped.value.hotels.admitted, wrapped.value.attractions.admitted, wrapped.value.food.admitted]).toEqual([3, 3, 3])
    expect(wrapped.spent).toBe(9)
    expect(frames.map(f => f[0])).toEqual(expect.arrayContaining(['get_hotel_prices', 'search_places']))
    expect(frames.find(f => f[0] === 'search_places' && String(f[1].query).includes('hải sản'))).toBeTruthy()
  })
})

describe('flight follow-up after the provider removal: what the user sees', () => {
  const run = async (reply: string) => {
    const { applyPlaceEnrichmentStreamFilter } = await import('@/lib/ai/streamEnrichment')
    const { createEnrichmentCollector } = await import('@/lib/ai/toolResultSplit')
    const { getFlightPrices } = await import('@/lib/ai/tools/travel')
    const r = labelFlightVerification(await getFlightPrices('TP.HCM', 'Đà Nẵng', 'vi', '2026-10-20'))
    const c = createEnrichmentCollector('giá vé bao nhiêu?', ['lập kế hoạch đi Đà Nẵng 3 ngày 2 đêm cho 2 người']); c.agentMode = true
    const lines = ['9:{"toolCallId":"f1","toolName":"get_flight_prices","args":{"origin":"TP.HCM","destination":"Đà Nẵng"}}', `a:${JSON.stringify({ toolCallId: 'f1', result: r })}`, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
    const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c).body).text()
    return raw.split('\n').filter(x => x.startsWith('0:')).map(x => JSON.parse(x.slice(2)) as string).join('')
  }
  // The booking links themselves reach the user through the route's commerce attach (`_tappy_commerce` → "Liên kết chính thức"), UAT-verified.
  it('a reply that never says "not verified" gets the owner sentence first; no fare is composed', async () => {
    const out = await run('Bạn có thể xem giá theo ngày tại các nút bên dưới.')
    expect(out.startsWith('Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có.')).toBe(true)
    expect(out).not.toMatch(/\d{3}\.\d{3}\s*(đ|₫|VND)/)
  })
  it('"giờ bay … chưa xác minh" alone does not count — the fare itself must be said to be unverified', async () => {
    const out = await run('Bạn có thể xem giá theo ngày ở nút bên dưới; giờ bay và tình trạng chuyến cũng chưa xác minh.')
    expect(out.startsWith('Giá vé hiện chưa xác minh được từ nguồn dữ liệu đang có.')).toBe(true)
  })
  it('a reply that already says it in its own words is left as written (no duplicate)', async () => {
    const out = await run('Giá vé khứ hồi chưa xác minh được; bạn xem ở nút bên dưới.')
    expect(out.startsWith('Giá vé khứ hồi chưa xác minh được')).toBe(true)
    expect(out.match(/chưa xác minh/g)).toHaveLength(1)
  })
  it('the follow-up instruction: only get_flight_prices, never the plan tools', () => {
    expect(AGENT_SYSTEM_TEXT).toMatch(/Câu hỏi tiếp về chuyến bay đang bàn[^\n]*CHỈ gọi get_flight_prices[^\n]*KHÔNG tìm lại khách sạn, địa điểm, quán ăn, KHÔNG viết lại kế hoạch/)
  })
})
