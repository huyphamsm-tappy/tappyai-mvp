'use client'
// Explore video: the owner's download of a ready / published clip (MP4 with the text overlay and the watermark).
// POST .../download starts (or finds) the render, GET .../download is polled until it is ready or failed, then the browser is sent to GET ...?file=1 (an attachment).

import { useCallback, useEffect, useRef, useState } from 'react'

export type DownloadStatus = 'none' | 'rendering' | 'ready' | 'failed'
export type DownloadError = 'notReady' | 'overlayInvalid' | 'unavailable' | 'failed'

export interface UseVideoDownloadDeps {
  fetchImpl?: typeof fetch
  pollMs?: number
  /** Starts the browser download of this URL. Default: a temporary <a download> click. */
  startFile?: (url: string) => void
}

export function downloadFileUrl(assetId: string): string {
  return `/api/video/uploads/${encodeURIComponent(assetId)}/download?file=1`
}

function clickDownload(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function useVideoDownload(assetId: string, deps: UseVideoDownloadDeps = {}) {
  const [status, setStatus] = useState<DownloadStatus | 'idle'>('idle')
  const [error, setError] = useState<DownloadError | null>(null)
  const depsRef = useRef(deps)
  depsRef.current = deps
  const [polling, setPolling] = useState(0) // bumps to (re)start the poll
  const base = `/api/video/uploads/${encodeURIComponent(assetId)}/download`

  const fail = (e: DownloadError) => { setError(e); setStatus('failed') }

  const start = useCallback(async () => {
    const doFetch = depsRef.current.fetchImpl ?? fetch
    setError(null); setStatus('rendering')
    try {
      const res = await doFetch(base, { method: 'POST', credentials: 'same-origin' })
      const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
      if (res.status === 409) return fail('notReady')
      if (res.status === 422) return fail(body.error === 'overlay_invalid' ? 'overlayInvalid' : 'failed')
      if (!res.ok) return fail('unavailable')
      if (body.status === 'ready') { setStatus('ready'); return }
      if (body.status === 'failed') return fail('failed')
      setPolling(n => n + 1)
    } catch {
      fail('unavailable')
    }
  }, [base])

  // The poll: only while rendering; unmounting (or leaving the state) stops it.
  useEffect(() => {
    if (status !== 'rendering' || polling === 0) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      try {
        const res = await (depsRef.current.fetchImpl ?? fetch)(base, { credentials: 'same-origin', cache: 'no-store' })
        const body = (await res.json().catch(() => ({}))) as { status?: string }
        if (cancelled) return
        if (res.ok && body.status === 'ready') { setStatus('ready'); return }
        if (res.ok && body.status === 'failed') { fail('failed'); return }
        if (!res.ok && res.status !== 503) { fail(res.status === 409 ? 'notReady' : 'unavailable'); return }
      } catch {
        if (cancelled) return
      }
      timer = setTimeout(tick, depsRef.current.pollMs ?? 2500)
    }
    timer = setTimeout(tick, depsRef.current.pollMs ?? 2500)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, polling, base])

  // Ready: hand the file to the browser, once per render.
  const startedFile = useRef(false)
  useEffect(() => {
    if (status !== 'ready') { startedFile.current = false; return }
    if (startedFile.current) return
    startedFile.current = true
    ;(depsRef.current.startFile ?? clickDownload)(downloadFileUrl(assetId))
  }, [status, assetId])

  return { status, error, start }
}
