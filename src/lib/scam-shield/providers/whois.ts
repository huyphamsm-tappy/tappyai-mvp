import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS, DOMAIN_AGE_CRITICAL_DAYS, DOMAIN_AGE_WARNING_DAYS } from '../config'

export const whoisProvider: ScamShieldProvider = {
  id: 'whois',
  name: 'WHOIS Domain Age',

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
      const { whoisDomain } = await import('whoiser')
      const result = await whoisDomain(target.domain, { timeout: 2500 })

      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'WHOIS lookup timed out' }
      }

      const record = Object.values(result)[0] as Record<string, unknown> | undefined
      if (!record) {
        return { ...base, finding: 'NO_DATA', severity: 'info', weight: maxWeight * SEVERITY_MULTIPLIERS.info, detail: 'No WHOIS data available' }
      }

      const createdRaw = record['Created Date'] ?? record['Creation Date'] ?? record['created']
      if (!createdRaw) {
        return { ...base, finding: 'NO_DATE', severity: 'info', weight: maxWeight * SEVERITY_MULTIPLIERS.info, detail: 'Domain creation date not available' }
      }

      const createdStr = Array.isArray(createdRaw) ? createdRaw[0] : String(createdRaw)
      const createdDate = new Date(createdStr)
      if (isNaN(createdDate.getTime())) {
        return { ...base, finding: 'INVALID_DATE', severity: 'info', weight: maxWeight * SEVERITY_MULTIPLIERS.info, detail: 'Could not parse domain creation date' }
      }

      const ageDays = Math.floor((Date.now() - createdDate.getTime()) / 86_400_000)
      const registrar = String(record['Registrar'] ?? record['registrar'] ?? 'Unknown')

      if (ageDays <= DOMAIN_AGE_CRITICAL_DAYS) {
        return {
          ...base, finding: 'NEWLY_REGISTERED', severity: 'critical',
          weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
          detail: `Domain registered ${ageDays} day${ageDays === 1 ? '' : 's'} ago`,
          raw: { createdDate: createdStr, ageDays, registrar },
        }
      }

      if (ageDays <= DOMAIN_AGE_WARNING_DAYS) {
        return {
          ...base, finding: 'RECENTLY_REGISTERED', severity: 'warning',
          weight: maxWeight * SEVERITY_MULTIPLIERS.warning,
          detail: `Domain registered ${ageDays} days ago`,
          raw: { createdDate: createdStr, ageDays, registrar },
        }
      }

      return {
        ...base, finding: 'ESTABLISHED', severity: 'safe',
        weight: 0,
        detail: `Domain registered ${ageDays} days ago`,
        raw: { createdDate: createdStr, ageDays, registrar },
      }
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'WHOIS lookup timed out' }
      }
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'WHOIS lookup failed', raw: String(err) }
    }
  },
}
