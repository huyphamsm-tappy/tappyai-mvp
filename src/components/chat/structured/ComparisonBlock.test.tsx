// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ComparisonBlock, { selectAttributes, MAX_ENTITIES, MAX_ATTRIBUTES } from './ComparisonBlock'
import type { ComparisonEntity, ComparisonAttribute } from './ComparisonBlock'

// This project does not enable vitest `globals`, so RTL's auto-cleanup never registers.
afterEach(cleanup)

// P4-03 — ComparisonBlock (DD-005). The rules under test are the ones the approved design fixes:
// caps at 4 entities / 6 differing attributes, identical rows collapsed, unknown rendered as
// unknown, and a recommendation that always carries a reason.

const ATTRS: ComparisonAttribute[] = [
  { key: 'price', label: 'Giá' },
  { key: 'distance', label: 'Khoảng cách' },
  { key: 'rating', label: 'Đánh giá' },
  { key: 'booking', label: 'Đặt bàn' },
]

function entity(key: string, label: string, values: Record<string, string | null>): ComparisonEntity {
  return { key, label, values }
}

const THREE: ComparisonEntity[] = [
  entity('a', 'Nhà hàng A', { price: '400–600k', distance: '1.2 km', rating: '4.6', booking: 'Có' }),
  entity('b', 'Nhà hàng B', { price: '350–500k', distance: '2.8 km', rating: '4.2', booking: 'Không' }),
  entity('c', 'Nhà hàng C', { price: null, distance: '0.9 km', rating: '4.8', booking: 'Có' }),
]

describe('selectAttributes — the only judgement the component makes', () => {
  it('drops an attribute no entity has a value for', () => {
    const entities = [entity('a', 'A', { price: '1' }), entity('b', 'B', { price: '2' })]
    const attrs = [...ATTRS, { key: 'wifi', label: 'Wifi' }]
    const { differing, identical } = selectAttributes(entities, attrs)
    const keys = [...differing, ...identical].map(a => a.key)
    expect(keys, 'an attribute nobody has says nothing about anything').not.toContain('wifi')
  })

  it('separates rows that are identical for every entity from rows that differ', () => {
    const entities = [
      entity('a', 'A', { price: '100k', booking: 'Có' }),
      entity('b', 'B', { price: '200k', booking: 'Có' }),
    ]
    const { differing, identical } = selectAttributes(entities, ATTRS)
    expect(differing.map(a => a.key)).toEqual(['price'])
    expect(identical.map(a => a.key)).toEqual(['booking'])
  })

  it('treats a partially-unknown attribute as differing, not identical', () => {
    // B's value is unknown, so we cannot claim the row is "the same for all" — that would be a
    // claim the data does not support.
    const entities = [
      entity('a', 'A', { booking: 'Có' }),
      entity('b', 'B', { booking: null }),
    ]
    const { differing, identical } = selectAttributes(entities, ATTRS)
    expect(differing.map(a => a.key)).toEqual(['booking'])
    expect(identical).toHaveLength(0)
  })

  it(`caps differing rows at ${MAX_ATTRIBUTES}`, () => {
    const many: ComparisonAttribute[] = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, label: `K${i}` }))
    const entities = [
      entity('a', 'A', Object.fromEntries(many.map((m, i) => [m.key, `a${i}`]))),
      entity('b', 'B', Object.fromEntries(many.map((m, i) => [m.key, `b${i}`]))),
    ]
    expect(selectAttributes(entities, many).differing).toHaveLength(MAX_ATTRIBUTES)
  })
})

describe('ComparisonBlock', () => {
  it('is not offered below two entities', () => {
    const { container } = render(
      <ComparisonBlock entities={[THREE[0]]} attributes={ATTRS} collapsible={false} />,
    )
    expect(container.firstChild, 'one option is not a comparison').toBeNull()
  })

  it(`renders at most ${MAX_ENTITIES} entities`, () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      entity(`e${i}`, `Option ${i}`, { price: `${i}00k` }),
    )
    render(<ComparisonBlock entities={five} attributes={ATTRS} collapsible={false} />)
    expect(screen.queryByText('Option 4')).toBeNull()
    expect(screen.getByText('Option 3')).toBeTruthy()
  })

  it('renders an unknown value as an explicit unknown, never blank', () => {
    render(<ComparisonBlock entities={THREE} attributes={ATTRS} collapsible={false} />)
    // Nhà hàng C has no price. The cell must SAY so.
    const cells = screen.getAllByText(/chưa rõ|unknown/i)
    expect(cells.length, 'a missing value must be stated, not left blank').toBeGreaterThan(0)
  })

  it('shows the recommendation badge and its reason together', () => {
    render(
      <ComparisonBlock
        entities={THREE}
        attributes={ATTRS}
        recommendedKey="a"
        reason="khớp khoảng giá, còn bàn tối nay"
        collapsible={false}
      />,
    )
    expect(screen.getByTestId('comparison-recommended-badge')).toBeTruthy()
    expect(screen.getByTestId('comparison-reason').textContent).toContain('khớp khoảng giá')
  })

  it('does not render a reason block when the backend gave no recommendation', () => {
    render(<ComparisonBlock entities={THREE} attributes={ATTRS} collapsible={false} />)
    expect(screen.queryByTestId('comparison-reason')).toBeNull()
    expect(screen.queryByTestId('comparison-recommended-badge')).toBeNull()
  })

  it('collapses to a single control and expands on click', () => {
    render(<ComparisonBlock entities={THREE} attributes={ATTRS} />)
    expect(screen.queryByTestId('comparison-block')).toBeNull()
    fireEvent.click(screen.getByTestId('comparison-expand'))
    expect(screen.getByTestId('comparison-block')).toBeTruthy()
  })

  it('uses real table semantics with associated headers', () => {
    render(<ComparisonBlock entities={THREE} attributes={ATTRS} collapsible={false} />)
    const table = screen.getByTestId('comparison-block').querySelector('table')
    expect(table, 'a comparison is a table, not a grid of divs').toBeTruthy()
    expect(table!.querySelectorAll('th[scope="col"]').length).toBe(THREE.length + 1)
    expect(table!.querySelectorAll('th[scope="row"]').length).toBeGreaterThan(0)
  })

  it('keeps wide content inside its own horizontal scroller', () => {
    render(<ComparisonBlock entities={THREE} attributes={ATTRS} collapsible={false} />)
    const scroller = screen.getByTestId('comparison-block').querySelector('.overflow-x-auto')
    expect(scroller, 'the page must never scroll sideways because of a comparison').toBeTruthy()
  })

  it('invokes the entity action rather than deciding anything itself', () => {
    const onClick = vi.fn()
    const entities = [
      { ...THREE[0], action: { label: 'Đặt bàn A', onClick } },
      THREE[1],
    ]
    render(<ComparisonBlock entities={entities} attributes={ATTRS} recommendedKey="a" collapsible={false} />)
    fireEvent.click(screen.getByText('Đặt bàn A'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
