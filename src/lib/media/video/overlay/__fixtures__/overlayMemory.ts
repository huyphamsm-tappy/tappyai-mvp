// In-memory stand-ins for the overlay and download-render tables, for the flow and route tests. `claim` mirrors the SQL function video_download_claim (the database
// test supabase/tests/video_overlays.test.ts proves the SQL); `clock` lets a test move time to exercise grace periods and timeouts.

import type { ClaimOptions, DownloadRenderStore, OverlaySaveStatus, OverlayStore, RenderRow } from '../overlayStore'

export function memoryOverlayStore(owners: Record<string, string>, deleted: Set<string> = new Set()) {
  const docs = new Map<string, { version: number; doc: unknown }>()
  const calls = { save: 0 }
  const store: OverlayStore = {
    async get(assetId) { const d = docs.get(assetId); return d ? { ...d } : null },
    async save(assetId, ownerId, expected, doc) {
      calls.save++
      if (owners[assetId] !== ownerId) return { status: 'not_found' as OverlaySaveStatus, version: 0 }
      if (deleted.has(assetId)) return { status: 'deleted' as OverlaySaveStatus, version: 0 }
      const cur = docs.get(assetId)
      if ((cur?.version ?? 0) !== expected) return { status: 'conflict' as OverlaySaveStatus, version: cur?.version ?? 0 }
      const version = (cur?.version ?? 0) + 1
      docs.set(assetId, { version, doc })
      return { status: 'saved' as OverlaySaveStatus, version }
    },
  }
  return { store, docs, calls, deleted }
}

export function memoryRenderStore(clock: { now: number } = { now: Date.parse('2026-11-05T10:00:00Z') }) {
  const rows = new Map<string, RenderRow>()
  const calls = { claim: 0, setJob: 0, markReady: 0, markFailed: 0 }
  const k = (a: string, c: string) => `${a}|${c}`
  const iso = () => new Date(clock.now).toISOString()
  const view = (r: RenderRow) => ({ state: r.state, attempts: r.attempts, job_name: r.job_name, object_key: r.object_key, error_code: r.error_code })

  const store: DownloadRenderStore = {
    async claim(assetId, cacheKey, opts: ClaimOptions) {
      calls.claim++
      const key = k(assetId, cacheKey)
      const r = rows.get(key)
      if (!r) {
        const fresh: RenderRow = { state: 'rendering', attempts: 0, job_name: null, object_key: null, error_code: null, updated_at: iso() }
        rows.set(key, fresh)
        return { claimed: true, render: view(fresh) }
      }
      const age = (clock.now - Date.parse(r.updated_at)) / 1000
      if (r.state === 'failed' && (r.attempts < opts.maxAttempts || age > opts.cooldownSeconds)) {
        r.attempts = r.attempts < opts.maxAttempts ? r.attempts : 0
        Object.assign(r, { state: 'rendering', job_name: null, error_code: null, updated_at: iso() })
        return { claimed: true, render: view(r) }
      }
      if (r.state === 'rendering' && r.job_name === null && age > opts.graceSeconds) {
        r.updated_at = iso()
        return { claimed: true, render: view(r) }
      }
      return { claimed: false, render: view(r) }
    },
    async get(assetId, cacheKey) { const r = rows.get(k(assetId, cacheKey)); return r ? { ...r } : null },
    async setJob(assetId, cacheKey, rec) {
      calls.setJob++
      const r = rows.get(k(assetId, cacheKey))
      if (!r || r.state !== 'rendering') return
      Object.assign(r, { job_name: rec.jobName, attempts: rec.attempts, error_code: rec.error, updated_at: iso() })
    },
    async markReady(assetId, cacheKey, objectKey) {
      calls.markReady++
      const r = rows.get(k(assetId, cacheKey))
      if (!r || r.state !== 'rendering') return
      Object.assign(r, { state: 'ready', object_key: objectKey, error_code: null, updated_at: iso() })
    },
    async markFailed(assetId, cacheKey, code, attempts) {
      calls.markFailed++
      const r = rows.get(k(assetId, cacheKey))
      if (!r || r.state === 'failed') return
      Object.assign(r, { state: 'failed', error_code: code, updated_at: iso() })
      if (attempts !== undefined) r.attempts = attempts
    },
  }
  return { store, rows, calls, clock }
}
