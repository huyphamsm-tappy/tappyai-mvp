import type { FreshnessMetadata, FreshnessType } from './types'

// Freshness is a contract, not a label. A value carries WHERE it came from,
// WHEN it was read and WHEN it stops being current; the presentation layer
// decides what to say from those three facts. Static data is never promoted to
// realtime by omission — the default type is 'unknown' (Plan §8).

export interface FreshnessPolicy {
  freshnessType: FreshnessType
  /** Milliseconds a value stays current; null = no expiry known (identity data). */
  ttlMs: number | null
}

/** Build FreshnessMetadata for a value read `now` under a provider policy. */
export function makeFreshness(
  source: string,
  policy: FreshnessPolicy,
  opts: { now?: Date; confidence: number },
): FreshnessMetadata {
  const now = opts.now ?? new Date()
  return {
    source,
    retrievedAt: now.toISOString(),
    expiresAt: policy.ttlMs === null ? null : new Date(now.getTime() + policy.ttlMs).toISOString(),
    freshnessType: policy.freshnessType,
    confidence: clamp01(opts.confidence),
  }
}

/** True once `expiresAt` has passed. A null expiry never expires. */
export function isExpired(f: FreshnessMetadata, now: Date = new Date()): boolean {
  if (!f.expiresAt) return false
  return new Date(f.expiresAt).getTime() <= now.getTime()
}

/**
 * Registry facts (depth profiles, grammars) age too: confidence decays after
 * the 30-day re-verification window so an unrefreshed fact ranks lower rather
 * than silently staying "verified". Returns the decayed confidence.
 */
export const REVERIFY_WINDOW_DAYS = 30
export function decayConfidence(base: number, verifiedOn: string, now: Date = new Date()): number {
  const verified = new Date(verifiedOn).getTime()
  if (!Number.isFinite(verified)) return clamp01(base * 0.5)
  const ageDays = (now.getTime() - verified) / 86_400_000
  if (ageDays <= REVERIFY_WINDOW_DAYS) return clamp01(base)
  // Linear decay to half over the following window, then floor at 0.4·base.
  const over = Math.min(1, (ageDays - REVERIFY_WINDOW_DAYS) / REVERIFY_WINDOW_DAYS)
  return clamp01(base * (1 - 0.6 * over))
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/** Next 00:08 UTC after `now` — the ACCESSTRADE static-CSV regeneration time. */
export function nextFeedRegeneration(now: Date = new Date(), graceMs = 2 * 3_600_000): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 8, 0, 0))
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return new Date(next.getTime() + graceMs)
}
