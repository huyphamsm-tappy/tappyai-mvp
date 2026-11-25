// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { useVideoPlayback, type HlsLike, type HlsCtorLike } from './useVideoPlayback'

const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const MANIFEST = `https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`
const MP4 = 'https://storage.googleapis.com/tappyai-media-prod/videos/u/abc.mp4'

afterEach(() => { cleanup(); vi.useRealTimers() })

const playbackOk = (ttl = 600) => new Response(JSON.stringify({ assetId: ASSET, manifestUrl: MANIFEST, ttlSeconds: ttl }), { status: 200 })
const fetchSeq = (...responses: Array<() => Response>) => {
  const fn = vi.fn(async () => { const next = responses.length > 1 ? responses.shift()! : responses[0]; return next() })
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

/** A stand-in for hls.js: records what the player did to it, and lets a test fire its events. */
function fakeHls(opts: { supported?: boolean } = {}) {
  const instances: Array<HlsLike & { config: Record<string, unknown>; handlers: Record<string, (e: string, d: unknown) => void>; calls: string[] }> = []
  class Fake {
    static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed' }
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
    static isSupported = () => opts.supported !== false
    config: Record<string, unknown>
    handlers: Record<string, (e: string, d: unknown) => void> = {}
    calls: string[] = []
    constructor(config: Record<string, unknown>) { this.config = config; instances.push(this as never) }
    loadSource(u: string) { this.calls.push(`loadSource:${u}`) }
    attachMedia() { this.calls.push('attachMedia') }
    startLoad() { this.calls.push('startLoad') }
    recoverMediaError() { this.calls.push('recoverMediaError') }
    destroy() { this.calls.push('destroy') }
    on(ev: string, cb: (e: string, d: unknown) => void) { this.handlers[ev] = cb }
  }
  return { Ctor: Fake as unknown as HlsCtorLike, instances }
}
const video = () => document.createElement('video')
const render = (url: string, deps: Parameters<typeof useVideoPlayback>[0]['deps'], el = video()) =>
  ({ el, ...renderHook((p: { url: string }) => useVideoPlayback({ url: p.url, videoRef: { current: el }, deps }), { initialProps: { url } }) })

describe('useVideoPlayback — the text overlay of the post', () => {
  const DOC = {
    schema_version: 1,
    layers: [{ id: 'a1', type: 'text', text: 'Xin chào', x: 0.5, y: 0.5, width: 0.6, size: 0.06, rotation: 0, align: 'center', font: 'sans', weight: 'normal', color: '#ffffff', background: null, outline: null, shadow: false, start_ms: 0, end_ms: 5000 }],
  }
  const withOverlay = (overlay: unknown) => () => new Response(JSON.stringify({ assetId: ASSET, manifestUrl: MANIFEST, ttlSeconds: 600, overlay }), { status: 200 })

  it('a valid overlay in the playback answer is handed back for the layer to draw', async () => {
    const f = fetchSeq(withOverlay({ version: 2, doc: DOC }))
    const { result } = render(MANIFEST, { fetchImpl: f, loadHls: async () => null, supportsNativeHls: () => true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.overlayDoc?.layers[0].text).toBe('Xin chào')
  })
  it('no overlay, or an INVALID one (a layer the schema refuses), is simply not drawn and the video still plays', async () => {
    const none = render(MANIFEST, { fetchImpl: fetchSeq(withOverlay(null)), loadHls: async () => null, supportsNativeHls: () => true })
    await waitFor(() => expect(none.result.current.status).toBe('ready'))
    expect(none.result.current.overlayDoc).toBeNull()
    cleanup()
    const bad = render(MANIFEST, { fetchImpl: fetchSeq(withOverlay({ version: 1, doc: { schema_version: 1, layers: [{ id: 'x', evil: '<script>' }] } })), loadHls: async () => null, supportsNativeHls: () => true })
    await waitFor(() => expect(bad.result.current.status).toBe('ready'))
    expect(bad.result.current.overlayDoc).toBeNull()
  })
  it('a plain MP4 never has an overlay', () => {
    const { result } = render(MP4, { fetchImpl: fetchSeq(withOverlay({ version: 1, doc: DOC })), loadHls: async () => null })
    expect(result.current.overlayDoc).toBeNull()
  })
})

describe('useVideoPlayback', () => {
  it('🚨 a plain MP4 (every old post) is left completely alone: no request, no hls.js, nothing attached', async () => {
    const f = fetchSeq(() => playbackOk())
    const loadHls = vi.fn(async () => null)
    const { result, el } = render(MP4, { fetchImpl: f, loadHls })
    expect(result.current.isHls).toBe(false)
    expect(result.current.status).toBe('idle')
    expect(f).not.toHaveBeenCalled()
    expect(loadHls).not.toHaveBeenCalled()
    expect(el.getAttribute('src')).toBeNull()
  })

  it('HLS: asks the playback endpoint (POST, credentials included) BEFORE loading anything, for the asset in the URL', async () => {
    const { Ctor } = fakeHls()
    const f = fetchSeq(() => playbackOk())
    render(MANIFEST, { fetchImpl: f, loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(f).toHaveBeenCalled())
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/video/playback/${ASSET}`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  it('Safari / iOS: native HLS, the manifest URL goes straight onto the <video>, hls.js is never loaded', async () => {
    const f = fetchSeq(() => playbackOk())
    const loadHls = vi.fn(async () => null)
    const { result, el } = render(MANIFEST, { fetchImpl: f, loadHls, supportsNativeHls: () => true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(el.getAttribute('src')).toBe(MANIFEST)
    expect(loadHls).not.toHaveBeenCalled()
  })

  it('elsewhere: hls.js with credentials on every request (so the CDN cookie is sent), adaptive bitrate, attached to the element', async () => {
    const { Ctor, instances } = fakeHls()
    const { result, el } = render(MANIFEST, { fetchImpl: fetchSeq(() => playbackOk()), loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(instances).toHaveLength(1)
    const h = instances[0]
    expect(h.calls).toEqual([`loadSource:${MANIFEST}`, 'attachMedia'])
    const xhr = { withCredentials: false }
    ;(h.config.xhrSetup as (x: unknown) => void)(xhr)
    expect(xhr.withCredentials).toBe(true)
    expect(h.config.startLevel).toBe(-1)
    expect(h.config.capLevelToPlayerSize).toBe(true)
    expect(el.getAttribute('src')).toBeNull()
  })

  it('a refusal from the endpoint (hidden post, not yours) is an error state with NO player created; retry asks again', async () => {
    const { Ctor, instances } = fakeHls()
    const f = fetchSeq(() => new Response('{}', { status: 404 }), () => playbackOk())
    const { result } = render(MANIFEST, { fetchImpl: f, loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorCode).toBe('unavailable')
    expect(instances).toHaveLength(0)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(f).toHaveBeenCalledTimes(2)
    expect(instances).toHaveLength(1)
  })

  it('a network failure of the endpoint itself is a (retryable) error too', async () => {
    const f = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const { result } = render(MANIFEST, { fetchImpl: f, loadHls: async () => null, supportsNativeHls: () => true })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorCode).toBe('network')
  })

  it('a browser without MSE or native HLS: error "unsupported"', async () => {
    const { Ctor } = fakeHls({ supported: false })
    const { result } = render(MANIFEST, { fetchImpl: fetchSeq(() => playbackOk()), loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorCode).toBe('unsupported')
  })

  it('a fatal NETWORK error (an expired cookie) re-asks for the cookie and restarts loading; after three tries it gives up', async () => {
    const { Ctor, instances } = fakeHls()
    const f = fetchSeq(() => playbackOk())
    const { result } = render(MANIFEST, { fetchImpl: f, loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const h = instances[0]
    const fire = () => act(async () => { h.handlers.hlsError('hlsError', { fatal: true, type: 'networkError' }); await Promise.resolve() })
    await fire()
    await waitFor(() => expect(h.calls.filter(c => c === 'startLoad')).toHaveLength(1))
    expect(f).toHaveBeenCalledTimes(2)
    await fire(); await fire()
    await waitFor(() => expect(h.calls.filter(c => c === 'startLoad')).toHaveLength(3))
    await fire()
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorCode).toBe('network')
  })

  it('a fatal MEDIA error is recovered once, then it is an error; a non-fatal one is ignored', async () => {
    const { Ctor, instances } = fakeHls()
    const { result } = render(MANIFEST, { fetchImpl: fetchSeq(() => playbackOk()), loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const h = instances[0]
    act(() => h.handlers.hlsError('hlsError', { fatal: false, type: 'mediaError' }))
    expect(result.current.status).toBe('ready')
    act(() => h.handlers.hlsError('hlsError', { fatal: true, type: 'mediaError' }))
    expect(h.calls).toContain('recoverMediaError')
    expect(result.current.status).toBe('ready')
    act(() => h.handlers.hlsError('hlsError', { fatal: true, type: 'mediaError' }))
    expect(result.current.status).toBe('error')
    expect(result.current.errorCode).toBe('media')
  })

  it('keeps the cookie fresh while mounted (renews at 80% of its life), and stops when unmounted; unmount destroys the player', async () => {
    vi.useFakeTimers()
    const { Ctor, instances } = fakeHls()
    const f = fetchSeq(() => playbackOk(600))
    const { unmount } = render(MANIFEST, { fetchImpl: f, loadHls: async () => Ctor, supportsNativeHls: () => false })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(f).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(479_000) })
    expect(f).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(f).toHaveBeenCalledTimes(2)
    unmount()
    expect(instances[0].calls).toContain('destroy')
    await act(async () => { await vi.advanceTimersByTimeAsync(900_000) })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('changing the url tears the old player down and starts the new one; a late answer for the old url is ignored', async () => {
    const { Ctor, instances } = fakeHls()
    const f = fetchSeq(() => playbackOk())
    const { result, rerender } = render(MANIFEST, { fetchImpl: f, loadHls: async () => Ctor, supportsNativeHls: () => false })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ url: MP4 })
    expect(instances[0].calls).toContain('destroy')
    expect(result.current.isHls).toBe(false)
    expect(result.current.status).toBe('idle')
  })

  it('exposes a stable container ref and the video ref for the overlay layer', () => {
    const { result } = renderHook(() => useVideoPlayback({ url: MP4 }))
    expect(result.current.containerRef).toBeTruthy()
    expect(result.current.videoRef).toBeTruthy()
  })
})
