import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS } from '../config'

export const dnsProvider: ScamShieldProvider = {
  id: 'dns',
  name: 'DNS Records',

  isConfigured(): boolean {
    return true
  },

  async check(target: CheckTarget, signal: AbortSignal): Promise<ProviderSignal> {
    const base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'> = {
      provider: this.id,
      status: 'completed',
    }
    const maxWeight = PROVIDER_MAX_WEIGHTS[this.id]
    const dns = await import('node:dns')
    const { promisify } = await import('node:util')

    const resolve4 = promisify(dns.resolve4)
    const resolveMx = promisify(dns.resolveMx)
    const resolveNs = promisify(dns.resolveNs)

    try {
      const [aRecords, mxRecords, nsRecords] = await Promise.allSettled([
        resolve4(target.hostname),
        resolveMx(target.hostname),
        resolveNs(target.hostname),
      ])

      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'DNS lookup timed out' }
      }

      const hasA = aRecords.status === 'fulfilled' && aRecords.value.length > 0
      const hasMx = mxRecords.status === 'fulfilled' && mxRecords.value.length > 0
      const hasNs = nsRecords.status === 'fulfilled' && nsRecords.value.length > 0

      if (!hasA) {
        return {
          ...base, finding: 'NO_A_RECORD', severity: 'warning',
          weight: maxWeight * SEVERITY_MULTIPLIERS.warning,
          detail: 'Domain has no A record (no IP address)',
          raw: { hasA, hasMx, hasNs },
        }
      }

      if (!hasNs) {
        return {
          ...base, finding: 'NO_NS_RECORD', severity: 'info',
          weight: maxWeight * SEVERITY_MULTIPLIERS.info,
          detail: 'Domain has no NS records',
          raw: { hasA, hasMx, hasNs },
        }
      }

      return {
        ...base, finding: 'RESOLVED', severity: 'safe',
        weight: 0,
        detail: `DNS records present (A: ${hasA}, MX: ${hasMx}, NS: ${hasNs})`,
        raw: {
          hasA, hasMx, hasNs,
          aRecords: aRecords.status === 'fulfilled' ? aRecords.value : [],
          nsRecords: nsRecords.status === 'fulfilled' ? nsRecords.value : [],
        },
      }
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'DNS lookup timed out' }
      }
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'DNS lookup failed', raw: String(err) }
    }
  },
}
