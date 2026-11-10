// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useVideoComposerFlow, type VideoFlowDeps } from './useVideoComposerFlow'

afterEach(cleanup)

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>
function router(handlers: Record<string, Handler | Handler[]>) {
  const calls: { url: string; method: string; body?: string }[] = []
  const queues: Record<string, Handler[]> = {}
  for (const [k, v] of Object.entries(handlers)) queues[k] = Array.isArray(v) ? [...v] : [v]
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
    const key = `${method} ${url.replace(/\/[0-9a-f-]{8,}(?=\/|$)/g, '/:id')}`
    const q = queues[key]
    if (!q) throw new Error(`unrouted ${key}`)
    const h = q.length > 1 ? q.shift()! : q[0]
    const r = await h(url, init)
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const file = () => new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' })
const ID = 'a1b2c3d4-0000-0000-0000-000000000001'
const base = (extra: Partial<VideoFlowDeps> = {}): VideoFlowDeps => ({
  neutralize: async f => f,
  sleep: async () => {},
  pollMs: 5,
  putBytes: vi.fn(async (_u, _f, _c, o) => { o.onProgress?.(50); o.onProgress?.(100); return { readable: false, status: 0 } }),
  ...extra,
})
const created: Handler = () => ({ status: 200, body: { assetId: ID, state: 'uploading', uploadUrl: 'https://storage.example/up', contentType: 'video/mp4' } })

describe('useVideoComposerFlow', () => {
  it('answers off on 404 and changes nothing (the old path takes over)', async () => {
    const { fetchImpl, calls } = router({ 'POST /api/video/uploads': () => ({ status: 404, body: { error: 'not_found' } }) })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    let r: string | undefined
    await act(async () => { r = await result.current.start(file()) })
    expect(r).toBe('off')
    expect(result.current.state.phase).toBe('idle')
    expect(result.current.state.error).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('uploads, completes and polls up to ready, with progress and a fresh key per attempt', async () => {
    const { fetchImpl, calls } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { assetId: ID, state: 'processing' } }),
      'GET /api/video/uploads/:id': [() => ({ status: 200, body: { state: 'moderating' } }), () => ({ status: 200, body: { state: 'ready' } })],
    })
    const deps = base({ fetchImpl })
    const { result } = renderHook(() => useVideoComposerFlow(deps))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(result.current.state.assetId).toBe(ID)
    expect(deps.putBytes).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(calls[0].body!)
    expect(sent).toMatchObject({ contentType: 'video/mp4', size: 10 })
    expect(sent.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/)
  })

  it('stops polling once ready, and never polls after unmount', async () => {
    let polls = 0
    const { fetchImpl } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { state: 'processing' } }),
      'GET /api/video/uploads/:id': () => { polls++; return { status: 200, body: { state: 'processing' } } },
    })
    const { result, unmount } = renderHook(() => useVideoComposerFlow(base({ fetchImpl, pollMs: 5 })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(polls).toBeGreaterThan(1))
    unmount()
    const after = polls
    await new Promise(r => setTimeout(r, 60))
    expect(polls).toBeLessThanOrEqual(after + 1) // at most the request already in flight
  })

  it('shows review_required, then rejected', async () => {
    const { fetchImpl } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { state: 'processing' } }),
      'GET /api/video/uploads/:id': [() => ({ status: 200, body: { state: 'review_required' } }), () => ({ status: 200, body: { state: 'rejected' } })],
    })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('rejected'))
  })

  it.each([
    [413, undefined, 'tooLarge'],
    [415, undefined, 'type'],
    [429, undefined, 'rate'],
    [503, 'video_unavailable', 'unavailable'],
    [409, 'asset_failed', 'failed'],
  ])('creating the session: %s %s shows %s', async (status, code, key) => {
    const { fetchImpl } = router({ 'POST /api/video/uploads': () => ({ status, body: { error: code } }) })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    expect(result.current.state).toMatchObject({ phase: 'error', error: key })
  })

  it.each([
    ['video_too_long', 'tooLong'],
    ['unreadable_video', 'unreadable'],
    ['identifying_metadata', 'metadata'],
    ['unsupported_format', 'type'],
  ])('/complete 422 %s shows %s', async (code, key) => {
    const { fetchImpl } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': () => ({ status: 422, body: { error: code } }),
    })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('error'))
    expect(result.current.state.error).toBe(key)
  })

  it('upload_incomplete re-sends the bytes once and then completes', async () => {
    const { fetchImpl } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': [() => ({ status: 422, body: { error: 'upload_incomplete' } }), () => ({ status: 200, body: { state: 'processing' } })],
      'GET /api/video/uploads/:id': () => ({ status: 200, body: { state: 'ready' } }),
    })
    const deps = base({ fetchImpl })
    const { result } = renderHook(() => useVideoComposerFlow(deps))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(deps.putBytes).toHaveBeenCalledTimes(2)
  })

  it('retries /complete on a 502 storage_unavailable', async () => {
    const { fetchImpl } = router({
      'POST /api/video/uploads': created,
      'POST /api/video/uploads/:id/complete': [() => ({ status: 502, body: { error: 'storage_unavailable' } }), () => ({ status: 200, body: { state: 'processing' } })],
      'GET /api/video/uploads/:id': () => ({ status: 200, body: { state: 'ready' } }),
    })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
  })

  it('retries a thrown PUT, then reports a network error and retry() uses a NEW key', async () => {
    const put = vi.fn(async () => { throw new TypeError('offline') })
    const { fetchImpl, calls } = router({ 'POST /api/video/uploads': created })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl, putBytes: put as never })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.error).toBe('network'))
    expect(put).toHaveBeenCalledTimes(3)
    await act(async () => { result.current.retry() })
    await waitFor(() => expect(calls.filter(c => c.url === '/api/video/uploads')).toHaveLength(2))
    const keys = calls.filter(c => c.url === '/api/video/uploads').map(c => JSON.parse(c.body!).idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('a reused asset (no uploadUrl) skips the PUT and goes to /complete', async () => {
    const { fetchImpl } = router({
      'POST /api/video/uploads': () => ({ status: 200, body: { assetId: ID, state: 'processing', reused: true } }),
      'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { state: 'ready' } }),
    })
    const deps = base({ fetchImpl })
    const { result } = renderHook(() => useVideoComposerFlow(deps))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
    expect(deps.putBytes).not.toHaveBeenCalled()
  })

  it('consent required opens the consent state; accepting records it and restarts; the retry succeeds', async () => {
    const { fetchImpl, calls } = router({
      'POST /api/video/uploads': [() => ({ status: 403, body: { error: 'video_consent_required' } }), created],
      'POST /api/video/consent': () => ({ status: 200, body: { accepted: true } }),
      'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { state: 'processing' } }),
      'GET /api/video/uploads/:id': () => ({ status: 200, body: { state: 'ready' } }),
    })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    expect(result.current.state.phase).toBe('consent')
    expect(calls).toHaveLength(1)
    await act(async () => { await result.current.acceptConsent() })
    const consent = calls.find(c => c.url === '/api/video/consent')!
    expect(JSON.parse(consent.body!)).toEqual({ accepted: true, version: 1 })
    await waitFor(() => expect(result.current.state.phase).toBe('ready'))
  })

  it('a failed consent write stays in the consent state with an error and does not upload', async () => {
    const { fetchImpl, calls } = router({
      'POST /api/video/uploads': () => ({ status: 403, body: { error: 'video_consent_required' } }),
      'POST /api/video/consent': () => ({ status: 500, body: {} }),
    })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    await act(async () => { await result.current.acceptConsent() })
    expect(result.current.state.phase).toBe('consent')
    expect(result.current.consentError).toBe(true)
    expect(calls.filter(c => c.url === '/api/video/uploads')).toHaveLength(1)
  })

  it('declining leaves the composer idle without posting anything', async () => {
    const { fetchImpl, calls } = router({ 'POST /api/video/uploads': () => ({ status: 403, body: { error: 'video_consent_required' } }) })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl })))
    await act(async () => { await result.current.start(file()) })
    act(() => result.current.declineConsent())
    expect(result.current.state).toMatchObject({ phase: 'idle', consentDeclined: true })
    expect(calls).toHaveLength(1)
  })

  it('an 18+ refusal calls onAgeGate and resets', async () => {
    const onAgeGate = vi.fn()
    const { fetchImpl } = router({ 'POST /api/video/uploads': () => ({ status: 403, body: { error: 'age_verification_required' } }) })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl, onAgeGate })))
    await act(async () => { await result.current.start(file()) })
    expect(onAgeGate).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe('idle')
  })

  it('cancel aborts the upload and a late answer does not revive the screen', async () => {
    let release: (v: { readable: boolean; status: number }) => void = () => {}
    const put = vi.fn(() => new Promise<{ readable: boolean; status: number }>(r => { release = r }))
    const { fetchImpl } = router({ 'POST /api/video/uploads': created, 'POST /api/video/uploads/:id/complete': () => ({ status: 200, body: { state: 'ready' } }) })
    const { result } = renderHook(() => useVideoComposerFlow(base({ fetchImpl, putBytes: put as never })))
    await act(async () => { await result.current.start(file()) })
    await waitFor(() => expect(put).toHaveBeenCalled())
    act(() => result.current.cancel())
    await act(async () => { release({ readable: false, status: 0 }); await new Promise(r => setTimeout(r, 20)) })
    expect(result.current.state.phase).toBe('idle')
  })
})
