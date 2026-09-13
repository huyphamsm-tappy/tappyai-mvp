import type { CommerceDomain, FreshnessType, LinkKind, TransactionDepth, ValidationStatus } from '../domain/types'

// ── CCP audit events — server-side typed sink (owner decision D5) ────────────
// Six events, a CLOSED field set, no PII, no raw URL (only its hash). They are
// written as one-line JSON to the server log (Cloud Logging picks them up as
// structured entries), never to public.user_events — those rows feed the AI
// behaviour rollup and commerce activity must not become a model signal.
//
// This module is CCP's own typed sink: a union, a severity map, an allow-listed
// field set, and a swappable writer. On the canonical tree the writer is
// installed by `events/observabilityBridge.ts` (owner decision P6-C), which
// translates the six events into the six commerce members of the shared
// `ObservabilityEvent` union in src/lib/observability/events.ts. The default
// writer (one JSON line to the server log) remains the fallback when nothing
// installed the bridge — a unit test, a script.

export type CommerceEvent =
  | {
      type: 'commerce_request'
      requestId: string
      domain: CommerceDomain
      intentType: string
      capability?: string
      configurationKeys: string[]
      actorHash?: string
      sessionHash?: string
      platform?: string
    }
  | { type: 'provider_search'; requestId: string; providerId: string; offersCount: number; freshnessType?: FreshnessType; latencyMs: number; errorCode?: string }
  | { type: 'provider_selected'; requestId: string; providerId: string; merchantId: string; score: number; rankingVersion: string; features: Record<string, number> }
  | {
      type: 'deep_link_resolved'
      requestId: string
      linkId: string
      providerId: string
      merchantId: string
      domain: CommerceDomain
      kind: LinkKind
      depth: TransactionDepth
      guestDepth: TransactionDepth
      authenticatedDepth: TransactionDepth | null
      authRequiredAt: string
      paramsPreserved: string[]
      paramsDropped: string[]
      trackingPresent: boolean
      trackingNetwork?: string
      freshnessType: FreshnessType
      expiresAt: string | null
      confidence: number
      urlHash: string
    }
  | { type: 'deep_link_validated'; linkId: string; status: ValidationStatus; method: 'static' | 'decode' | 'head'; ms: number; detail?: string }
  | { type: 'commerce_handoff'; linkId: string; requestId: string; actorHash?: string; sessionHash?: string; platform?: string }

export type CommerceEventType = CommerceEvent['type']

export const COMMERCE_EVENT_SEVERITY: Record<CommerceEventType, 'INFO' | 'WARNING'> = {
  commerce_request: 'INFO',
  provider_search: 'INFO',
  provider_selected: 'INFO',
  deep_link_resolved: 'INFO',
  deep_link_validated: 'INFO',
  commerce_handoff: 'INFO',
}

/** Every key an event may carry. Anything else is dropped before writing — the
 * guard against a future field quietly carrying a name, an e-mail or a URL. */
export const COMMERCE_EVENT_FIELDS = new Set([
  'type', 'requestId', 'domain', 'intentType', 'capability', 'configurationKeys', 'actorHash', 'sessionHash', 'platform',
  'providerId', 'offersCount', 'freshnessType', 'latencyMs', 'errorCode',
  'merchantId', 'score', 'rankingVersion', 'features',
  'linkId', 'kind', 'depth', 'guestDepth', 'authenticatedDepth', 'authRequiredAt', 'paramsPreserved', 'paramsDropped',
  'trackingPresent', 'trackingNetwork', 'expiresAt', 'confidence', 'urlHash',
  'status', 'method', 'ms', 'detail',
])

const PII_RE = /[\w.+-]+@[\w-]+\.[\w-]{2,}|\+?\d[\d\s().-]{7,}\d|https?:\/\//i

export type CommerceEventWriter = (entry: Record<string, unknown>) => void

let writer: CommerceEventWriter = entry => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry))
}

/** Replace the writer (tests; later the shared observability sink). */
export function setCommerceEventWriter(w: CommerceEventWriter | null): void {
  writer = w ?? (entry => { console.log(JSON.stringify(entry)) })
}

// Opaque identifiers the platform generates itself (UUIDs, sha256 prefixes). A UUID whose last
// group happens to be all digits ("…-446655440000") would otherwise trip the phone-number shape
// in PII_RE and the event would lose its correlation key. These are never user-entered.
const OPAQUE_ID_FIELDS = new Set(['requestId', 'linkId', 'actorHash', 'sessionHash'])

/** Strip unknown fields and refuse values that look like PII or a raw URL. */
export function sanitizeCommerceEvent(event: CommerceEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(event)) {
    if (!COMMERCE_EVENT_FIELDS.has(k)) continue
    if (typeof v === 'string' && !OPAQUE_ID_FIELDS.has(k) && PII_RE.test(v)) continue
    if (Array.isArray(v) && v.some(x => typeof x === 'string' && PII_RE.test(x))) continue
    out[k] = v
  }
  return out
}

export function emitCommerceEvent(event: CommerceEvent, now: Date = new Date()): void {
  const entry = {
    ...sanitizeCommerceEvent(event),
    severity: COMMERCE_EVENT_SEVERITY[event.type],
    component: 'ccp',
    ts: now.toISOString(),
  }
  try {
    writer(entry)
  } catch {
    /* observability must never break a request */
  }
}
