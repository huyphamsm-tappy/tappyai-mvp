// The database side of the overlay and the download renders (20261115_video_overlays.sql): the interfaces the flows are written against, and the real stores over the
// service-role Supabase client. Every write goes through a database function (save with an optimistic version, claim with one winner), so the rules are the database's.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface StoredOverlay { version: number; doc: unknown }
export type OverlaySaveStatus = 'saved' | 'not_found' | 'deleted' | 'conflict'

export interface OverlayStore {
  /** The current saved overlay of an asset, or null when none was saved yet. */
  get(assetId: string): Promise<StoredOverlay | null>
  /** `expectedVersion` is 0 when nothing was saved yet. `version` is the stored version after the call (the current one on a conflict). */
  save(assetId: string, ownerId: string, expectedVersion: number, doc: unknown): Promise<{ status: OverlaySaveStatus; version: number }>
}

export type RenderState = 'rendering' | 'ready' | 'failed'
export interface RenderRow {
  state: RenderState
  attempts: number
  job_name: string | null
  object_key: string | null
  error_code: string | null
  /** ISO timestamp of the last change: how long a job has been running is read from it. */
  updated_at: string
}
export interface ClaimResult { claimed: boolean; render: Omit<RenderRow, 'updated_at'> }
export interface ClaimOptions { maxAttempts: number; graceSeconds: number; cooldownSeconds: number }

export interface DownloadRenderStore {
  claim(assetId: string, cacheKey: string, opts: ClaimOptions): Promise<ClaimResult>
  get(assetId: string, cacheKey: string): Promise<RenderRow | null>
  /** Records a started (jobName set) or failed-to-start (jobName null) attempt. Only while the render is `rendering`. */
  setJob(assetId: string, cacheKey: string, rec: { jobName: string | null; attempts: number; error: string | null }): Promise<void>
  markReady(assetId: string, cacheKey: string, objectKey: string): Promise<void>
  /** `attempts` given: also sets the counter (a permanent failure sets it to the limit so nothing retries). */
  markFailed(assetId: string, cacheKey: string, code: string, attempts?: number): Promise<void>
}

function fail(op: string, error: { message?: string; code?: string }): never {
  // The database message can carry row data; keep only the operation and the SQLSTATE.
  throw Object.assign(new Error(`video overlay store: ${op} failed${error.code ? ` (${error.code})` : ''}`), { code: error.code })
}

export function supabaseOverlayStore(admin: SupabaseClient): OverlayStore {
  return {
    async get(assetId) {
      const { data, error } = await admin.from('video_overlays').select('version, doc').eq('asset_id', assetId).maybeSingle()
      if (error) fail('get', error)
      return data ? { version: (data as { version: number }).version, doc: (data as { doc: unknown }).doc } : null
    },
    async save(assetId, ownerId, expectedVersion, doc) {
      const { data, error } = await admin.rpc('video_overlay_save', { p_asset: assetId, p_owner: ownerId, p_expected_version: expectedVersion, p_doc: doc })
      if (error) fail('save', error)
      const row = (Array.isArray(data) ? data[0] : data) as { status: OverlaySaveStatus; version: number } | null
      if (!row) fail('save', { message: 'no row' })
      return { status: row.status, version: row.version }
    },
  }
}

const RENDER_COLUMNS = 'state, attempts, job_name, object_key, error_code, updated_at'

export function supabaseDownloadRenderStore(admin: SupabaseClient): DownloadRenderStore {
  return {
    async claim(assetId, cacheKey, opts) {
      const { data, error } = await admin.rpc('video_download_claim', {
        p_asset: assetId, p_cache_key: cacheKey, p_max_attempts: opts.maxAttempts, p_grace_seconds: opts.graceSeconds, p_cooldown_seconds: opts.cooldownSeconds,
      })
      if (error) fail('claim', error)
      const row = (Array.isArray(data) ? data[0] : data) as ({ claimed: boolean } & Omit<RenderRow, 'updated_at'>) | null
      if (!row) fail('claim', { message: 'no row' })
      return { claimed: row.claimed, render: { state: row.state, attempts: row.attempts, job_name: row.job_name, object_key: row.object_key, error_code: row.error_code } }
    },
    async get(assetId, cacheKey) {
      const { data, error } = await admin.from('video_download_renders').select(RENDER_COLUMNS).eq('asset_id', assetId).eq('cache_key', cacheKey).maybeSingle()
      if (error) fail('get', error)
      return (data as RenderRow | null) ?? null
    },
    async setJob(assetId, cacheKey, rec) {
      const { error } = await admin.from('video_download_renders').update({ job_name: rec.jobName, attempts: rec.attempts, error_code: rec.error })
        .eq('asset_id', assetId).eq('cache_key', cacheKey).eq('state', 'rendering')
      if (error) fail('setJob', error)
    },
    async markReady(assetId, cacheKey, objectKey) {
      const { error } = await admin.from('video_download_renders').update({ state: 'ready', object_key: objectKey, error_code: null })
        .eq('asset_id', assetId).eq('cache_key', cacheKey).eq('state', 'rendering')
      if (error) fail('markReady', error)
    },
    async markFailed(assetId, cacheKey, code, attempts) {
      const { error } = await admin.from('video_download_renders').update({ state: 'failed', error_code: code, ...(attempts === undefined ? {} : { attempts }) })
        .eq('asset_id', assetId).eq('cache_key', cacheKey).in('state', ['rendering', 'ready'])
      if (error) fail('markFailed', error)
    },
  }
}
