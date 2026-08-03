import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isCircuitOpen, recordSuccess, recordFailure, getCircuitState } from '../providers/circuitBreaker'

describe('circuitBreaker', () => {
  beforeEach(() => {
    recordSuccess('test-provider')
  })

  it('starts in CLOSED state', () => {
    expect(getCircuitState('new-provider')).toBe('CLOSED')
    expect(isCircuitOpen('new-provider')).toBe(false)
  })

  it('stays CLOSED under failure threshold', () => {
    for (let i = 0; i < 4; i++) {
      recordFailure('test-provider')
    }
    expect(getCircuitState('test-provider')).toBe('CLOSED')
    expect(isCircuitOpen('test-provider')).toBe(false)
  })

  it('opens after 5 failures', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('test-provider')
    }
    expect(getCircuitState('test-provider')).toBe('OPEN')
    expect(isCircuitOpen('test-provider')).toBe(true)
  })

  it('transitions to HALF_OPEN after recovery period', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('test-provider')
    }
    expect(isCircuitOpen('test-provider')).toBe(true)

    vi.useFakeTimers()
    vi.advanceTimersByTime(60_001)
    expect(isCircuitOpen('test-provider')).toBe(false)
    expect(getCircuitState('test-provider')).toBe('HALF_OPEN')
    vi.useRealTimers()
  })

  it('resets to CLOSED on success', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('test-provider')
    }
    recordSuccess('test-provider')
    expect(getCircuitState('test-provider')).toBe('CLOSED')
    expect(isCircuitOpen('test-provider')).toBe(false)
  })
})
