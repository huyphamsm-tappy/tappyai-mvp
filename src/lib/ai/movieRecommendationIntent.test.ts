import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectMovieRecommendationIntent } from './intent'

// ── Entertainment intent routing ────────────────────────────────────────────
//
// "Recommend me a movie" must be answered from film knowledge, NOT routed to the
// place search (which returns cinemas). A cinema / showtime / ticket ask keeps
// the place tool. Production-shaped phrasings.

describe('detectMovieRecommendationIntent — recommendation vs venue', () => {
  it('1. "phim nhẹ nhàng đáng xem" → recommendation (no place search)', () => {
    expect(detectMovieRecommendationIntent('Tối nay tôi muốn xem một bộ phim nhẹ nhàng, đáng xem')).toBe(true)
  })

  it('2. "phim hành động nào hay?" → recommendation (no place search)', () => {
    expect(detectMovieRecommendationIntent('Phim hành động nào hay?')).toBe(true)
    expect(detectMovieRecommendationIntent('Gợi ý cho mình vài bộ phim tình cảm hay đi')).toBe(true)
    expect(detectMovieRecommendationIntent('Tối nay xem phim gì bây giờ?')).toBe(true)
  })

  it('3. "rạp nào gần Q1 đang chiếu phim X?" → NOT recommendation (place/showtime search)', () => {
    expect(detectMovieRecommendationIntent('Rạp nào gần Quận 1 đang chiếu phim Inside Out 2?')).toBe(false)
  })

  it('4. "phim nào hay tối nay VÀ rạp nào gần tôi?" → venue present → keep the place tool', () => {
    // A venue/showtime cue always wins, so the place tool is NOT dropped; the
    // model can recommend AND search for the cinema in the same turn.
    expect(detectMovieRecommendationIntent('Phim nào hay tối nay và rạp nào gần tôi?')).toBe(false)
  })

  it('venue/ticket asks are never a recommendation route', () => {
    expect(detectMovieRecommendationIntent('Đặt vé xem phim ở CGV Vincom')).toBe(false)
    expect(detectMovieRecommendationIntent('Lịch chiếu phim tối nay ở rạp gần đây')).toBe(false)
    expect(detectMovieRecommendationIntent('Giá vé xem phim bao nhiêu?')).toBe(false)
  })

  it('non-movie turns are never a movie recommendation', () => {
    expect(detectMovieRecommendationIntent('Tìm quán bún bò Huế ngon ở Phú Nhuận')).toBe(false)
    expect(detectMovieRecommendationIntent('Tôi cần massage thư giãn gần Quận 1')).toBe(false)
    expect(detectMovieRecommendationIntent('Tư vấn mua MacBook Pro M1')).toBe(false)
    expect(detectMovieRecommendationIntent('')).toBe(false)
  })

  it('a movie word alone (no recommendation cue) does not trigger the route', () => {
    // "phim" mentioned but the ask is not "suggest what to watch".
    expect(detectMovieRecommendationIntent('Phim này dài bao nhiêu phút?')).toBe(false)
  })
})

describe('the route drops search_places for a movie recommendation turn', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  it('computes the intent and gates search_places on it', () => {
    expect(route).toContain('detectMovieRecommendationIntent(lastText)')
    // search_places is included only when NOT a movie-recommendation turn.
    expect(route).toMatch(/movieRecommend \? \{\} : \{ search_places: tool\(/)
  })
  it('adds a grounded movie block instead of inventing showtimes/platforms', () => {
    expect(route).toContain('GOI Y PHIM (KHONG PHAI TIM RAP)')
  })
})
