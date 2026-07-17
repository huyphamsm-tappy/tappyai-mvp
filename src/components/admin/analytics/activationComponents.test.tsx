// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ActivationKpiCards } from './ActivationKpiCards'
import { ActivationFilters } from './ActivationFilters'
import { ActivationTrendChart } from './ActivationTrendChart'
import type { ActivationSummary } from '@/lib/admin/analytics/activationAnalyticsService'

afterEach(cleanup)

const summary: ActivationSummary = {
  signups: 20, activated_count: 8, activation_rate: 0.4, avg_time_to_activation_seconds: 125, rule_version: 'v1',
}

describe('ActivationKpiCards', () => {
  it('renders KPI labels and values from summary', () => {
    render(<ActivationKpiCards summary={summary} />)
    expect(screen.getByText('Signups')).toBeTruthy()
    expect(screen.getByText('Activation rate')).toBeTruthy()
    expect(screen.getByText('40.0%')).toBeTruthy()
  })
  it('renders the active rule label when provided', () => {
    render(<ActivationKpiCards summary={summary} rule={{ id: 'activation-v1', ruleVersion: 'v1', name: 'AI Answer + Place Saved (v1)', enabled: true, effectiveFrom: null, effectiveTo: null, description: '', signals: [], combinator: { type: 'ALL' }, window: { type: 'session' } }} />)
    expect(screen.getByText(/Activation Rule: AI Answer \+ Place Saved \(v1\) \(v1\)/)).toBeTruthy()
  })
  it('renders the error state', () => {
    render(<ActivationKpiCards summary={null} error="boom" />)
    expect(screen.getByRole('alert').textContent).toContain('boom')
  })
  it('renders loading skeletons', () => {
    const { container } = render(<ActivationKpiCards summary={null} loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('ActivationFilters', () => {
  it('renders all four filter fields', () => {
    render(<ActivationFilters value={{}} onChange={() => {}} />)
    for (const label of ['From', 'To', 'Platform', 'Rule version']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
  })
  it('calls onChange with the updated filter', () => {
    let next: unknown = null
    render(<ActivationFilters value={{}} onChange={(n) => { next = n }} />)
    fireEvent.change(screen.getByLabelText('Rule version'), { target: { value: 'v1' } })
    expect(next).toEqual({ rule_version: 'v1' })
  })
})

describe('ActivationTrendChart', () => {
  it('renders the empty state', () => {
    render(<ActivationTrendChart points={[]} />)
    expect(screen.getByText(/No data/)).toBeTruthy()
  })
  it('renders bars for data points', () => {
    render(<ActivationTrendChart points={[{ date: '2026-07-14', signups: 5, activated_count: 2, activation_rate: 0.4 }]} />)
    expect(screen.getByTestId('activation-trend-bars')).toBeTruthy()
  })
})
