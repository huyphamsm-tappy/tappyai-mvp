import type { ProviderSignal, RiskLevel, RiskResult } from '../types'
import { MIN_CONFIDENCE_FOR_SAFE, PROVIDER_MAX_WEIGHTS } from '../config'
import { scoreToLevel } from './levels'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * The reported level, given a score and how much of the evidence base actually produced it.
 *
 * 🚨 THE ONE RULE THIS FILE EXISTS FOR: a reassuring level requires evidence to reassure with.
 *
 * `calculateRisk` sums only COMPLETED signals, so a score of 0 means "nothing bad was found" and
 * cannot be told apart from "nothing was found, because nothing ran". Both used to report SAFE.
 * With every provider failed the result was score 0, level SAFE, confidence 0 — the API's own
 * answer to a caller was that a completely unchecked link was safe. That is the single false
 * negative a scam-protection feature cannot afford, and it was reachable rather than theoretical:
 * Web Risk is unconfigured in production, and `executeProviders` returns an empty array when no
 * provider is configured at all.
 *
 * A previous fix corrected the recommended ACTION text for this case. It did not correct
 * `risk.level`, which is the field a client renders a green shield from — so the API still said
 * SAFE while the action text said the opposite. This closes it at the source, so every consumer
 * (the route, the cache, the actions, any future client) sees the same honest answer.
 *
 * The check is deliberately ASYMMETRIC:
 *   • SAFE / LOW  are claims about absence → they need coverage, and become INCONCLUSIVE without it
 *   • MEDIUM+     are claims about presence → some provider completed and found something, so
 *                 partial coverage must never suppress them
 * Pinned in both directions by test.
 */
export function levelFor(score: number, confidence: number): RiskLevel {
  const band = scoreToLevel(score)
  const isReassuring = band === 'SAFE' || band === 'LOW'
  if (isReassuring && confidence < MIN_CONFIDENCE_FOR_SAFE) return 'INCONCLUSIVE'
  return band
}

export function calculateRisk(signals: ProviderSignal[]): RiskResult {
  const completed = signals.filter(s => s.status === 'completed')

  const score = clamp(
    Math.round(completed.reduce((sum, s) => sum + s.weight, 0)),
    0,
    100,
  )

  const totalMaxWeight = signals.reduce(
    (sum, s) => sum + (PROVIDER_MAX_WEIGHTS[s.provider] ?? 0),
    0,
  )
  const completedMaxWeight = completed.reduce(
    (sum, s) => sum + (PROVIDER_MAX_WEIGHTS[s.provider] ?? 0),
    0,
  )
  // No signals at all (no provider configured) divides by zero, so it is spelled out: confidence
  // 0, which `levelFor` then turns into INCONCLUSIVE rather than SAFE.
  const confidence = totalMaxWeight > 0
    ? clamp(Math.round((completedMaxWeight / totalMaxWeight) * 100), 0, 100)
    : 0

  return {
    score,
    confidence,
    level: levelFor(score, confidence),
    signals,
    completedCount: completed.length,
    totalCount: signals.length,
  }
}
