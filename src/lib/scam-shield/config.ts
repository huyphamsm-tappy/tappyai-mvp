import type { RiskLevel } from './types'

/**
 * Provider weight caps — used for both scoring and confidence calculation.
 *
 * 🚨 `impersonation` is deliberately ABSENT. Confidence here means "how much of the evidence base
 * actually responded", and it exists to stop a reassuring verdict being issued when the network
 * checks did not run. The impersonation check is local and deterministic — it always completes —
 * so listing it would add its weight to BOTH sides of that ratio and quietly inflate confidence
 * on exactly the runs where every real provider failed. That would weaken MIN_CONFIDENCE_FOR_SAFE
 * while claiming to strengthen the product.
 *
 * `calculateRisk` reads `PROVIDER_MAX_WEIGHTS[s.provider] ?? 0`, so an unlisted signal
 * contributes to the SCORE and not to confidence, which is precisely the intent. That property
 * is already relied upon and pinned in __tests__/failClosed.test.ts.
 */
export const PROVIDER_MAX_WEIGHTS: Record<string, number> = {
  webRisk: 40,
  whois: 15,
  redirect: 15,
  ssl: 10,
  dns: 10,
  blocklist: 10,
}

/**
 * Weight added when a hostname wears a directory brand's name but is not that brand's domain.
 *
 * ============================================================================
 * WHY THESE NUMBERS — B01
 * ============================================================================
 * Read against LEVEL_THRESHOLDS below. Financial and identity brands score 60, which is HIGH
 * (56–80) on this signal ALONE — before any provider has said anything. That is the point: a
 * host carrying a Vietnamese bank's name that is not the bank's own domain is, in practice,
 * phishing, and the user must be told so even if every network provider timed out. The live
 * examples scored 19 from the other providers, so they now land at 79 — HIGH, with
 * "Do NOT open this link" instead of "This link appears safe".
 *
 * The rest score 40 — MEDIUM (31–55) alone, escalating to HIGH once real signals join it. The
 * split is not squeamishness: the directory holds VN-focused domains, so an unlisted legitimate
 * foreign storefront (say a regional Shopee domain) can trip the check, and MEDIUM's
 * "proceed with caution" is the right answer for that where "do not open" would not be. No bank
 * has that ambiguity.
 *
 * 🚨 These are NOT in PROVIDER_MAX_WEIGHTS, and that omission is load-bearing — see the note
 * there.
 */
export const IMPERSONATION_WEIGHTS: Record<string, number> = {
  bank: 60,
  government: 60,
  ewallet: 60,
  telecom: 40,
  airline: 40,
  ecommerce: 40,
}

// Severity multipliers applied to a provider's base weight.
export const SEVERITY_MULTIPLIERS: Record<string, number> = {
  safe: 0.0,
  info: 0.3,
  warning: 0.7,
  critical: 1.0,
}

// Below this confidence, "no risk found" is not the same claim as "safe": too little of the
// evidence base actually completed to stand behind it. Matches the UI's own low/medium
// confidence boundary (ScamShieldResult's ConfidenceBadge), so the badge and the recommended
// action can never disagree about whether a result is trustworthy.
export const MIN_CONFIDENCE_FOR_SAFE = 50

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

// Domain age thresholds (days).
export const DOMAIN_AGE_CRITICAL_DAYS = 7
export const DOMAIN_AGE_WARNING_DAYS = 30

// Redirect chain thresholds.
export const REDIRECT_WARNING_COUNT = 2
export const REDIRECT_CRITICAL_COUNT = 4

// QR upload limits.
export const QR_MAX_SIZE_BYTES = 5 * 1024 * 1024
