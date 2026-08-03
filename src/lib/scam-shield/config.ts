import type { RiskLevel } from './types'

// Provider weight caps — used for both scoring and confidence calculation.
export const PROVIDER_MAX_WEIGHTS: Record<string, number> = {
  webRisk: 40,
  whois: 15,
  redirect: 15,
  ssl: 10,
  dns: 10,
  blocklist: 10,
}

// Severity multipliers applied to a provider's base weight.
export const SEVERITY_MULTIPLIERS: Record<string, number> = {
  safe: 0.0,
  info: 0.3,
  warning: 0.7,
  critical: 1.0,
}

// Score thresholds for risk level classification.
export const LEVEL_THRESHOLDS: { max: number; level: RiskLevel }[] = [
  { max: 10, level: 'SAFE' },
  { max: 30, level: 'LOW' },
  { max: 55, level: 'MEDIUM' },
  { max: 80, level: 'HIGH' },
  { max: 100, level: 'CRITICAL' },
]

// Cache TTLs per provider (milliseconds).
export const CACHE_TTLS: Record<string, number> = {
  webRisk: 5 * 60_000,
  whois: 24 * 60 * 60_000,
  dns: 60 * 60_000,
  ssl: 6 * 60 * 60_000,
  redirect: 15 * 60_000,
  blocklist: 60 * 60_000,
  directory: 60 * 60_000,
}

// Orchestrator limits.
export const PROVIDER_TIMEOUT_MS = 3_000
export const TOTAL_TIMEOUT_MS = 8_000

// Circuit breaker thresholds.
export const CB_FAILURE_THRESHOLD = 5
export const CB_RECOVERY_MS = 60_000

// Rate limits for the check endpoint.
export const CHECK_RATE_LIMIT_WINDOW_MS = 60_000
export const CHECK_RATE_LIMIT_MAX = 10
export const CHECK_DAILY_LIMIT_AUTH = 30
export const CHECK_DAILY_LIMIT_ANON = 10

// Domain age thresholds (days).
export const DOMAIN_AGE_CRITICAL_DAYS = 7
export const DOMAIN_AGE_WARNING_DAYS = 30

// Redirect chain thresholds.
export const REDIRECT_WARNING_COUNT = 2
export const REDIRECT_CRITICAL_COUNT = 4

// QR upload limits.
export const QR_MAX_SIZE_BYTES = 5 * 1024 * 1024
