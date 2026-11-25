'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyOverlay, validateOverlayDoc, type OverlayDoc } from '@/lib/media/video/overlay/schema'

export type OverlayDraftStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'conflict' | 'load_failed' | 'save_failed' | 'invalid'

export interface OverlayDraft {
  doc: OverlayDoc
  /** The version the document was loaded or last saved at (0 = nothing saved yet). Sent back on save so a stale editor cannot overwrite a newer save. */
  version: number
  status: OverlayDraftStatus
  dirty: boolean
  /** Characters the download renderer's font cannot draw, as reported by the last save. */
  unsupportedChars: string[]
  setDoc(doc: OverlayDoc): void
  save(): Promise<boolean>
  /** After a conflict: drop the local edits and load what is saved. */
  reload(): Promise<void>
}

/**
 * Loads and saves the overlay draft of one video through GET / PUT /api/video/uploads/[id]/overlay. The original video is never touched; this is JSON next to it.
 * `durationMs` (when known) is used to refuse an edit the server would refuse (a layer ending after the clip) BEFORE the request.
 * `fetchImpl` is for tests.
 */
export function useOverlayDraft(assetId: string | null, opts: { durationMs?: number; fetchImpl?: typeof fetch } = {}): OverlayDraft {
  const doFetch = opts.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch)
  const [doc, setDocState] = useState<OverlayDoc>(emptyOverlay())
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState<OverlayDraftStatus>('loading')
  const [dirty, setDirty] = useState(false)
  const [unsupported, setUnsupported] = useState<string[]>([])
  const latest = useRef({ doc, version })
  latest.current = { doc, version }
  const url = assetId ? `/api/video/uploads/${encodeURIComponent(assetId)}/overlay` : null

  const load = useCallback(async () => {
    if (!url || !doFetch) return
    setStatus('loading')
    try {
      const res = await doFetch(url, { credentials: 'same-origin' })
      if (!res.ok) throw new Error('load')
      const body = (await res.json()) as { version?: unknown; doc?: unknown }
      const valid = validateOverlayDoc(body.doc)
      if (typeof body.version !== 'number' || !valid.ok) throw new Error('load')
      setDocState(valid.doc)
      setVersion(body.version)
      setDirty(false)
      setStatus('ready')
    } catch {
      setStatus('load_failed')
    }
  }, [url, doFetch])

  useEffect(() => { void load() }, [load])

  const setDoc = useCallback((next: OverlayDoc) => {
    setDocState(next)
    setDirty(true)
    setStatus(s => (s === 'saved' || s === 'save_failed' || s === 'invalid' ? 'ready' : s))
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    if (!url || !doFetch) return false
    const { doc: current, version: expected } = latest.current
    const valid = validateOverlayDoc(current, { durationMs: opts.durationMs })
    if (!valid.ok) { setStatus('invalid'); return false }
    setStatus('saving')
    try {
      const res = await doFetch(url, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: expected, doc: valid.doc }) })
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setStatus(body.error === 'version_conflict' ? 'conflict' : 'save_failed')
        return false
      }
      if (!res.ok) { setStatus('save_failed'); return false }
      const body = (await res.json()) as { version?: number; warnings?: { unsupported_chars?: string[] } }
      if (typeof body.version !== 'number') { setStatus('save_failed'); return false }
      setVersion(body.version)
      setUnsupported(body.warnings?.unsupported_chars ?? [])
      setDirty(false)
      setStatus('saved')
      return true
    } catch {
      setStatus('save_failed')
      return false
    }
  }, [url, doFetch, opts.durationMs])

  return { doc, version, status, dirty, unsupportedChars: unsupported, setDoc, save, reload: load }
}
