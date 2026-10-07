// @vitest-environment jsdom
// Design D:\redesign Sep 22 01_41_30 — the recommendation card shows the place's photo, address, rating
// and recent activity, from the place's own community reviews; a chip only for data that exists.
import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { RecPhoto, RecFacts, isRecentlyActive } from './RecPlaceDetails'

describe('RecPlaceDetails', () => {
  it('a photo renders as the tile; without one, the pin tile — the rank badge either way', () => {
    const { container, rerender } = render(<RecPhoto photoUrl="https://storage.googleapis.com/b/p.jpg" rank={1} />)
    expect(container.querySelector('[data-rec-photo]')?.getAttribute('src')).toBe('https://storage.googleapis.com/b/p.jpg')
    expect(container.textContent).toContain('1')
    rerender(<RecPhoto photoUrl={null} rank={2} />)
    expect(container.querySelector('[data-rec-photo]')).toBeNull()
    expect(container.textContent).toContain('2')
  })
  it('a photo that fails to load falls back to the pin tile', () => {
    const { container } = render(<RecPhoto photoUrl="https://x.example/dead.jpg" rank={3} />)
    fireEvent.error(container.querySelector('[data-rec-photo]')!)
    expect(container.querySelector('[data-rec-photo]')).toBeNull()
    expect(container.textContent).toContain('3')
  })
  it('address, rating, recently active and review count — each only when the data exists', () => {
    const recent = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
    const { container, rerender } = render(<RecFacts facts={{ address: '12 Nguyễn Văn Cừ, Quận 1', averageRating: 4.66, reviewCount: 3, latestReviewAt: recent }} />)
    expect(container.querySelector('[data-rec-address]')?.textContent).toContain('12 Nguyễn Văn Cừ')
    expect(container.querySelector('[data-rec-rating]')?.textContent).toContain('4.7')
    expect(container.querySelector('[data-rec-recent]')).not.toBeNull()
    expect(container.querySelector('[data-rec-reviews]')).not.toBeNull()
    rerender(<RecFacts facts={{}} />)
    expect(container.querySelector('[data-rec-facts]')).toBeNull()
    expect(container.querySelector('[data-rec-address]')).toBeNull()
  })
  it('"recently active" means a review in the last 14 days', () => {
    const now = Date.parse('2026-09-28T00:00:00Z')
    expect(isRecentlyActive('2026-09-20T00:00:00Z', now)).toBe(true)
    expect(isRecentlyActive('2026-09-01T00:00:00Z', now)).toBe(false)
    expect(isRecentlyActive(null, now)).toBe(false)
  })
})
