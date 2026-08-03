import type { RiskLevel } from '../types'
import { LEVEL_THRESHOLDS } from '../config'

export function scoreToLevel(score: number): RiskLevel {
  for (const { max, level } of LEVEL_THRESHOLDS) {
    if (score <= max) return level
  }
  return 'CRITICAL'
}

export const LEVEL_LABELS: Record<RiskLevel, { vi: string; en: string }> = {
  SAFE: { vi: 'An toàn', en: 'Safe' },
  LOW: { vi: 'Nguy cơ thấp', en: 'Low risk' },
  MEDIUM: { vi: 'Cần cẩn thận', en: 'Use caution' },
  HIGH: { vi: 'Nguy cơ cao', en: 'High risk' },
  CRITICAL: { vi: 'Rất nguy hiểm', en: 'Very dangerous' },
}
