'use client'
// Explore video, web playback: the hook that makes a <video> play a post's HLS stream (publishing + delivery slice).
//
//   1. Only a delivery manifest URL (`.../vdel/<owner>/<asset>/manifest.m3u8`) is handled; a plain MP4 or a YouTube link (every old post) is left completely alone.
//   2. The server is asked FIRST (POST /api/video/playback/<asset>, credentials included): it decides whether this viewer may watch and sets the signed CDN cookie. A refusal is an
//      error state; nothing is loaded.
//   3. Safari and iOS play HLS natively; everywhere else hls.js (loaded only now, on demand) with `withCredentials` on every request so the cookie reaches the CDN, and adaptive
//      bitrate (level picked by the player, capped to the size it is shown at).
//   4. The cookie lives 10 minutes: it is renewed at 80% of its life while mounted, and a fatal network error (an expired or revoked cookie) re-asks and restarts loading, up to
//      three times; a fatal media error is recovered once. Then it is an error state with a retry.
//
// The hook also hands back the <video> ref and a container ref: the overlay layer (text and stickers over the picture) mounts into the container and measures the video through them.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { isHlsUrl, videoAssetIdFromManifestUrl } from '@/lib/media/video/hlsUrl'
import { validateOverlayDoc, type OverlayDoc } from '@/lib/media/video/overlay/schema'

export type VideoPlaybackStatus = 'idle' | 'loading' | 'ready' | 'error'
export type VideoPlaybackError = 'unavailable' | 'network' | 'media' | 'unsupported'

/** The part of hls.js this hook uses (and a test can fake). */
export interface HlsLike {
  loadSource(url: string): void
  attachMedia(video: HTMLVideoElement): void
  startLoad(): void
  recoverMediaError(): void
  destroy(): void
  on(event: string, cb: (event: string, data: { fatal?: boolean; type?: string }) => void): void
}
export interface HlsCtorLike {
  new (config: Record<string, unknown>): HlsLike
  isSupported(): boolean
  Events: { ERROR: string }
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string }
}

export interface UseVideoPlaybackDeps {
  fetchImpl?: typeof fetch
  loadHls?: () => Promise<HlsCtorLike | null>
  supportsNativeHls?: (video: HTMLVideoElement) => boolean
}

export interface UseVideoPlaybackOptions {
  url: string
  /** The player's own <video> ref; when omitted the hook creates one and returns it. */
  videoRef?: RefObject<HTMLVideoElement | null>
  deps?: UseVideoPlaybackDeps
}

export interface UseVideoPlayback {
  videoRef: RefObject<HTMLVideoElement | null>
  /** For the overlay layer to mount into / measure. The hook never reads it. */
  containerRef: RefObject<HTMLDivElement | null>
  isHls: boolean
  status: VideoPlaybackStatus
  errorCode: VideoPlaybackError | null
  /** The post's text overlay, as the playback answer carried it (validated again here), or null. The overlay layer draws it over the picture. */
  overlayDoc: OverlayDoc | null
  retry: () => void
}

const MAX_NETWORK_RECOVERIES = 3
/** Renew the cookie at this fraction of its life. */
const RENEW_AT = 0.8

const defaultLoadHls = async (): Promise<HlsCtorLike | null> => {
  const mod = await import('hls.js')
  return (mod.default ?? null) as unknown as HlsCtorLike | null
}
// Native HLS only where it is dependable: Safari and every iOS browser (WebKit). Chromium browsers (Chrome, Edge) now answer canPlayType('application/vnd.apple.mpegurl')
// with "maybe" too, but their native player failed on this video (MEDIA_ERR_SRC_NOT_SUPPORTED, measured on production 26/11/2026 while the manifest, playlists and segments
// were all 200) and cannot send the CDN cookie in the credentials mode we need. They go through hls.js, as designed.
const defaultNative = (v: HTMLVideoElement): boolean => {
  if (typeof v.canPlayType !== 'function' || v.canPlayType('application/vnd.apple.mpegurl') === '') return false
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const chromium = /\b(Chrome|Chromium|Edg|OPR)\//.test(ua) && !/\b(CriOS|FxiOS|EdgiOS)\//.test(ua)
  return !chromium
}

interface PlaybackAnswer { manifestUrl: string; ttlSeconds: number }

export function useVideoPlayback(options: UseVideoPlaybackOptions): UseVideoPlayback {
  const { url } = options
  const ownVideoRef = useRef<HTMLVideoElement | null>(null)
  const videoRef = options.videoRef ?? ownVideoRef
  const containerRef = useRef<HTMLDivElement | null>(null)
  const depsRef = useRef(options.deps)
  depsRef.current = options.deps
  // Read through a ref so a caller that passes a fresh ref object on every render cannot restart the player.
  const videoRefHolder = useRef(videoRef)
  videoRefHolder.current = videoRef

  const isHls = isHlsUrl(url)
  const assetId = isHls ? videoAssetIdFromManifestUrl(url) : null
  const [status, setStatus] = useState<VideoPlaybackStatus>('idle')
  const [errorCode, setErrorCode] = useState<VideoPlaybackError | null>(null)
  const [overlayDoc, setOverlayDoc] = useState<OverlayDoc | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(a => a + 1), [])

  useEffect(() => {
    setStatus('idle'); setErrorCode(null); setOverlayDoc(null)
    if (!isHls) return
    const video = videoRefHolder.current.current
    const fail = (code: VideoPlaybackError) => { setStatus('error'); setErrorCode(code) }
    // An HLS URL that is not one of OUR delivery manifests is never asked about and never loaded.
    if (!assetId || !video) { fail('unavailable'); return }

    let cancelled = false
    let hls: HlsLike | null = null
    let renewTimer: ReturnType<typeof setTimeout> | null = null
    const doFetch = depsRef.current?.fetchImpl ?? fetch

    /** Asks the server for permission and the cookie. null = refused (404/other) or unreachable; the reason is in `why`. */
    const askPlayback = async (): Promise<{ ok: true; answer: PlaybackAnswer } | { ok: false; why: VideoPlaybackError }> => {
      try {
        const res = await doFetch(`/api/video/playback/${assetId}`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
        })
        if (!res.ok) return { ok: false, why: res.status === 404 ? 'unavailable' : 'network' }
        const body = (await res.json()) as { manifestUrl?: unknown; ttlSeconds?: unknown; overlay?: { doc?: unknown } | null }
        // Only the manifest of THIS video, over https, is ever loaded.
        if (typeof body.manifestUrl !== 'string' || videoAssetIdFromManifestUrl(body.manifestUrl) !== assetId) return { ok: false, why: 'unavailable' }
        // The text layers travel with the answer; whatever arrives is validated again here and anything invalid is simply not drawn.
        const checked = validateOverlayDoc(body.overlay?.doc ?? null)
        setOverlayDoc(checked.ok ? checked.doc : null)
        return { ok: true, answer: { manifestUrl: body.manifestUrl, ttlSeconds: typeof body.ttlSeconds === 'number' && body.ttlSeconds > 0 ? body.ttlSeconds : 600 } }
      } catch {
        return { ok: false, why: 'network' }
      }
    }

    const scheduleRenew = (ttlSeconds: number) => {
      renewTimer = setTimeout(async () => {
        if (cancelled) return
        const again = await askPlayback()
        if (cancelled) return
        scheduleRenew(again.ok ? again.answer.ttlSeconds : ttlSeconds)
      }, Math.max(5, ttlSeconds * RENEW_AT) * 1000)
    }

    const onVideoError = () => { if (!cancelled) fail('media') }

    ;(async () => {
      setStatus('loading')
      const first = await askPlayback()
      if (cancelled) return
      if (!first.ok) { fail(first.why); return }
      const { manifestUrl, ttlSeconds } = first.answer

      const native = (depsRef.current?.supportsNativeHls ?? defaultNative)(video)
      if (native) {
        video.addEventListener('error', onVideoError)
        video.src = manifestUrl
        setStatus('ready'); scheduleRenew(ttlSeconds)
        return
      }

      let Hls: HlsCtorLike | null = null
      try { Hls = await (depsRef.current?.loadHls ?? defaultLoadHls)() } catch { Hls = null }
      if (cancelled) return
      if (!Hls || !Hls.isSupported()) { fail('unsupported'); return }

      hls = new Hls({
        // The CDN cookie only travels if the request says so.
        xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = true },
        // Adaptive bitrate: the player picks the rung (-1 = automatic), never above the size the video is shown at.
        startLevel: -1,
        capLevelToPlayerSize: true,
        enableWorker: true,
      })
      let networkRecoveries = 0
      let mediaRecovered = false
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (cancelled || !data?.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (networkRecoveries >= MAX_NETWORK_RECOVERIES) { fail('network'); return }
          networkRecoveries++
          // Most often an expired or revoked cookie: ask again (this also re-checks that the video may still be watched), then restart loading.
          void askPlayback().then(again => {
            if (cancelled) return
            if (!again.ok) { fail(again.why); return }
            hls?.startLoad()
          })
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRecovered) { fail('media'); return }
          mediaRecovered = true
          hls?.recoverMediaError()
        } else {
          fail('media')
        }
      })
      hls.loadSource(manifestUrl)
      hls.attachMedia(video)
      setStatus('ready'); scheduleRenew(ttlSeconds)
    })()

    return () => {
      cancelled = true
      if (renewTimer) clearTimeout(renewTimer)
      video.removeEventListener('error', onVideoError)
      try { hls?.destroy() } catch { /* already gone */ }
      hls = null
    }
  }, [url, isHls, assetId, attempt])

  return { videoRef, containerRef, isHls, status, errorCode, overlayDoc, retry }
}
