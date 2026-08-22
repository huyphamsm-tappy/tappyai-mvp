import type { CheckResult, CheckTarget, InputType } from './types'
import { registrableDomain } from './domain'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { executeProviders } from './orchestrator'
import { calculateRisk } from './engine/riskEngine'
import { buildEvidence } from './engine/evidenceEngine'
import { getRecommendedActions } from './engine/actionEngine'
import { impersonationSignal } from './engine/impersonationSignal'
import { classifyBrand } from './directory/brandMatch'
import { officialDirectory } from './directory/officialDirectory'
import { decodeQrImage } from './qr/decoder'
import { registerProvider } from './providers/registry'
import { webRiskProvider } from './providers/webRisk'
import { whoisProvider } from './providers/whois'
import { dnsProvider } from './providers/dns'
import { sslProvider } from './providers/ssl'
import { redirectProvider } from './providers/redirect'
import { blocklistProvider } from './providers/blocklist'

// Register all providers on first import.
let initialized = false
function ensureProviders() {
  if (initialized) return
  initialized = true
  registerProvider(webRiskProvider)
  registerProvider(whoisProvider)
  registerProvider(dnsProvider)
  registerProvider(sslProvider)
  registerProvider(redirectProvider)
  registerProvider(blocklistProvider)
}

function normalizeTarget(raw: string): CheckTarget {
  let urlStr = raw.trim()
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr
  }
  const url = new URL(urlStr)
  const hostname = url.hostname.toLowerCase()
  const domain = registrableDomain(hostname)
  return { url, hostname, domain }
}

export async function checkUrl(rawUrl: string): Promise<CheckResult> {
  ensureProviders()

  const target = normalizeTarget(rawUrl)

  if (target.url.protocol === 'http:') {
    target.url = new URL(target.url.toString().replace('http:', 'https:'))
  }
  if (!isSafeHttpsUrl(target.url.toString())) {
    throw new Error('URL is not allowed (private/internal network)')
  }

  return runCheck(target, 'url')
}

export async function checkQr(imageBuffer: Uint8Array): Promise<CheckResult & { qrText?: string }> {
  ensureProviders()

  const decoded = await decodeQrImage(imageBuffer)

  if (!decoded.success || !decoded.text) {
    throw new Error(decoded.error ?? 'Failed to decode QR code')
  }

  if (!decoded.url) {
    throw Object.assign(
      new Error('QR code does not contain a URL'),
      { qrText: decoded.text },
    )
  }

  const target = normalizeTarget(decoded.url.toString())
  const result = await runCheck(target, 'qr')
  return { ...result, qrText: decoded.text }
}

async function runCheck(target: CheckTarget, inputType: InputType): Promise<CheckResult> {
  const providerSignals = await executeProviders(target)

  // 🚨 ORDER — this is the whole of B01. The directory lookup used to happen HERE, on the line
  // after `calculateRisk`, and its result went only to `getRecommendedActions`. So the system
  // could print "Official website: https://vietcombank.com.vn" next to a score that had never
  // been told the host was not Vietcombank. Classifying first, and folding the verdict in as a
  // signal, is what puts the finding in front of the scorer instead of behind it.
  const brandMatch = classifyBrand(target.hostname, await officialDirectory.getAll())
  const impersonation = impersonationSignal(brandMatch)
  const signals = impersonation ? [...providerSignals, impersonation] : providerSignals

  const risk = calculateRisk(signals)
  const evidence = buildEvidence(signals)
  const directoryMatch = brandMatch.entity
  const actions = getRecommendedActions(risk.level, evidence, directoryMatch, risk.confidence)

  return {
    inputType,
    url: target.url.toString(),
    risk: {
      score: risk.score,
      confidence: risk.confidence,
      level: risk.level,
    },
    evidence,
    officialMatch: directoryMatch,
    actions,
    checkedAt: Date.now(),
    cached: signals.some(s => s.cachedAt !== undefined),
  }
}

export { officialDirectory as directory }
export type { CheckResult, CheckTarget, OfficialEntity, RiskLevel, RecommendedAction, EvidenceReport } from './types'
