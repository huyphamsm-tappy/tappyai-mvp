import { describe, it, expect } from 'vitest'
import { filmQueries, titlesFromSnippet, extractFilmEvidence, filmEvidencePayload, asOfLabel, FILM_ENOUGH } from './filmSearch'

// The snippets are the REAL Serper answer to "phim đang chiếu hôm nay moveek" (2026-10-04), trimmed to the fields the route reads.
const REAL = {
  results: [
    { title: 'Phim đang chiếu rạp | Lịch chiếu, Trailer', link: 'https://moveek.com/dang-chieu/', snippet: 'Trại Buôn Người · Quyết Cua Anh Này · Trái Tim Quái Thú · Scotty Giải Cứu Hoàng Thượng · Út Lan 2 · Avengers: Hồi Kết - Phiên Bản Đặc Biệt · Thần Sư Chung Quỳ: Linh ...' },
    { title: 'Lịch chiếu phim rạp', link: 'https://moveek.com/lich-chieu/', snippet: 'Lịch chiếu · Trại Buôn Người · Quyết Cua Anh Này · Avengers: Hồi Kết - Phiên Bản Đặc Biệt · Út Lan 2 · Lên Hương · Hòn Đảo Quên Lãng · Vùng Đất Quỷ Dữ 2026 · Pháo Hoa ...' },
    { title: 'Think Movies, Go Moveek', link: 'https://moveek.com/', snippet: 'Review Quyết Cua Anh Này - Một bản remake duyên dáng, hài hước và đậm chất Thái · Avengers: Hồi Kết (Phiên Bản Đặc Biệt) - Coi để chuẩn bị cho Avengers: Doomsday.' },
    { title: 'Phim sắp chiếu', link: 'https://moveek.com/sap-chieu/', snippet: 'Án Mạng Xém Hoàn Hảo. 09/10. Blue Lock: Cuộc Chiến Của Những Tiền Đạo. 09/10.' },
    { title: 'Lịch phim Việt Nam 2026', link: 'https://moveek.com/phim-viet-nam/', snippet: 'Ai Thương Ai Mến · Con Kể Ba Nghe · Running Man Việt Nam Mùa 3: Con Rối Tự Do' },
    { title: 'Moveek', link: 'https://www.facebook.com/moveekvn/', snippet: 'Mua vé xem phim - Lịch chiếu tất cả rạp toàn quốc' },
    { title: 'Mua vé', link: 'https://moveek.com/mua-ve/', snippet: 'Mua vé theo phim ; Trại Buôn Người · 25/09 ; Scotty Giải Cứu Hoàng Thượng · 02/10 ; Quyết Cua Anh Này · 02/10 ; Trái Tim Quái Thú · 02/10' },
  ],
}
const NOW = new Date('2026-10-04T05:00:00Z')

describe('film information task — query rewrite', () => {
  it('rewrites the question into a fixed, dated query and keeps a second one for the budget fallback', () => {
    const [a, b] = filmQueries('tối nay có phim gì đang chiếu không', NOW)
    expect(a).toBe('phim đang chiếu hôm nay moveek')
    expect(b).toBe('phim chiếu rạp 04/10 lịch chiếu')
    expect(filmQueries('có phim gì sắp chiếu', NOW)[0]).toContain('sắp chiếu')
  })
  it('labels "as of" with the GMT+7 weekday and date', () => { expect(asOfLabel(NOW)).toBe('Chủ nhật, 04/10/2026') })
})

describe('film information task — evidence extraction', () => {
  it('reads titles from the now-showing listings of trusted sources, de-duplicated, with provenance', () => {
    const ev = extractFilmEvidence(REAL, NOW)
    expect(ev.titles).toEqual(expect.arrayContaining(['Trại Buôn Người', 'Quyết Cua Anh Này', 'Trái Tim Quái Thú', 'Scotty Giải Cứu Hoàng Thượng', 'Út Lan 2', 'Lên Hương', 'Hòn Đảo Quên Lãng', 'Vùng Đất Quỷ Dữ 2026']))
    expect(new Set(ev.titles.map(t => t.toLowerCase())).size).toBe(ev.titles.length)
    expect(ev.titles.length).toBeGreaterThanOrEqual(FILM_ENOUGH)
    expect(ev.sources[0]).toEqual({ host: 'moveek.com', url: 'https://moveek.com/dang-chieu/' })
    expect(ev.asOf).toBe('Chủ nhật, 04/10/2026')
  })
  it('drops cut-off titles, navigation words, coming-soon / Vietnamese-calendar pages and untrusted hosts', () => {
    const ev = extractFilmEvidence(REAL, NOW)
    expect(ev.titles.some(t => /Thần Sư Chung Quỳ: Linh$/.test(t))).toBe(false) // snippet cut by the engine
    expect(ev.titles).not.toContain('Lịch chiếu')
    expect(ev.titles).not.toContain('Án Mạng Xém Hoàn Hảo') // sap-chieu page
    expect(ev.titles).not.toContain('Ai Thương Ai Mến') // phim-viet-nam page = a catalogue, not "now"
    expect(ev.sources.some(s => /facebook/.test(s.host))).toBe(false)
  })
  it('a trailing release date is not part of the title', () => {
    expect(titlesFromSnippet('Trại Buôn Người · 25/09 ; Scotty Giải Cứu Hoàng Thượng · 02/10')).toEqual(['Trại Buôn Người', 'Scotty Giải Cứu Hoàng Thượng'])
  })
  it('no trusted listing → no titles, and the payload says so instead of inviting a guess', () => {
    const ev = extractFilmEvidence({ results: [{ link: 'https://example.com/x', snippet: 'A · B · C · D · E' }] }, NOW)
    expect(ev.titles).toEqual([])
    const p = filmEvidencePayload(ev)
    expect(JSON.stringify(p)).toContain('KHONG lay duoc')
    expect(extractFilmEvidence(null, NOW).titles).toEqual([])
  })
  it('the payload lets the model name only the extracted titles and never a showtime, price or rating', () => {
    const p = filmEvidencePayload(extractFilmEvidence(REAL, NOW)) as { _tappy_films: { titles: string[] }; _tappy_films_note: string }
    expect(p._tappy_films.titles.length).toBeGreaterThan(5)
    expect(p._tappy_films_note).toMatch(/CHI duoc nhac ten phim/)
    expect(p._tappy_films_note).toMatch(/KHONG neu suat chieu, gia ve/)
  })
})
