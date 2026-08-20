// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BusinessKpis } from './BusinessKpis'
import { vi as viStrings, en as enStrings } from '@/lib/i18n/admin'
import type { HomeKpis } from '@/lib/admin/analytics/homeSnapshotService'

// Module 01 Home Dashboard — the KPI block's surface.
//
// The assertions that matter are the ones separating states that LOOK the same:
// an empty pipeline from a genuine zero day, and a stale number from a fresh
// one. Rendering only numbers collapses both distinctions, and an operator
// cannot recover them by looking harder.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
afterEach(cleanup)

const T = enStrings

const kpis = (over: Partial<HomeKpis> = {}): HomeKpis => ({
  status: 'ok',
  snapshotDate: '2026-08-20',
  isFinal: false,
  ageDays: 0,
  kpis: [
    { key: 'dau', value: 25, deltaVsPrevious: 5 },
    { key: 'wau', value: 60, deltaVsPrevious: null },
    { key: 'mau', value: 90, deltaVsPrevious: -3 },
    { key: 'new_users', value: 4, deltaVsPrevious: 0 },
    { key: 'returning_users', value: 21, deltaVsPrevious: 2 },
    { key: 'total_users', value: 100, deltaVsPrevious: 4 },
  ],
  ...over,
})

describe('an empty pipeline is not a zero day', () => {
  it('renders the empty explanation, and NO numbers', () => {
    render(<BusinessKpis kpis={kpis({ status: 'empty', kpis: [], snapshotDate: null, ageDays: null })} />)
    expect(screen.getByText(T['admin.home.kpi.empty'])).toBeDefined()
    // The failure this guards: a grid of `0` cards, which reads as a measurement.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('a real zero day DOES render its zero', () => {
    render(<BusinessKpis kpis={kpis({ kpis: [{ key: 'dau', value: 0, deltaVsPrevious: null }] })} />)
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.queryByText(T['admin.home.kpi.empty'])).toBeNull()
  })
})

describe('stale data says so, and still shows its numbers', () => {
  it('marks stale and keeps the values visible', () => {
    render(<BusinessKpis kpis={kpis({ status: 'stale', ageDays: 9 })} />)
    // Hiding a stale number is indistinguishable from a broken page.
    expect(screen.getByText('25')).toBeDefined()
    expect(screen.getByText(/data is stale/)).toBeDefined()
    expect(screen.getByText(/9d/)).toBeDefined()
  })

  it('a fresh snapshot carries no stale marker', () => {
    render(<BusinessKpis kpis={kpis({ status: 'ok' })} />)
    expect(screen.queryByText(/data is stale/)).toBeNull()
  })
})

describe('provisional rows are marked — 04 §7A', () => {
  it('shows the provisional note while the day may still change', () => {
    render(<BusinessKpis kpis={kpis({ isFinal: false })} />)
    expect(screen.getByText(T['admin.home.kpi.provisional'])).toBeDefined()
  })

  it('drops it once the day is final', () => {
    render(<BusinessKpis kpis={kpis({ isFinal: true })} />)
    expect(screen.queryByText(T['admin.home.kpi.provisional'])).toBeNull()
  })

  it('never claims provisional on an empty block — there is nothing to qualify', () => {
    render(<BusinessKpis kpis={kpis({ status: 'empty', kpis: [], isFinal: false })} />)
    expect(screen.queryByText(T['admin.home.kpi.provisional'])).toBeNull()
  })
})

describe('a trend needs a comparison', () => {
  it('renders no-comparison rather than a fabricated change', () => {
    render(<BusinessKpis kpis={kpis()} />)
    expect(screen.getByText(T['admin.home.kpi.noTrend'])).toBeDefined()
  })

  it('signs the delta in TEXT, not by colour alone (WCAG)', () => {
    render(<BusinessKpis kpis={kpis()} />)
    expect(screen.getByText('+5')).toBeDefined()
    expect(screen.getByText('-3')).toBeDefined()
    expect(screen.getByText('±0')).toBeDefined()
  })
})

describe('the error state is distinct from empty', () => {
  it('says the table was unreachable, not that there is no data', () => {
    render(<BusinessKpis kpis={kpis({ status: 'error', kpis: [] })} />)
    expect(screen.getByText(T['admin.home.kpi.error'])).toBeDefined()
    expect(screen.queryByText(T['admin.home.kpi.empty'])).toBeNull()
  })
})

describe('§8 — no raw strings', () => {
  const KEYS = [
    'admin.home.kpi.section', 'admin.home.kpi.asOf', 'admin.home.kpi.provisional',
    'admin.home.kpi.stale', 'admin.home.kpi.noTrend', 'admin.home.kpi.empty',
    'admin.home.kpi.error', 'admin.home.kpi.dau', 'admin.home.kpi.wau',
    'admin.home.kpi.mau', 'admin.home.kpi.new_users', 'admin.home.kpi.returning_users',
    'admin.home.kpi.total_users',
  ]

  it.each(KEYS)('%s is translated in both locales', (key) => {
    expect(viStrings[key], `missing vi for ${key}`).toBeTruthy()
    expect(enStrings[key], `missing en for ${key}`).toBeTruthy()
  })

  it('vi and en actually differ — a copied key is not a translation', () => {
    const same = KEYS.filter((k) => viStrings[k] === enStrings[k])
    expect(same).toEqual([])
  })
})
