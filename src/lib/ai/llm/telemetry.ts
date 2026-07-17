import type { CapabilityKey } from './capabilities'
import type { ModelRole } from './types'

// ── Telemetry Contract — one event shape for every AI-layer call ────────────
// Purely additive observability: emitting this never changes a call's return
// value, timing (beyond a negligible synchronous log write), or error
// propagation to the caller. Business-level logging already present at call
// sites (e.g. the chat route's own `tappyai_usage` log) is untouched — this
// is a second, provider/role-normalized event emitted by the layer itself so
// cost/latency can be compared across providers once more than one exists.
export interface AITelemetryEvent {
  event: 'ai_call'
  method: 'generate' | 'stream' | 'vision'
  providerId: string
  role: ModelRole
  model: string
  capabilities: CapabilityKey[]
  ok: boolean
  elapsedMs: number
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  finishReason?: string | null
}

export function emitTelemetry(evt: AITelemetryEvent): void {
  try {
    console.log(JSON.stringify({ type: 'ai_platform_telemetry', ...evt }))
  } catch {
    // Telemetry must never be able to affect the caller.
  }
}
