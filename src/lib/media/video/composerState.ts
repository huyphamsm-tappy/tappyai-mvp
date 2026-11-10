// Explore video, web composer: the pure part of the new upload flow. No network, no React: the state machine (a reducer), the mapping of every documented
// error code to a localized message key, and the mapping of the server's asset state to what the person sees. The hook that drives it is
// src/components/video/useVideoComposerFlow.ts.

export type FlowPhase =
  | 'idle'
  | 'preparing' // neutralising metadata, opening the session
  | 'consent' // the AI-consent dialog is open
  | 'uploading'
  | 'finishing' // /complete
  | 'processing' // uploading/uploaded/processing/moderating on the server
  | 'review' // review_required
  | 'ready'
  | 'published'
  | 'rejected'
  | 'failed' // the server says failed / deleted
  | 'error' // a request failed; `error` says why

export type FlowErrorKey =
  | 'tooLarge' | 'type' | 'tooLong' | 'unreadable' | 'metadata' | 'rate' | 'unavailable' | 'failed' | 'login' | 'network' | 'generic'

export interface FlowState {
  phase: FlowPhase
  assetId: string | null
  /** Upload progress, 0..100. */
  progress: number
  error: FlowErrorKey | null
  /** The person declined AI review in the consent dialog (shown as a calm notice, not an error). */
  consentDeclined: boolean
}

export const INITIAL_FLOW: FlowState = { phase: 'idle', assetId: null, progress: 0, error: null, consentDeclined: false }

export type FlowEvent =
  | { type: 'start' }
  | { type: 'consent_required' }
  | { type: 'consent_declined' }
  | { type: 'session'; assetId: string }
  | { type: 'progress'; pct: number }
  | { type: 'uploaded' }
  | { type: 'status'; state: string; assetId?: string }
  | { type: 'error'; error: FlowErrorKey }
  | { type: 'reset' }

/** What the person sees for the server's asset state (contract §1). null = a state this client does not know: ignored. */
export function phaseForServerState(state: unknown): FlowPhase | null {
  switch (state) {
    case 'draft': case 'uploading': case 'uploaded': case 'processing': case 'moderating': return 'processing'
    case 'review_required': return 'review'
    case 'ready': return 'ready'
    case 'published': return 'published'
    case 'rejected': return 'rejected'
    case 'failed': case 'deleted': return 'failed'
    default: return null
  }
}

/** Phases in which the poll is running: the video can still move on its own. */
export function isPolling(phase: FlowPhase): boolean {
  return phase === 'processing' || phase === 'review'
}

/** Phases in which the server's state can still change what we show. After reset / error / consent a late answer must not bring a screen back. */
function acceptsStatus(phase: FlowPhase): boolean {
  return phase === 'finishing' || phase === 'processing' || phase === 'review' || phase === 'ready'
}

export function flowReducer(state: FlowState, ev: FlowEvent): FlowState {
  switch (ev.type) {
    case 'start':
      return { phase: 'preparing', assetId: null, progress: 0, error: null, consentDeclined: false }
    case 'consent_required':
      return { ...state, phase: 'consent', error: null }
    case 'consent_declined':
      return { ...INITIAL_FLOW, consentDeclined: true }
    case 'session':
      return { ...state, phase: 'uploading', assetId: ev.assetId, progress: 0 }
    case 'progress':
      return state.phase === 'uploading' ? { ...state, progress: Math.max(0, Math.min(100, Math.round(ev.pct))) } : state
    case 'uploaded':
      return state.phase === 'uploading' ? { ...state, phase: 'finishing', progress: 100 } : state
    case 'status': {
      if (!acceptsStatus(state.phase)) return state
      const next = phaseForServerState(ev.state)
      if (!next) return state
      return { ...state, phase: next, assetId: ev.assetId ?? state.assetId }
    }
    case 'error':
      return { ...state, phase: 'error', error: ev.error }
    case 'reset':
      return INITIAL_FLOW
  }
}

export type UploadErrorClass = FlowErrorKey | 'consent' | 'age'

/** Every documented error of POST /api/video/uploads, PUT, /complete and the status poll, as one localized key (or a special class). */
export function mapUploadError(status: number, code: string | undefined): UploadErrorClass {
  // The clip conditions were not accepted yet: the consent dialog. (`ai_consent_required` is the OTHER gate: an iOS-era account that refused AI processing; accepting the clip
  // conditions would not lift it, so it is a plain failure here and the dialog must not loop.)
  if (status === 403 && code === 'video_consent_required') return 'consent'
  if (status === 403 && code === 'ai_consent_required') return 'failed'
  if (status === 403 && (code === 'age_verification_required' || code === 'age_ineligible' || code === 'age_declaration_required')) return 'age'
  switch (code) {
    case 'video_too_long': return 'tooLong'
    case 'unreadable_video': return 'unreadable'
    case 'identifying_metadata': return 'metadata'
    case 'unsupported_format': return 'type'
    case 'video_unavailable': case 'storage_unavailable': return 'unavailable'
    case 'asset_failed': case 'asset_deleted': return 'failed'
    case 'unauthorized': return 'login'
  }
  if (status === 401) return 'login'
  if (status === 413) return 'tooLarge'
  if (status === 415) return 'type'
  if (status === 429) return 'rate'
  if (status === 503 || status === 502) return 'unavailable'
  if (status === 409) return 'failed'
  return 'generic'
}

/** A retry of the same file can help (a new idempotency key is used each time). */
export function isRetryable(error: FlowErrorKey | null): boolean {
  return error === 'network' || error === 'unavailable' || error === 'rate' || error === 'generic'
}

export type PublishErrorKey = 'notReady' | 'inUse' | 'promoting' | 'unavailable' | 'notFound'

/** The documented errors of POST /api/reviews with videoAssetId. null = not a video error (the composer's own message applies). */
export function mapPublishError(code: unknown): PublishErrorKey | null {
  switch (code) {
    case 'video_not_ready': return 'notReady'
    case 'video_in_use': return 'inUse'
    case 'video_promoting': return 'promoting'
    case 'video_unavailable': return 'unavailable'
    case 'video_not_found': return 'notFound'
    default: return null
  }
}

/** A fresh idempotency key: 8..128 of [A-Za-z0-9_-]. Never reused for a new attempt. */
export function newIdempotencyKey(random: () => number = Math.random, now: () => number = Date.now): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  const cryptoObj = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function' ? crypto : null
  if (cryptoObj) {
    const bytes = new Uint8Array(24)
    cryptoObj.getRandomValues(bytes)
    for (const b of bytes) out += alphabet[b % alphabet.length]
  } else {
    for (let i = 0; i < 24; i++) out += alphabet[Math.floor(random() * alphabet.length)]
  }
  return `v${now().toString(36)}_${out}`
}
