import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MediaProvider } from '../types'
import { runVideoSourceCleanup } from './sourceCleanup'

const BUCKET = 'tappyai-video-source'
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
type Due = { id: string; owner_id: string; source_bucket: string | null; source_object_key: string; reason: 'deleted' | 'failed' | 'abandoned' }
type RpcResult = { data?: unknown; error?: { code?: string; message?: string } | null }

function fakeDb(due: Due[], over: { listError?: { code: string }; removedError?: Record<string, { code: string }>; transitionError?: Record<string, { code: string }> } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ fn, args })
      if (fn === 'video_assets_due_for_source_cleanup') return over.listError ? { data: null, error: over.listError } : { data: due, error: null }
      if (fn === 'video_asset_source_removed') return over.removedError?.[String(args.p_asset)] ? { data: null, error: over.removedError[String(args.p_asset)] } : { data: [{ asset_id: args.p_asset, changed: true }], error: null }
      if (fn === 'video_asset_transition') return over.transitionError?.[String(args.p_asset)] ? { data: null, error: over.transitionError[String(args.p_asset)] } : { data: [{ state: 'failed', changed: true }], error: null }
      return { data: null, error: { code: 'XX000' } }
    },
  } as unknown as SupabaseClient
  return { db, calls }
}
/** `staged`: objects in the private staging folders (vstg/…), by key. */
function fakeProvider(over: { gone?: Set<string>; throwOn?: string; staged?: string[]; throwOnList?: boolean } = {}) {
  const store = new Set(over.staged ?? [])
  const deleteObject = vi.fn(async (key: string) => {
    if (key === over.throwOn) throw new Error('Media provider "gcs" delete failed (HTTP 500)')
    if (store.has(key)) { store.delete(key); return true }
    return !over.gone?.has(key)
  })
  const listObjects = vi.fn(async (prefix: string) => {
    if (over.throwOnList) throw new Error('Media provider "gcs" list failed (HTTP 403)')
    return [...store].filter(k => k.startsWith(prefix))
  })
  return { provider: { id: 'gcs', deleteObject, listObjects } as unknown as MediaProvider, deleteObject, listObjects, store }
}
const row = (id: string, reason: Due['reason'], over: Partial<Due> = {}): Due => ({ id, owner_id: OWNER, source_bucket: BUCKET, source_object_key: `vsrc/${OWNER}/${id}.mp4`, reason, ...over })

describe('runVideoSourceCleanup', () => {
  it('removes each due file, then records it: delete BEFORE record, so a recorded removal is a real one', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted'), row(B, 'failed')])
    const { provider, deleteObject } = fakeProvider()
    const r = await runVideoSourceCleanup({ db, provider, bucket: BUCKET })
    expect(r).toMatchObject({ due: 2, removed: 2, failed: 0 })
    expect(deleteObject.mock.calls.map(c => c[0])).toEqual([`vsrc/${OWNER}/${A}.mp4`, `vsrc/${OWNER}/${B}.mp4`])
    const recorded = calls.filter(c => c.fn === 'video_asset_source_removed')
    expect(recorded.map(c => c.args.p_asset)).toEqual([A, B])
    expect(recorded[0].args).toMatchObject({ p_actor: 'service:video-cleanup', p_reason: 'deleted' })
    expect(recorded[1].args).toMatchObject({ p_reason: 'failed' })
  })

  it('🚨 the transcoder output of THAT video (its private staging folder) is removed with it, and nothing of any other video', async () => {
    const mine = [`vstg/${OWNER}/${A}/manifest.m3u8`, `vstg/${OWNER}/${A}/hls720.ts`]
    const others = [`vstg/${OWNER}/${B}/manifest.m3u8`, `vstg/${'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}/${A}/manifest.m3u8`]
    const { db } = fakeDb([row(A, 'deleted')])
    const f = fakeProvider({ staged: [...mine, ...others] })
    const r = await runVideoSourceCleanup({ db, provider: f.provider, bucket: BUCKET })
    expect(r.removed).toBe(1)
    expect([...f.store].sort()).toEqual([...others].sort())
    expect(f.listObjects).toHaveBeenCalledWith(`vstg/${OWNER}/${A}/`)
  })

  it('a staging folder that cannot be listed or emptied is NOT recorded as removed, and the others still run', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted'), row(B, 'deleted')])
    const f = fakeProvider({ throwOn: `vstg/${OWNER}/${A}/x.ts`, staged: [`vstg/${OWNER}/${A}/x.ts`] })
    const r = await runVideoSourceCleanup({ db, provider: f.provider, bucket: BUCKET })
    expect(r).toMatchObject({ removed: 1, failed: 1 })
    expect(calls.filter(c => c.fn === 'video_asset_source_removed').map(c => c.args.p_asset)).toEqual([B])
    const g = fakeProvider({ throwOnList: true })
    expect((await runVideoSourceCleanup({ db: fakeDb([row(A, 'deleted')]).db, provider: g.provider, bucket: BUCKET })).failed).toBe(1)
  })

  it('asks the database with the stale window and a batch limit', async () => {
    const { db, calls } = fakeDb([])
    await runVideoSourceCleanup({ db, provider: fakeProvider().provider, bucket: BUCKET, staleHours: 12, limit: 50 })
    expect(calls[0]).toEqual({ fn: 'video_assets_due_for_source_cleanup', args: { p_stale_hours: 12, p_limit: 50 } })
  })

  it('an object that is already gone (404) still counts as removed and is recorded', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted')])
    const r = await runVideoSourceCleanup({ db, provider: fakeProvider({ gone: new Set([`vsrc/${OWNER}/${A}.mp4`]) }).provider, bucket: BUCKET })
    expect(r.removed).toBe(1)
    expect(calls.some(c => c.fn === 'video_asset_source_removed')).toBe(true)
  })

  it('🚨 a failed deletion is NOT recorded as removed, the others still run, and the failure is counted', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted'), row(B, 'deleted'), row(C, 'deleted')])
    const r = await runVideoSourceCleanup({ db, provider: fakeProvider({ throwOn: `vsrc/${OWNER}/${B}.mp4` }).provider, bucket: BUCKET })
    expect(r).toMatchObject({ due: 3, removed: 2, failed: 1 })
    expect(calls.filter(c => c.fn === 'video_asset_source_removed').map(c => c.args.p_asset)).toEqual([A, C])
  })

  it('an abandoned upload is first marked FAILED (with a history event), then its file is removed', async () => {
    const { db, calls } = fakeDb([row(A, 'abandoned')])
    const { provider, deleteObject } = fakeProvider()
    const r = await runVideoSourceCleanup({ db, provider, bucket: BUCKET })
    expect(r.removed).toBe(1)
    const t = calls.find(c => c.fn === 'video_asset_transition')!
    expect(t.args).toMatchObject({ p_asset: A, p_to: 'failed', p_event_type: 'upload_abandoned', p_actor: 'service:video-cleanup' })
    expect(calls.findIndex(c => c.fn === 'video_asset_transition')).toBeLessThan(calls.findIndex(c => c.fn === 'video_asset_source_removed'))
    expect(deleteObject).toHaveBeenCalledTimes(1)
  })

  it('an abandoned upload whose state moved meanwhile (it completed after all) is left alone this run', async () => {
    const { db } = fakeDb([row(A, 'abandoned')], { transitionError: { [A]: { code: '23514' } } })
    const { provider, deleteObject } = fakeProvider()
    const r = await runVideoSourceCleanup({ db, provider, bucket: BUCKET })
    expect(r.removed).toBe(0)
    expect(r.deferred).toBe(1)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('🚨 a row whose bucket is not the configured one is never touched (the same key in another bucket is somebody else\'s)', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted', { source_bucket: 'some-other-bucket' }), row(B, 'deleted', { source_bucket: null })])
    const { provider, deleteObject } = fakeProvider()
    const r = await runVideoSourceCleanup({ db, provider, bucket: BUCKET })
    expect(r.removed).toBe(0)
    expect(r.mismatched).toBe(2)
    expect(deleteObject).not.toHaveBeenCalled()
    expect(calls.filter(c => c.fn === 'video_asset_source_removed')).toEqual([])
  })

  it('a hold that appeared after the list is respected: the database refuses the record and it counts as deferred', async () => {
    const { db } = fakeDb([row(A, 'deleted')], { removedError: { [A]: { code: '55000' } } })
    const r = await runVideoSourceCleanup({ db, provider: fakeProvider().provider, bucket: BUCKET })
    expect(r.deferred).toBe(1)
    expect(r.removed).toBe(0)
  })

  it('no source bucket configured: skipped, no database call', async () => {
    const { db, calls } = fakeDb([row(A, 'deleted')])
    const r = await runVideoSourceCleanup({ db, provider: null, bucket: null })
    expect(r.skipped).toBe('no_bucket')
    expect(calls).toEqual([])
  })

  it('migration not applied yet: skipped, not an error (the cron must not fail every night)', async () => {
    for (const code of ['42883', 'PGRST202']) {
      const { db } = fakeDb([], { listError: { code } })
      expect((await runVideoSourceCleanup({ db, provider: fakeProvider().provider, bucket: BUCKET })).skipped).toBe('not_installed')
    }
  })

  it('any other database error is thrown (a real failure is a 500, not a silent skip)', async () => {
    const { db } = fakeDb([], { listError: { code: '57014' } })
    await expect(runVideoSourceCleanup({ db, provider: fakeProvider().provider, bucket: BUCKET })).rejects.toThrow(/57014/)
  })

  it('stops starting new files once the deadline has passed (the rest is the next run\'s)', async () => {
    const { db } = fakeDb([row(A, 'deleted'), row(B, 'deleted'), row(C, 'deleted')])
    let t = 0
    const r = await runVideoSourceCleanup({ db, provider: fakeProvider().provider, bucket: BUCKET, deadline: 2, now: () => t++ })
    expect(r.removed).toBeLessThan(3)
    expect(r.removed).toBeGreaterThan(0)
  })
})
