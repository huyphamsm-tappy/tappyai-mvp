// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import EntityCard, { RecommendationCard } from './EntityCard'

// P4-16 — EntityCard is V3 FOUNDATION: the shape a future product or merchant entity will reuse.
// The tests that matter are the honesty rules and the action limits, because those are what a
// later commerce variant would be tempted to relax.

afterEach(cleanup)

describe('EntityCard — honesty', () => {
  it('renders an explicit unknown when there is no price', () => {
    render(<EntityCard title="Nhà hàng A" />)
    // Not blank, not "0đ", not omitted — the card SAYS the price is unknown.
    expect(screen.getByText(/chưa rõ|unknown/i)).toBeTruthy()
  })

  it('collapses a missing image rather than showing a placeholder box', () => {
    const { container } = render(<EntityCard title="Nhà hàng A" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('drops absent metadata entries instead of rendering empty separators', () => {
    render(<EntityCard title="A" metadata={['1.2 km', null, undefined, '']} />)
    const meta = screen.getByText(/1\.2 km/)
    expect(meta.textContent).toBe('1.2 km')
    expect(meta.textContent).not.toContain('·')
  })

  it('caps metadata at three items', () => {
    render(<EntityCard title="A" metadata={['a', 'b', 'c', 'd', 'e']} />)
    const meta = screen.getByText(/a · b · c/)
    expect(meta.textContent).not.toContain('d')
  })

  it('never formats money itself — it renders exactly what it was given', () => {
    render(<EntityCard title="A" price="400–600k" />)
    expect(screen.getByText('400–600k')).toBeTruthy()
  })
})

describe('EntityCard — actions', () => {
  it('supports exactly one primary and one secondary action', () => {
    const primary = vi.fn()
    const secondary = vi.fn()
    render(
      <EntityCard
        title="A"
        primaryAction={{ label: 'Đặt bàn', onClick: primary }}
        secondaryAction={{ label: 'Xem bản đồ', onClick: secondary }}
      />,
    )
    fireEvent.click(screen.getByText('Đặt bàn'))
    fireEvent.click(screen.getByText('Xem bản đồ'))
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).toHaveBeenCalledOnce()
  })

  it('marks an external destination as leaving the app', () => {
    render(<EntityCard title="A" primaryAction={{ label: 'Mở', href: 'https://x.example', external: true }} />)
    const link = screen.getByText('Mở')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('keeps internal navigation in the same tab', () => {
    render(<EntityCard title="A" primaryAction={{ label: 'Đặt', href: '/service/1' }} />)
    expect(screen.getByText('Đặt').getAttribute('target')).toBeNull()
  })

  it('meets the 44px touch-target minimum', () => {
    render(<EntityCard title="A" primaryAction={{ label: 'Đặt bàn', onClick: vi.fn() }} />)
    expect(screen.getByText('Đặt bàn').className).toContain('min-h-[44px]')
  })

  it('renders no action bar when the backend supplied no action', () => {
    const { container } = render(<EntityCard title="A" />)
    expect(container.querySelectorAll('button, a')).toHaveLength(0)
  })
})

describe('EntityCard — entity-agnostic (DD-013)', () => {
  it('defaults to the place variant V3 actually renders', () => {
    render(<EntityCard title="A" />)
    expect(screen.getByTestId('entity-card').getAttribute('data-variant')).toBe('place')
  })

  it('accepts the future variants without behaving differently', () => {
    const { rerender } = render(<EntityCard title="A" variant="product" price="1" />)
    const product = screen.getByTestId('entity-card').innerHTML
    rerender(<EntityCard title="A" variant="merchant" price="1" />)
    const merchant = screen.getByTestId('entity-card').innerHTML
    // The variant is a label today, not a behaviour — commerce is FUTURE.
    expect(product).toBe(merchant)
  })

  it('carries no commerce vocabulary or affordance', () => {
    const { container } = render(<EntityCard title="A" variant="product" primaryAction={{ label: 'Xem', href: '/x' }} />)
    const html = container.innerHTML.toLowerCase()
    for (const forbidden of ['cart', 'checkout', 'basket', 'add-to-cart', 'quantity']) {
      expect(html, 'commerce is FUTURE — no cart or checkout affordance may appear').not.toContain(forbidden)
    }
  })
})

describe('RecommendationCard', () => {
  it('is the place variant, highlighted by default', () => {
    render(<RecommendationCard title="Nhà hàng A" match="khop" />)
    const card = screen.getByTestId('entity-card')
    expect(card.getAttribute('data-variant')).toBe('place')
    expect(card.className).toContain('primary')
  })

  it('shows a match verdict rather than a numeric confidence', () => {
    const { container } = render(<RecommendationCard title="A" match="khop" />)
    expect(container.textContent).not.toMatch(/\d+\s*%/)
  })
})
