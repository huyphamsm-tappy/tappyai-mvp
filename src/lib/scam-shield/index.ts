import type { CheckResult, CheckTarget, InputType } from './types'
import { registrableDomain } from './domain'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { isAllowedDestinationAddress } from '@/lib/security/addressPolicy'
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

/**
 * The SSRF boundary for this module: nothing reaches a provider until it has passed here.
 *
 * 🚨 It exists because the two entry points did NOT agree. `checkUrl` upgraded http→https and
 * refused anything `isSafeHttpsUrl` rejects; `checkQr` did neither and went straight to
 * `runCheck`. The QR decoder accepts `http:` as well as `https:`, so an image encoding
 * `http://169.254.169.254/…` made the server issue that request, and the redirect provider handed
 * the resulting hops back through the evidence report. One door was bolted, the other was open.
 *
 * Both call this now, so the policy cannot drift again: adding a third entry point that skips it
 * is the only way to reintroduce the hole, and there is nothing else left to copy.
 */
async function assertSafeTarget(target: CheckTarget): Promise<void> {
  if (target.url.protocol === 'http:') {
    target.url = new URL(target.url.toString().replace('http:', 'https:'))
  }
  if (!isSafeHttpsUrl(target.url.toString())) {
    throw new Error('URL is not allowed (private/internal network)')
  }
  if (!(await resolvesToPublicAddress(target.hostname))) {
    throw new Error('URL is not allowed (private/internal network)')
  }
}

/**
 * Does this hostname currently resolve somewhere we are willing to go?
 *
 * 🔑 This is NOT the security boundary — `safeFetch` is, because it pins the connection to the
 * address it validated and this cannot (whatever it learns is stale the moment it returns). What
 * it buys is honest SEMANTICS: without it, `https://points-inward.example/` sails past the string
 * check, every provider fails on its own, and the visitor gets a muddled "check failed" for what
 * is really the same refusal as typing `http://10.0.0.5/`. With it they get one clear answer, and
 * the providers are never handed the target at all.
 *
 * 🚨 A resolution FAILURE is not a refusal. Scam Shield's job includes reporting on domains that
 * are dead, parked, or newly registered — the DNS provider scores "no A record" as a signal in
 * its own right. Failing closed here would refuse to examine exactly the domains most worth
 * examining. Unresolvable names proceed; the pinned sinks can still not reach anything internal.
 *
 * 🚨 And it is BOUNDED. This lookup sits in front of everything, so an unresolvable name that
 * hangs would stall the whole check rather than just this part of it — CI caught exactly that,
 * timing out on `random-site.xyz` where a local resolver answers NXDOMAIN instantly. A slow
 * resolver is treated the same as a failed one: carry on, because the security guarantee never
 * depended on this answer in the first place.
 */
const GATE_DNS_TIMEOUT_MS = 1500

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    const { lookup } = await import('node:dns/promises')
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), GATE_DNS_TIMEOUT_MS)
        timer.unref?.()   // never hold the process open for a lookup nobody is waiting on
      }),
    ])
    if (addresses === null) return true   // too slow to be worth blocking on
    return addresses.every(a => isAllowedDestinationAddress(a.address))
  } catch {
    return true
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function checkUrl(rawUrl: string): Promise<CheckResult> {
  ensureProviders()

  const target = normalizeTarget(rawUrl)
  await assertSafeTarget(target)

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

  // 🔑 Same boundary as `checkUrl`. A URL is no safer for having arrived inside an image.
  const target = normalizeTarget(decoded.url.toString())
  await assertSafeTarget(target)

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
