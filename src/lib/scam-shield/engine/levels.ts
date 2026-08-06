import type { RiskLevel } from '../types'
import { LEVEL_THRESHOLDS } from '../config'

export function scoreToLevel(score: number): RiskLevel {
  for (const { max, level } of LEVEL_THRESHOLDS) {
    if (score <= max) return level
  }
  return 'CRITICAL'
}
