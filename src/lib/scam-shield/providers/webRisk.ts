import type { ScamShieldProvider } from './types'
import type { CheckTarget, ProviderSignal } from '../types'
import { PROVIDER_MAX_WEIGHTS, SEVERITY_MULTIPLIERS } from '../config'

const THREAT_LABELS: Record<string, string> = {
  SOCIAL_ENGINEERING: 'Phishing / social engineering',
  MALWARE: 'Malware distribution',
  UNWANTED_SOFTWARE: 'Unwanted software',
  SOCIAL_ENGINEERING_EXTENDED_COVERAGE: 'Extended social engineering',
}

export const webRiskProvider: ScamShieldProvider = {
  id: 'webRisk',
  name: 'Google Web Risk',

  isConfigured(): boolean {
    return !!(
      process.env.GOOGLE_CLOUD_PROJECT &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_WEB_RISK_API_KEY)
    )
  },

  async check(target: CheckTarget, signal: AbortSignal): Promise<ProviderSignal> {
    const base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'> = {
      provider: this.id,
      status: 'completed',
    }
    const maxWeight = PROVIDER_MAX_WEIGHTS[this.id]

    try {
      const apiKey = process.env.GOOGLE_WEB_RISK_API_KEY
      if (apiKey) {
        return await lookupViaRest(target, apiKey, signal, base, maxWeight)
      }
      return await lookupViaSDK(target, signal, base, maxWeight)
    } catch (err) {
      if (signal.aborted) {
        return { ...base, status: 'timeout', finding: 'TIMEOUT', severity: 'info', weight: 0, detail: 'Provider timed out' }
      }
      return { ...base, status: 'error', finding: 'ERROR', severity: 'info', weight: 0, detail: 'Web Risk lookup failed', raw: String(err) }
    }
  },
}

async function lookupViaRest(
  target: CheckTarget,
  apiKey: string,
  signal: AbortSignal,
  base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'>,
  maxWeight: number,
): Promise<ProviderSignal> {
  const threatTypes = ['SOCIAL_ENGINEERING', 'MALWARE', 'UNWANTED_SOFTWARE']
  const params = new URLSearchParams({ key: apiKey })
  threatTypes.forEach(t => params.append('threatTypes', t))
  params.append('uri', target.url.toString())

  const res = await fetch(
    `https://webrisk.googleapis.com/v1/uris:search?${params}`,
    { signal },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ...base, status: 'error', finding: 'API_ERROR', severity: 'info', weight: 0, detail: 'Web Risk API returned an error', raw: text }
  }

  const data = await res.json() as { threat?: { threatTypes?: string[] } }
  return parseResponse(data, base, maxWeight)
}

async function lookupViaSDK(
  target: CheckTarget,
  _signal: AbortSignal,
  base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'>,
  maxWeight: number,
): Promise<ProviderSignal> {
  const { WebRiskServiceClient } = await import('@google-cloud/web-risk')
  const client = new WebRiskServiceClient()

  const result = await client.searchUris({
    uri: target.url.toString(),
    threatTypes: [1, 2, 4], // SOCIAL_ENGINEERING, MALWARE, UNWANTED_SOFTWARE
  })
  const response = (result as unknown[])[0] as { threat?: { threatTypes?: string[] } } | undefined

  const threatTypes = response?.threat?.threatTypes ?? []
  return parseResponse({ threat: { threatTypes } }, base, maxWeight)
}

function parseResponse(
  data: { threat?: { threatTypes?: string[] } },
  base: Omit<ProviderSignal, 'finding' | 'severity' | 'weight' | 'detail'>,
  maxWeight: number,
): ProviderSignal {
  const threats = data.threat?.threatTypes ?? []

  if (threats.length === 0) {
    return { ...base, finding: 'CLEAN', severity: 'safe', weight: 0, detail: 'No threats detected by Google Web Risk' }
  }

  const finding = threats[0]
  const detail = threats.map(t => THREAT_LABELS[t] ?? t).join(', ')

  return {
    ...base,
    finding,
    severity: 'critical',
    weight: maxWeight * SEVERITY_MULTIPLIERS.critical,
    detail: `Flagged by Google Web Risk: ${detail}`,
    raw: threats,
  }
}
