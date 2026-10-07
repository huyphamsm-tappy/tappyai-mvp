import { describe, it, expect } from 'vitest'
import { nowShowingLinks } from './agentTools'
import { CINEMA_NOW_SHOWING_PAGES } from '@/lib/ccp/adapters/nowShowing'

describe('get_now_showing — cinema CTA', () => {
  it('carries one link per cinema chain, from the CCP pages, labelled as a page to pick cinema and showtime (no showtime/price claim)', () => {
    const r = nowShowingLinks('vi')
    expect(r.film_links.map(l => l.url)).toEqual(CINEMA_NOW_SHOWING_PAGES.map(p => p.url))
    expect(r.film_links.map(l => l.platform)).toEqual(['CGV', 'Galaxy Cinema', 'Lotte Cinema', 'BHD Star', 'Beta Cinemas'])
    for (const l of r.film_links) {
      expect(l.url).toMatch(/^https:\/\//)
      expect(l.name).toBe('Xem lịch chiếu / đặt vé')
      expect(l.name).not.toMatch(/\d{1,2}[h:]\d{2}|vnđ|đ\b|ghế/i)
    }
  })
  it('the commerce marker is an empty array (system appends the links itself) and English is labelled', () => {
    expect(nowShowingLinks('vi')._tappy_commerce).toEqual([])
    expect(nowShowingLinks('en').film_links[0].name).toBe('Showtimes / tickets')
  })
})
