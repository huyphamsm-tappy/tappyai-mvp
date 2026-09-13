import { recordEvent, type ObservabilityEvent } from '@/lib/observability'
import { setCommerceEventWriter, type CommerceEvent } from './sink'

// ── CCP sink → shared observability (owner decision P6-C) ────────────────────
// `emitCommerceEvent` sanitises and hands a flat entry to the writer installed
// here. The writer translates the six CCP events into the six commerce members
// of `ObservabilityEvent` and buffers them with `recordEvent`, so they ride the
// same Cloud Logging pipeline (and the same allow-list) as every other event.
//
// Flattening rules, because the shared sink keeps scalars only:
//   · string[]              → comma-joined closed-vocabulary string
//   · features (object)     → dropped (score + rankingVersion stay)
//   · urlHash               → linkDigest (renamed: the shared allow-list bans any
//                             field whose NAME contains "url")
//   · detail                → reason
// Nothing is added. A CCP event carrying a value the sanitiser refused is
// already missing that field before it reaches here.

type Entry = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const joined = (v: unknown): string => (Array.isArray(v) ? v.filter(x => typeof x === 'string').join(',') : '')
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Pure translation of one sanitised CCP entry. `null` for anything that is not one of the six. */
export function toObservabilityEvent(entry: Entry): ObservabilityEvent | null {
  const type = entry.type as CommerceEvent['type'] | undefined
  switch (type) {
    case 'commerce_request':
      return {
        type: 'commerce_request',
        requestId: str(entry.requestId) ?? '',
        domain: str(entry.domain) ?? '',
        intentType: str(entry.intentType) ?? '',
        configurationFields: joined(entry.configurationKeys),
        ...(str(entry.actorHash) ? { actorHash: str(entry.actorHash) } : {}),
        ...(str(entry.sessionHash) ? { sessionHash: str(entry.sessionHash) } : {}),
        ...(str(entry.platform) ? { platform: str(entry.platform) } : {}),
      }
    case 'provider_search':
      return {
        type: 'commerce_provider_search',
        requestId: str(entry.requestId) ?? '',
        providerId: str(entry.providerId) ?? '',
        offersCount: num(entry.offersCount) ?? 0,
        ...(str(entry.freshnessType) ? { freshnessType: str(entry.freshnessType) } : {}),
        latencyMs: num(entry.latencyMs) ?? 0,
        ...(str(entry.errorCode) ? { errorCode: str(entry.errorCode) } : {}),
      }
    case 'provider_selected':
      return {
        type: 'commerce_provider_selected',
        requestId: str(entry.requestId) ?? '',
        providerId: str(entry.providerId) ?? '',
        merchantId: str(entry.merchantId) ?? '',
        score: num(entry.score) ?? 0,
        rankingVersion: str(entry.rankingVersion) ?? '',
      }
    case 'deep_link_resolved':
      return {
        type: 'commerce_deep_link_resolved',
        requestId: str(entry.requestId) ?? '',
        linkId: str(entry.linkId) ?? '',
        providerId: str(entry.providerId) ?? '',
        merchantId: str(entry.merchantId) ?? '',
        domain: str(entry.domain) ?? '',
        kind: str(entry.kind) ?? '',
        depth: num(entry.depth) ?? 0,
        guestDepth: num(entry.guestDepth) ?? 0,
        authenticatedDepth: numOrNull(entry.authenticatedDepth),
        authRequiredAt: str(entry.authRequiredAt) ?? '',
        paramsPreserved: joined(entry.paramsPreserved),
        paramsDropped: joined(entry.paramsDropped),
        trackingPresent: bool(entry.trackingPresent) ?? false,
        ...(str(entry.trackingNetwork) ? { trackingNetwork: str(entry.trackingNetwork) } : {}),
        freshnessType: str(entry.freshnessType) ?? 'unknown',
        expiresAt: strOrNull(entry.expiresAt),
        confidence: num(entry.confidence) ?? 0,
        linkDigest: str(entry.urlHash) ?? '',
      }
    case 'deep_link_validated':
      return {
        type: 'commerce_deep_link_validated',
        linkId: str(entry.linkId) ?? '',
        status: str(entry.status) ?? '',
        method: str(entry.method) ?? '',
        ms: num(entry.ms) ?? 0,
        ...(str(entry.detail) ? { reason: str(entry.detail) } : {}),
      }
    case 'commerce_handoff':
      return {
        type: 'commerce_handoff',
        linkId: str(entry.linkId) ?? '',
        requestId: str(entry.requestId) ?? '',
        ...(str(entry.actorHash) ? { actorHash: str(entry.actorHash) } : {}),
        ...(str(entry.sessionHash) ? { sessionHash: str(entry.sessionHash) } : {}),
        ...(str(entry.platform) ? { platform: str(entry.platform) } : {}),
      }
    default:
      return null
  }
}

let installed = false

/**
 * Route CCP events into the shared observability buffer. Idempotent; the
 * `record` seam exists for tests. Safe to call at module load from the tool
 * layer — installing a writer performs no I/O.
 */
export function installCommerceObservability(record: (e: ObservabilityEvent) => void = recordEvent): void {
  if (installed && record === recordEvent) return
  installed = true
  setCommerceEventWriter(entry => {
    const ev = toObservabilityEvent(entry)
    if (ev) record(ev)
  })
}

/** Test seam. */
export function __resetCommerceObservability(): void {
  installed = false
  setCommerceEventWriter(null)
}
