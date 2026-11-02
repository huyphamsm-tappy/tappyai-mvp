import { describe, it, expect } from 'vitest'
import { wantsFilmTitles, movieTitlesReply, NOW_SHOWING_LINKS } from './movieTitles'

describe('(b) «Tối nay có phim gì hay» is a question about FILMS', () => {
  it.each(['Tối nay có phim gì hay', 'tối nay có phim gì hay ở quận 1', 'Phim hành động nào hay?', 'Tui hỏi phim mà có hỏi rạp đâu', 'có phim nào đang chiếu hay không'])('%s', t => {
    expect(wantsFilmTitles(t)).toBe(true)
  })
  it.each(['Rạp nào gần Quận 1 đang chiếu Inside Out 2', 'lịch chiếu phim Mai ở CGV', 'mua vé xem phim ở đâu', 'tìm rạp chiếu phim gần đây', 'quán ăn ngon quận 1'])('%s stays a venue/other question', t => {
    expect(wantsFilmTitles(t)).toBe(false)
  })
  it('the reply names no film, links only the cinemas’ own pages, never a showtime', () => {
    const r = movieTitlesReply('vi')
    for (const l of NOW_SHOWING_LINKS) { expect(r).toContain(l.url); expect(l.url).toMatch(/^https:\/\//) }
    expect(r).toMatch(/chưa có danh sách phim đang chiếu đã kiểm chứng/)
    expect(r).not.toMatch(/\b\d{1,2}[:h]\d{2}\b/)
  })
})
