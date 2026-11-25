'use client'
// Explore video, web composer: drives the NEW upload flow (POST /api/video/uploads -> PUT -> /complete -> poll) over the pure state machine in
// src/lib/media/video/composerState.ts.
//
// `start(file)` answers 'off' when the server says the feature is not there (404): the caller then uses the OLD upload path exactly as before, and nothing here has
// changed any state. Every attempt uses a fresh idempotency key. The status poll lives in an effect, so it stops the moment the phase leaves processing/review or the
// component unmounts. A consent refusal (403 video_consent_required) opens the consent state; accepting records it through POST /api/video/consent and restarts.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { defaultTransport, type UploadTransport } from '@/lib/media/client'
import { neutralizeClipMetadata } from '@/lib/media/clipMetadata'
import { VIDEO_CLIP_CONSENT_VERSION } from '@/lib/media/video/clipConsent'
import {
  flowReducer, INITIAL_FLOW, isPolling, mapUploadError, newIdempotencyKey, type FlowErrorKey, type FlowState,
} from '@/lib/media/video/composerState'

export interface VideoFlowDeps {
  fetchImpl?: typeof fetch
  putBytes?: UploadTransport['putBytes']
  neutralize?: (file: Blob) => Promise<Blob>
  sleep?: (ms: number) => Promise<void>
  /** Milliseconds between two status polls. */
  pollMs?: number
  /** An 18+ refusal: the caller sends the person to the age check. */
  onAgeGate?: () => void
}

export interface VideoComposerFlow {
  state: FlowState
  start(file: File): Promise<'off' | 'new'>
  retry(): void
  reset(): void
  cancel(): void
  acceptConsent(): Promise<void>
  declineConsent(): void
  consentBusy: boolean
  consentError: boolean
}

const MAX_PUT_ATTEMPTS = 3
const MAX_COMPLETE_ATTEMPTS = 4
const MAX_POLL_FAILURES = 5
const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return ((await res.json()) ?? {}) as Record<string, unknown> } catch { return {} }
}

export function useVideoComposerFlow(deps: VideoFlowDeps = {}): VideoComposerFlow {
  const [state, dispatch] = useReducer(flowReducer, INITIAL_FLOW)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const depsRef = useRef(deps)
  depsRef.current = deps
  const fileRef = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runRef = useRef(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; abortRef.current?.abort() }
  }, [])

  const invalidate = useCallback(() => {
    runRef.current++
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const begin = useCallback(async (file: File): Promise<'off' | 'new'> => {
    const d = depsRef.current
    const doFetch = d.fetchImpl ?? fetch
    const sleep = d.sleep ?? defaultSleep
    const putBytes = d.putBytes ?? defaultTransport.putBytes
    const neutralize = d.neutralize ?? neutralizeClipMetadata
    runRef.current++
    const run = runRef.current
    const live = () => aliveRef.current && runRef.current === run
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    fileRef.current = file
    dispatch({ type: 'start' })

    const fail = (error: FlowErrorKey) => { if (live()) dispatch({ type: 'error', error }) }
    const classify = (status: number, code: string | undefined): 'handled' | FlowErrorKey => {
      const c = mapUploadError(status, code)
      if (c === 'consent') { if (live()) dispatch({ type: 'consent_required' }); return 'handled' }
      if (c === 'age') { if (live()) { dispatch({ type: 'reset' }); depsRef.current.onAgeGate?.() } return 'handled' }
      return c
    }

    // 1. open the session
    let res: Response
    try {
      res = await doFetch('/api/video/uploads', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ idempotencyKey: newIdempotencyKey(), contentType: file.type, size: file.size }),
      })
    } catch {
      if (live()) fail('network')
      return 'new'
    }
    if (res.status === 404) { if (live()) dispatch({ type: 'reset' }); return 'off' }
    const created = await readJson(res)
    if (!live()) return 'new'
    if (!res.ok) {
      const c = classify(res.status, typeof created.error === 'string' ? created.error : undefined)
      if (c !== 'handled') fail(c)
      return 'new'
    }
    const assetId = typeof created.assetId === 'string' ? created.assetId : ''
    if (!assetId) { fail('generic'); return 'new' }
    dispatch({ type: 'session', assetId })

    // 2..4 run detached: the caller has its answer ("the new flow owns this file").
    void (async () => {
      const uploadUrl = typeof created.uploadUrl === 'string' ? created.uploadUrl : ''
      const contentType = typeof created.contentType === 'string' ? created.contentType : file.type
      let bytes: Blob | null = null
      const sendBytes = async (): Promise<boolean> => {
        if (!bytes) {
          try { bytes = await neutralize(file) } catch { fail('unreadable'); return false }
        }
        for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
          try {
            const put = await putBytes(uploadUrl, bytes, contentType, { signal: ac.signal, onProgress: pct => { if (live()) dispatch({ type: 'progress', pct }) } })
            if (!live()) return false
            // A readable refusal is final unless it is the storage's own trouble. "Unreadable" is NOT a failure (the storage answers without CORS headers): /complete settles it.
            if (put.readable && (put.status < 200 || put.status > 299)) {
              if (put.status >= 500 && attempt < MAX_PUT_ATTEMPTS) { await sleep(500 * attempt); continue }
              fail('generic'); return false
            }
            return true
          } catch (e) {
            if (!live() || (e as { name?: string })?.name === 'AbortError') return false
            if (attempt >= MAX_PUT_ATTEMPTS) { fail('network'); return false }
            await sleep(500 * attempt)
          }
        }
        return false
      }

      // A reused session (the bytes already reached the server in an earlier attempt): straight to /complete.
      if (uploadUrl) {
        if (!(await sendBytes())) return
      }
      if (!live()) return
      dispatch({ type: 'uploaded' })

      let reuploaded = false
      for (let attempt = 1; attempt <= MAX_COMPLETE_ATTEMPTS; attempt++) {
        let done: Response
        try {
          done = await doFetch(`/api/video/uploads/${encodeURIComponent(assetId)}/complete`, { method: 'POST', credentials: 'same-origin', signal: ac.signal })
        } catch {
          if (!live()) return
          if (attempt >= MAX_COMPLETE_ATTEMPTS) { fail('network'); return }
          await sleep(500 * attempt); continue
        }
        const out = await readJson(done)
        if (!live()) return
        if (done.ok) { dispatch({ type: 'status', state: typeof out.state === 'string' ? out.state : 'processing', assetId }); return }
        const code = typeof out.error === 'string' ? out.error : undefined
        // Not there yet: send the bytes again once (same session), then ask again.
        if (done.status === 422 && code === 'upload_incomplete' && uploadUrl && !reuploaded) {
          reuploaded = true
          if (!(await sendBytes())) return
          continue
        }
        if (done.status === 422 && code === 'upload_incomplete') { fail('generic'); return }
        // The storage is busy: ask again.
        if (done.status === 502 && attempt < MAX_COMPLETE_ATTEMPTS) { await sleep(500 * attempt); continue }
        const c = classify(done.status, code)
        if (c !== 'handled') fail(c)
        return
      }
    })()
    return 'new'
  }, [])

  // The status poll. Lives in an effect: leaving processing/review or unmounting stops it, and a late answer is dropped.
  const { phase, assetId } = state
  useEffect(() => {
    if (!isPolling(phase) || !assetId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let failures = 0
    const d = depsRef.current
    const doFetch = d.fetchImpl ?? fetch
    const tick = async () => {
      let ok = false
      try {
        const res = await doFetch(`/api/video/uploads/${encodeURIComponent(assetId)}`, { credentials: 'same-origin', cache: 'no-store' })
        const body = await readJson(res)
        if (cancelled) return
        if (res.ok && typeof body.state === 'string') { ok = true; failures = 0; dispatch({ type: 'status', state: body.state, assetId }) }
        else if (res.status === 404 || res.status === 401) { dispatch({ type: 'error', error: mapUploadError(res.status, typeof body.error === 'string' ? body.error : undefined) as FlowErrorKey }); return }
      } catch {
        if (cancelled) return
      }
      if (!ok && ++failures >= MAX_POLL_FAILURES) { dispatch({ type: 'error', error: 'network' }); return }
      if (!cancelled) timer = setTimeout(tick, depsRef.current.pollMs ?? 3000)
    }
    void tick()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [phase, assetId])

  const start = useCallback((file: File) => begin(file), [begin])
  const retry = useCallback(() => { if (fileRef.current) void begin(fileRef.current) }, [begin])
  const reset = useCallback(() => { invalidate(); fileRef.current = null; setConsentBusy(false); setConsentError(false); dispatch({ type: 'reset' }) }, [invalidate])
  const cancel = reset

  const acceptConsent = useCallback(async () => {
    const file = fileRef.current
    if (!file) return
    setConsentBusy(true); setConsentError(false)
    const doFetch = depsRef.current.fetchImpl ?? fetch
    let ok = false
    try {
      // The clip conditions (owner 05/11/2026): recorded on THIS feature's own route, for every account (web-only included).
      const res = await doFetch('/api/video/consent', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, version: VIDEO_CLIP_CONSENT_VERSION }),
      })
      ok = res.ok
    } catch { ok = false }
    if (!aliveRef.current) return
    setConsentBusy(false)
    if (!ok) { setConsentError(true); return }
    await begin(file)
  }, [begin])

  const declineConsent = useCallback(() => {
    invalidate(); fileRef.current = null; setConsentError(false)
    dispatch({ type: 'consent_declined' })
  }, [invalidate])

  return { state, start, retry, reset, cancel, acceptConsent, declineConsent, consentBusy, consentError }
}
