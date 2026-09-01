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
      // 🚨 This is the SECOND place Scam Shield opens a socket to a host a stranger named — it
      // reads a certificate, which means a TLS connection to whatever the name resolves to. A
      // hostname pointing at `10.0.0.5` would have had us knocking on port 443 inside the network.
      //
      // The same pinning resolver as the redirect follower. Verified by measurement rather than
      // by its type: `ssl-checker` declares `https.RequestOptions` (which includes `lookup`) but
      // only forwards it on the plain-https path — its STARTTLS and cipher-grading paths build
      // their own connect options and drop it. Neither of those runs here (no `protocol`, no
      // `grade`), so the option does reach the socket; `__tests__/dnsPinning.test.ts` holds that.
      const { safeLookup } = await import('@/lib/security/safeFetch')
      const result = await sslChecker(target.hostname, { lookup: safeLookup })

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
