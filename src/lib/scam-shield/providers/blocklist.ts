import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS } from '../config'

let blocklistCache: Set<string> | null = null
let blocklistLoadedAt = 0
const BLOCKLIST_REFRESH_MS = 24 * 60 * 60_000

async function getBlocklist(): Promise<Set<string>> {
  if (blocklistCache && Date.now() - blocklistLoadedAt < BLOCKLIST_REFRESH_MS) {
    return blocklistCache
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/nicedream0/vn-badsite-filter/main/domains.txt',
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return blocklistCache ?? new Set()
    const text = await res.text()
    const domains = new Set(
      text.split('\n')
        .map(l => l.trim().toLowerCase())
        .filter(l => l && !l.startsWith('#') && !l.startsWith('!')),
    )
    blocklistCache = domains
    blocklistLoadedAt = Date.now()
    return domains
  } catch {
    return blocklistCache ?? new Set()
  }
}

export const blocklistProvider: ScamShieldProvider = {
  id: 'blocklist',
  name: 'VN Blocklist',

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
      const blocklist = await getBlocklist()

      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'Blocklist check timed out' }
      }

      if (blocklist.has(target.hostname) || blocklist.has(target.domain)) {
        return {
          ...base, finding: 'BLOCKLISTED', severity: 'critical',
          weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
          detail: 'Domain is on the Vietnamese bad-site blocklist',
          raw: { matchedDomain: blocklist.has(target.hostname) ? target.hostname : target.domain },
        }
      }

      return {
        ...base, finding: 'NOT_LISTED', severity: 'safe',
        weight: 0,
        detail: 'Domain is not on the blocklist',
      }
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'Blocklist check timed out' }
      }
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'Blocklist check failed', raw: String(err) }
    }
  },
}
