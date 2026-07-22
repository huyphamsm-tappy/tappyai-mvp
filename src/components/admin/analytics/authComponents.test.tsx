// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AuthKpiCards } from './AuthKpiCards'
import { AuthFilters } from './AuthFilters'
import { AuthBreakdownTable, type Column } from './AuthBreakdownTable'
import { AuthTrendChart } from './AuthTrendChart'
import type { AuthSummary } from '@/lib/admin/analytics/authAnalyticsService'

afterEach(cleanup)

const summary: AuthSummary = {
  signups: 10, logins_success: 38, logins_failed: 10, first_logins: 5,
  returning_logins: 33, login_success_rate: 0.79, first_login_conversion: 0.5,
}

describe('AuthKpiCards', () => {
  it('renders KPI labels and values from summary', () => {
    render(<AuthKpiCards summary={summary} />)
    expect(screen.getByText('Signups')).toBeTruthy()
    expect(screen.getByText('Login success rate')).toBeTruthy()
    expect(screen.getByText('79.0%')).toBeTruthy()
  })
  it('renders the error state', () => {
    render(<AuthKpiCards summary={null} error="boom" />)
    expect(screen.getByRole('alert').textContent).toContain('boom')
  })
  it('renders loading skeletons', () => {
    const { container } = render(<AuthKpiCards summary={null} loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('AuthFilters', () => {
  it('renders all six filter fields (+ date range)', () => {
    render(<AuthFilters value={{}} onChange={() => {}} />)
    for (const label of ['From', 'To', 'Platform', 'Method', 'App version', 'Country', 'Language']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
  })
  it('calls onChange with the updated filter', () => {
    let next: unknown = null
    render(<AuthFilters value={{}} onChange={(n) => { next = n }} />)
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'VN' } })
    expect(next).toEqual({ country: 'VN' })
  })
})

describe('AuthBreakdownTable', () => {
  const cols: Column<{ k: string; v: number }>[] = [
    { key: 'k', label: 'Key', render: (r) => r.k },
    { key: 'v', label: 'Val', align: 'right', render: (r) => String(r.v) },
  ]
  it('renders the empty state', () => {
    render(<AuthBreakdownTable title="T" columns={cols} rows={[]} emptyText="nothing here" />)
    expect(screen.getByText('nothing here')).toBeTruthy()
  })
  it('renders the error state', () => {
    render(<AuthBreakdownTable title="T" columns={cols} rows={[]} error="failed" />)
    expect(screen.getByRole('alert').textContent).toContain('failed')
  })
  it('renders rows and a Load more button', () => {
    const onLoadMore = () => {}
    render(<AuthBreakdownTable title="T" columns={cols} rows={[{ k: 'google', v: 5 }]} hasMore onLoadMore={onLoadMore} />)
    expect(screen.getByText('google')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('Load more')).toBeTruthy()
  })
})

describe('AuthTrendChart', () => {
  it('renders the empty state', () => {
    render(<AuthTrendChart points={[]} />)
    expect(screen.getByText(/No data/)).toBeTruthy()
  })
  it('renders bars for data points', () => {
    render(<AuthTrendChart points={[{ date: '2026-07-13', signups: 2, logins_success: 5, logins_failed: 1, unique_users: 4 }]} />)
    expect(screen.getByTestId('auth-trend-bars')).toBeTruthy()
  })
})
