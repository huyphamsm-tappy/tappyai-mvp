// ── Observability event vocabulary ───────────────────────────────────────────
//
// The COMPLETE set of things this application is allowed to send to Cloud
// Logging. Nothing else can be sent, because `log()` accepts this union and
// nothing wider.
//
// That is the whole privacy design, and it is deliberately structural rather
// than procedural. A sink that accepted `Record<string, unknown>` would be one
// careless call site away from shipping a prompt, an utterance or a memory
// blob to a log bucket — and that mistake is invisible in review, because the
// call site looks identical to a safe one. Here the mistake does not compile:
// there is no variant with a free-form field, and every field below is a
// number, a boolean, or a string drawn from a closed vocabulary.
//
// Adding a field is therefore a deliberate act that shows up in a diff on THIS
// file, where the rule can be applied: operational facts only. No prompts, no
// user content, no TTS text, no credentials, no tokens, no identifiers that
// resolve back to a person.

/** Severity levels this app emits. Mapped to Cloud Logging's LogSeverity. */
export type EventSeverity = 'INFO' | 'WARNING' | 'ERROR'

/**
 * Per-chat-turn model accounting — the record the cost model is built from.
 *
 * Mirrors the existing `tappyai_usage` console line field-for-field so the two
 * can be reconciled during rollout and the console line can later be dropped
 * without losing a measurement.
 *
 * `intent` and `finishReason` are model/router vocabulary, not user text.
 */
export interface UsageEvent {
  type: 'tappyai_usage'
  intent: string
  finishReason: string
  /** Anthropic reports this EXCLUDING cached tokens — never read it alone as "prompt size". */
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  /** null (not 0) when the provider reported no cache metadata at all. */
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  llmCalls: number | null
  memoryExtract: number
  toolCalls: number
  elapsedMs: number
}

/**
 * A snapshot of TTS counters. `charactersSynthesized` is the figure Cloud TTS
 * actually bills on, which is the only reason this event exists: Chirp3-HD is
 * free to 1M characters/month and $30/M after, so the decision about whether a
 * persistent cache is worth building has to be made from a measured number.
 *
 * A snapshot, not a per-utterance event — one utterance per log line would be
 * both noisier and closer to user content than anything here needs to be.
 */
export interface TtsMetricsEvent {
  type: 'tts_metrics'
  requests: number
  cacheHits: number
  cacheMisses: number
  charactersSynthesized: number
  errors: number
  /** Share of requests served without calling the provider, 0..1. */
  hitRate: number
  avgSynthesisMs: number
}

/** A TTS synthesis that failed. Carries no utterance and no voice text. */
export interface TtsFailureEvent {
  type: 'tts_failure'
  /** Where it broke: 'auth' | 'synthesis' | 'decode' — a closed vocabulary, not a message. */
  stage: string
  /** Provider HTTP status where there was a response at all. */
  status?: number
  /** BCP-47-ish language tag chosen by content detection, e.g. 'vi' | 'en'. */
  language?: string
}

/** A media upload/read that failed. Carries no object key and no owner id. */
export interface MediaFailureEvent {
  type: 'media_failure'
  /** 'put' | 'session' | 'read' */
  operation: string
  /** Provider id, e.g. 'gcs'. */
  provider: string
  status?: number
  /** Upload kind from MEDIA_UPLOAD_POLICIES, e.g. 'video' — a policy name, not a filename. */
  kind?: string
}

/**
 * A Workload Identity Federation leg that failed.
 *
 * `reason` is Google's own machine-readable refusal (e.g. "unauthorized_client:
 * The given credential is rejected by the attribute condition."). It is safe:
 * `gcpAuth` bounds it and Google's STS error envelope never echoes the subject
 * token. It is also the single most useful field here — without it, "sts stage,
 * HTTP 400" is indistinguishable from a mistyped pool id.
 */
export interface WifFailureEvent {
  type: 'wif_failure'
  /** 'oidc' | 'sts' | 'impersonation' */
  stage: string
  status?: number
  reason?: string
  /** Which identity source the deployment had: 'header' | 'env' | 'none'. Booleans about presence only. */
  identitySource?: string
}

/** The AI provider refused, errored or timed out. Carries no prompt and no completion. */
export interface AiProviderFailureEvent {
  type: 'ai_provider_failure'
  /** Active provider id from the registry, e.g. 'claude'. */
  providerId: string
  /** Semantic role: 'fast' | 'smart' | 'planning' | 'vision'. */
  role: string
  status?: number
  /** Error class name, e.g. 'RateLimitError'. Not the message. */
  kind?: string
}

/** A request that ended in an error status. Route is the app's own path pattern, never a query string. */
export interface RequestErrorEvent {
  type: 'request_error'
  route: string
  status: number
  /** Application error code, e.g. 'rate_limit'. A code, never a user-facing message. */
  code?: string
}

/** Anything operational that does not fit above. `scope` and `code` are both closed vocabularies. */
export interface SystemErrorEvent {
  type: 'system_error'
  scope: string
  code: string
}

export type ObservabilityEvent =
  | UsageEvent
  | TtsMetricsEvent
  | TtsFailureEvent
  | MediaFailureEvent
  | WifFailureEvent
  | AiProviderFailureEvent
  | RequestErrorEvent
  | SystemErrorEvent

/**
 * Severity per event type.
 *
 * Kept as a lookup rather than a field on the event so a call site cannot
 * downgrade a failure to INFO — severity is a property of the KIND of thing
 * that happened, not something the caller gets to choose.
 */
const SEVERITY: Record<ObservabilityEvent['type'], EventSeverity> = {
  tappyai_usage: 'INFO',
  tts_metrics: 'INFO',
  tts_failure: 'ERROR',
  media_failure: 'ERROR',
  wif_failure: 'ERROR',
  ai_provider_failure: 'ERROR',
  request_error: 'ERROR',
  system_error: 'ERROR',
}

export function severityOf(event: ObservabilityEvent): EventSeverity {
  return SEVERITY[event.type]
}

/** Every event type, for tests that must prove the map is exhaustive. */
export const EVENT_TYPES = Object.keys(SEVERITY) as ObservabilityEvent['type'][]

/**
 * Every field name allowed to leave this process, and the ONLY reason the sink
 * can be trusted at runtime.
 *
 * The union above is a compile-time guarantee, and a compile-time guarantee is
 * exactly one `as` cast away from being no guarantee at all — a value crossing
 * a JSON boundary, or a call site that casts to silence an error, would spread
 * whatever it happens to hold straight onto the wire. The sink therefore does
 * not spread events; it PROJECTS them through this set, so a field nobody
 * listed here cannot be transmitted whatever the caller does.
 *
 * Adding a name is the review gate. Operational facts only: counters, closed
 * vocabularies, status codes. Never a prompt, an utterance, an object key, an
 * identifier that resolves to a person, or any free-form string.
 */
export const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  'type',
  // model accounting — counters only
  'intent', 'finishReason', 'promptTokens', 'completionTokens', 'totalTokens',
  'cacheReadTokens', 'cacheCreationTokens', 'llmCalls', 'memoryExtract', 'toolCalls', 'elapsedMs',
  // tts counters — charactersSynthesized is a COUNT, never the characters
  'requests', 'cacheHits', 'cacheMisses', 'charactersSynthesized', 'errors', 'hitRate', 'avgSynthesisMs',
  // closed vocabularies and status codes
  'stage', 'status', 'language', 'operation', 'provider', 'kind', 'reason', 'identitySource',
  'providerId', 'role', 'route', 'code', 'scope', 'dropped',
])

/**
 * Projects an event onto the allow-list.
 *
 * Total by construction: a non-object, a null, or a value carrying getters that
 * throw yields `{}` rather than propagating — a sanitizer that can fail is a
 * sanitizer that gets bypassed at exactly the wrong moment.
 */
export function sanitizePayload(event: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!event || typeof event !== 'object') return out
  for (const [k, v] of Object.entries(event as Record<string, unknown>)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(k)) continue
    if (v === undefined) continue
    // Only primitives cross the boundary. A nested object could carry anything.
    const t = typeof v
    if (v === null || t === 'string' || t === 'number' || t === 'boolean') out[k] = v
  }
  return out
}
