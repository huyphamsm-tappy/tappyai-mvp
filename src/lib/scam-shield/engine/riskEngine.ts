import type { ProviderSignal, RiskResult } from '../types'
import { PROVIDER_MAX_WEIGHTS } from '../config'
import { scoreToLevel } from './levels'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
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
  const confidence = totalMaxWeight > 0
    ? clamp(Math.round((completedMaxWeight / totalMaxWeight) * 100), 0, 100)
    : 0

  return {
    score,
    confidence,
    level: scoreToLevel(score),
    signals,
    completedCount: completed.length,
    totalCount: signals.length,
  }
}
