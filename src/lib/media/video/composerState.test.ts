import { describe, it, expect } from 'vitest'
import { flowReducer, INITIAL_FLOW, mapUploadError, mapPublishError, phaseForServerState, isPolling, isRetryable, newIdempotencyKey, type FlowState, type FlowEvent } from './composerState'

const run = (events: FlowEvent[], from: FlowState = INITIAL_FLOW) => events.reduce(flowReducer, from)

describe('composer flow reducer', () => {
  it('walks the happy path: start, session, progress, uploaded, processing, ready, published', () => {
    let s = run([{ type: 'start' }])
    expect(s.phase).toBe('preparing')
    s = run([{ type: 'session', assetId: 'a1' }, { type: 'progress', pct: 42.4 }], s)
    expect(s).toMatchObject({ phase: 'uploading', assetId: 'a1', progress: 42 })
    s = run([{ type: 'uploaded' }], s)
    expect(s.phase).toBe('finishing')
    s = run([{ type: 'status', state: 'processing' }], s)
    expect(s.phase).toBe('processing')
    s = run([{ type: 'status', state: 'moderating' }], s)
    expect(s.phase).toBe('processing')
    s = run([{ type: 'status', state: 'review_required' }], s)
    expect(s.phase).toBe('review')
    s = run([{ type: 'status', state: 'ready' }], s)
    expect(s.phase).toBe('ready')
    s = run([{ type: 'status', state: 'published' }], s)
    expect(s.phase).toBe('published')
  })

  it('maps rejected, failed and deleted to their own phases and ignores unknown states', () => {
    const base: FlowState = { ...INITIAL_FLOW, phase: 'processing', assetId: 'a' }
    expect(run([{ type: 'status', state: 'rejected' }], base).phase).toBe('rejected')
    expect(run([{ type: 'status', state: 'failed' }], base).phase).toBe('failed')
    expect(run([{ type: 'status', state: 'deleted' }], base).phase).toBe('failed')
    expect(run([{ type: 'status', state: 'something_new' }], base).phase).toBe('processing')
    expect(phaseForServerState(undefined)).toBeNull()
  })

  it('a late status answer cannot bring a screen back after reset, an error or the consent dialog', () => {
    for (const phase of ['idle', 'consent', 'preparing', 'uploading', 'error'] as const) {
      const s: FlowState = { ...INITIAL_FLOW, phase }
      expect(flowReducer(s, { type: 'status', state: 'ready' }).phase).toBe(phase)
    }
    expect(run([{ type: 'status', state: 'ready' }], run([{ type: 'reset' }])).phase).toBe('idle')
  })

  it('progress is clamped and only counts while uploading', () => {
    const up: FlowState = { ...INITIAL_FLOW, phase: 'uploading' }
    expect(flowReducer(up, { type: 'progress', pct: 250 }).progress).toBe(100)
    expect(flowReducer(up, { type: 'progress', pct: -3 }).progress).toBe(0)
    expect(flowReducer({ ...INITIAL_FLOW, phase: 'processing' }, { type: 'progress', pct: 50 }).progress).toBe(0)
  })

  it('consent: required opens the dialog, declined returns to idle with a notice, a new start clears it', () => {
    let s = run([{ type: 'start' }, { type: 'consent_required' }])
    expect(s.phase).toBe('consent')
    s = run([{ type: 'consent_declined' }], s)
    expect(s).toMatchObject({ phase: 'idle', consentDeclined: true, assetId: null })
    expect(run([{ type: 'start' }], s).consentDeclined).toBe(false)
  })

  it('an error keeps the asset id and names its reason', () => {
    const s = run([{ type: 'start' }, { type: 'session', assetId: 'a' }, { type: 'error', error: 'network' }])
    expect(s).toMatchObject({ phase: 'error', error: 'network', assetId: 'a' })
  })
})

describe('mapUploadError: every documented code has a message', () => {
  const cases: [number, string | undefined, string][] = [
    [403, 'video_consent_required', 'consent'],
    // the OTHER gate (an iOS-era account that refused AI processing): accepting the clip conditions would not lift it, so it must NOT open the dialog again
    [403, 'ai_consent_required', 'failed'],
    [403, 'age_ineligible', 'age'],
    [413, undefined, 'tooLarge'],
    [415, undefined, 'type'],
    [422, 'unsupported_format', 'type'],
    [422, 'video_too_long', 'tooLong'],
    [422, 'unreadable_video', 'unreadable'],
    [422, 'identifying_metadata', 'metadata'],
    [429, undefined, 'rate'],
    [503, 'video_unavailable', 'unavailable'],
    [502, 'storage_unavailable', 'unavailable'],
    [409, 'asset_failed', 'failed'],
    [409, 'asset_deleted', 'failed'],
    [401, 'unauthorized', 'login'],
    [500, undefined, 'generic'],
  ]
  it.each(cases)('%s %s -> %s', (status, code, want) => { expect(mapUploadError(status, code)).toBe(want) })
  it('a 403 without a known code is not mistaken for consent', () => { expect(mapUploadError(403, 'nope')).toBe('generic') })
  it('only transient errors are retryable', () => {
    expect(isRetryable('network')).toBe(true)
    expect(isRetryable('tooLarge')).toBe(false)
    expect(isRetryable(null)).toBe(false)
  })
})

describe('mapPublishError', () => {
  it('maps the five documented codes and nothing else', () => {
    expect(mapPublishError('video_not_ready')).toBe('notReady')
    expect(mapPublishError('video_in_use')).toBe('inUse')
    expect(mapPublishError('video_promoting')).toBe('promoting')
    expect(mapPublishError('video_unavailable')).toBe('unavailable')
    expect(mapPublishError('video_not_found')).toBe('notFound')
    expect(mapPublishError('already_reviewed')).toBeNull()
  })
})

describe('newIdempotencyKey', () => {
  it('is 8..128 chars of the allowed alphabet and different each time', () => {
    const a = newIdempotencyKey(); const b = newIdempotencyKey()
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,128}$/)
    expect(a).not.toBe(b)
  })
  it('works without webcrypto', () => {
    const real = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try { expect(newIdempotencyKey(() => 0.5, () => 1)).toMatch(/^[A-Za-z0-9_-]{8,128}$/) }
    finally { Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true }) }
  })
  it('polling covers exactly processing and review', () => {
    expect(isPolling('processing')).toBe(true)
    expect(isPolling('review')).toBe(true)
    expect(isPolling('ready')).toBe(false)
  })
})
