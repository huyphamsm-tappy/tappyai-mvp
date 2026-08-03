import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS } from '../config'

export const sslProvider: ScamShieldProvider = {
  id: 'ssl',
  name: 'SSL Certificate',

  isConfigured(): boolean {
    return true
  },

  async check(target: CheckTarget, signal: AbortSignal): Promise<ProviderSignal> {
    const base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'> = {
      provider: this.id,
      status: 'completed',
    }
    const maxWeight = PROVIDER_MAX_WEIGHTS[this.id]

    try {
      const sslChecker = (await import('ssl-checker')).default
      const result = await sslChecker(target.hostname)

      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'SSL check timed out' }
      }

      if (!result.valid) {
        return {
          ...base, finding: 'INVALID_CERT', severity: 'critical',
          weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
          detail: 'SSL certificate is invalid or expired',
          raw: { valid: result.valid, daysRemaining: result.daysRemaining },
        }
      }

      if (result.daysRemaining !== undefined && result.daysRemaining < 7) {
        return {
          ...base, finding: 'EXPIRING_SOON', severity: 'warning',
          weight: maxWeight * SEVERITY_MULTIPLIERS.warning,
          detail: `SSL certificate expires in ${result.daysRemaining} days`,
          raw: { valid: result.valid, daysRemaining: result.daysRemaining },
        }
      }

      return {
        ...base, finding: 'VALID', severity: 'safe',
        weight: 0,
        detail: `Valid SSL certificate (${result.daysRemaining ?? '?'} days remaining)`,
        raw: { valid: result.valid, daysRemaining: result.daysRemaining },
      }
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'SSL check timed out' }
      }
      return {
        ...base, finding: 'NO_SSL', severity: 'warning',
        weight: maxWeight * SEVERITY_MULTIPLIERS.warning,
        detail: 'Could not verify SSL certificate',
        raw: String(err),
      }
    }
  },
}
