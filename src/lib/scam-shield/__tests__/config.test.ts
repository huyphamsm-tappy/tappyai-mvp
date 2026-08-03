import { describe, it, expect } from 'vitest'
import {
  PROVIDER_MAX_WEIGHTS,
  SEVERITY_MULTIPLIERS,
  LEVEL_THRESHOLDS,
  CACHE_TTLS,
  PROVIDER_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
  CB_FAILURE_THRESHOLD,
  CB_RECOVERY_MS,
  QR_MAX_SIZE_BYTES,
} from '../config'

describe('config', () => {
  it('provider weights sum to 100', () => {
    const sum = Object.values(PROVIDER_MAX_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it('severity multipliers range from 0.0 to 1.0', () => {
    for (const v of Object.values(SEVERITY_MULTIPLIERS)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(SEVERITY_MULTIPLIERS.safe).toBe(0)
    expect(SEVERITY_MULTIPLIERS.critical).toBe(1)
  })

  it('level thresholds are sorted ascending', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
      expect(LEVEL_THRESHOLDS[i].max).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1].max)
    }
  })

  it('level thresholds cover 0-100', () => {
    expect(LEVEL_THRESHOLDS[0].max).toBeGreaterThanOrEqual(1)
    expect(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].max).toBe(100)
  })

  it('cache TTLs are positive', () => {
    for (const ttl of Object.values(CACHE_TTLS)) {
      expect(ttl).toBeGreaterThan(0)
    }
  })

  it('provider timeout is less than total timeout', () => {
    expect(PROVIDER_TIMEOUT_MS).toBeLessThan(TOTAL_TIMEOUT_MS)
  })

  it('circuit breaker has reasonable values', () => {
    expect(CB_FAILURE_THRESHOLD).toBeGreaterThanOrEqual(3)
    expect(CB_RECOVERY_MS).toBeGreaterThanOrEqual(30_000)
  })

  it('QR max size is 5 MB', () => {
    expect(QR_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })
})
