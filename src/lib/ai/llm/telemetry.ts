import type { CapabilityKey } from './capabilities'
import type { ModelRole } from './types'

// ── Telemetry Contract ───────────────────────────────────────────────────────
// One normalized event shape for every AI-layer call, so cost/latency/success
// can be measured and compared across providers once more than one exists.
// This sprint only DEFINES and VALIDATES the shape — see golden.test.ts.
// Nothing persists these events or renders a dashboard; they're a `console.log`
// line only. Business-level logging already present at call sites (e.g. the
// chat route's own `tappyai_usage` log) is untouched — this is a second,
// provider/role-normalized event emitted by the layer itself.
//
// Purely additive observability: emitting this never changes a call's return
// value, timing (beyond a negligible synchronous log write), or error
// propagation to the caller — see ai.ts, where it is always attached via
// `.then()` on a promise that is still returned to the caller unmodified, or
// (for a resolution-time failure) via a try/catch that re-throws the same
// error object unchanged.
export interface AITelemetryEvent {
  requestId: string
  role: ModelRole
  capability: CapabilityKey[]
  provider: string
  model: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  /** Sprint 5: computed via costCalculator.ts from the Pricing Catalog.
   * undefined (key omitted from the logged JSON, since JSON.stringify drops
   * undefined properties) whenever this provider/model has no catalog entry
   * — e.g. Gemini today. NEVER throws to get here; an unpriceable call is
   * simply unpriced, not a telemetry failure. See ADR-014. */
  estimatedCost?: number
  /** PRICING_CATALOG_VERSION at the moment this event's cost was computed.
   * Present only alongside a defined estimatedCost. */
  pricingVersion?: string
  /** Always 'catalog' when present — no live pricing API exists (Owner
   * Architecture Principle: pricing data is not source of truth; nothing
   * here fetches pricing online). Present only alongside a defined
   * estimatedCost. */
  pricingSource?: 'catalog'
  success: boolean
  /** The failing error's `.name` (e.g. 'UnsupportedCapabilityError'), or null on success. */
  errorCode: string | null
  /** Always 0 today — no retry logic exists anywhere in the AI layer. */
  retryCount: number
  method: 'generate' | 'stream' | 'vision'
  /** Beyond the Step-4 checklist; kept for local debugging only. */
  finishReason?: string | null
}

export function emitTelemetry(evt: AITelemetryEvent): void {
  try {
    console.log(JSON.stringify({ type: 'ai_platform_telemetry', ...evt }))
  } catch {
    // Telemetry must never be able to affect the caller.
  }
}

/** Correlates every log line for a single AI-layer call. Purely internal —
 * never returned to or accepted from business code. */
export function generateRequestId(): string {
  const c: { randomUUID?: () => string } | undefined = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // Fallback for a runtime without Web Crypto — still unique enough for log correlation.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
