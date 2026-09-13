// ── Provider ranking weights — owner decision D3 (13 Sep 2026) ───────────────
// Versioned so a ranking change is an audit event, not a silent deploy. The
// monetisation weight is CAPPED at 0.05: it can break a tie, never outrank a
// deeper, fresher or more exact link (Plan §9–10).

export const RANKING_VERSION = 'v1-2026-09-13'

export const RANKING_WEIGHTS = Object.freeze({
  intentExactness: 0.3,
  realtime: 0.15,
  freshness: 0.1,
  depth: 0.15,
  deepLinkPrecision: 0.1,
  reliability: 0.08,
  authFriction: 0.07,
  monetisation: 0.05,
})

export const MONETISATION_CAP = 0.05

export type RankingFeature = keyof typeof RANKING_WEIGHTS
export type FeatureVector = Record<RankingFeature, number>

/** Sum of weights must be 1 and the monetisation weight must not exceed its cap. */
export function validateWeights(w: Record<RankingFeature, number> = RANKING_WEIGHTS): string[] {
  const problems: string[] = []
  const sum = Object.values(w).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > 1e-9) problems.push(`weights sum to ${sum}, expected 1`)
  if (w.monetisation > MONETISATION_CAP) problems.push(`monetisation ${w.monetisation} exceeds cap ${MONETISATION_CAP}`)
  for (const [k, v] of Object.entries(w)) if (v < 0 || v > 1) problems.push(`${k} out of range`)
  return problems
}
