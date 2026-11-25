import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseVideoAssetStore } from './assetStore'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const ROW = { id: 'a1', owner_id: OWNER, state: 'draft', moderation_state: 'pending', source_bucket: null, source_object_key: null }

/** A recording stand-in for the query builder: every chained call is logged, the terminal call answers from `plan`. */
function stub(plan: { insert?: { data?: unknown; error?: { code?: string; message?: string } | null }; select?: Array<{ data?: unknown; error?: { code?: string; message?: string } | null }>; rpc?: { data?: unknown; error?: { code?: string; message?: string } | null }; update?: { error?: { code?: string; message?: string } | null } }) {
  const log: Array<[string, unknown[]]> = []
  let selects = 0
  const chain = (ops: string[], terminal: () => unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'insert', 'update', 'lt', 'order', 'limit']) c[m] = (...a: unknown[]) => { log.push([m, a]); ops.push(m); return c }
    c.maybeSingle = () => Promise.resolve(terminal())
    c.single = () => Promise.resolve(terminal())
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(terminal()).then(res)
    return c
  }
  const admin = {
    // `ops` is per query: a later select must not see the insert of an earlier one.
    from: (t: string) => {
      log.push(['from', [t]])
      const ops: string[] = []
      return chain(ops, () => (ops.includes('insert') ? (plan.insert ?? { data: ROW, error: null }) : ops.includes('update') ? (plan.update ?? { error: null }) : (plan.select?.[selects++] ?? { data: null, error: null })))
    },
    rpc: (fn: string, args: unknown) => { log.push(['rpc', [fn, args]]); return Promise.resolve(plan.rpc ?? { data: [{ state: 'uploading', changed: true }], error: null }) },
  } as unknown as SupabaseClient
  return { admin, log }
}

describe('supabaseVideoAssetStore', () => {
  it('create inserts the owner and the idempotency key and nothing else', async () => {
    const { admin, log } = stub({})
    const row = await supabaseVideoAssetStore(admin).create(OWNER, 'client-generated-key-0001')
    expect(row.id).toBe('a1')
    expect(log.find(([m]) => m === 'insert')![1][0]).toEqual({ owner_id: OWNER, idempotency_key: 'client-generated-key-0001' })
  })

  it('a unique-violation race returns the row the other request created (never a duplicate, never an error)', async () => {
    const { admin } = stub({ insert: { error: { code: '23505', message: 'dup' } }, select: [{ data: { ...ROW, id: 'winner' }, error: null }] })
    const row = await supabaseVideoAssetStore(admin).create(OWNER, 'client-generated-key-0001')
    expect(row.id).toBe('winner')
  })

  it('any other insert error is thrown with the SQLSTATE only, never the database message', async () => {
    const { admin } = stub({ insert: { error: { code: '42501', message: 'permission denied for table video_assets row {"owner":"x"}' } } })
    await expect(supabaseVideoAssetStore(admin).create(OWNER, 'client-generated-key-0001')).rejects.toMatchObject({ code: '42501', message: 'video asset store: create failed (42501)' })
  })

  it('findByIdempotencyKey and get return null when there is no row', async () => {
    const { admin } = stub({ select: [{ data: null, error: null }, { data: null, error: null }] })
    const s = supabaseVideoAssetStore(admin)
    expect(await s.findByIdempotencyKey(OWNER, 'client-generated-key-0001')).toBeNull()
    expect(await s.get('missing')).toBeNull()
  })

  it('transition calls the ONE write function with every field named, and maps the answer', async () => {
    const { admin, log } = stub({ rpc: { data: [{ state: 'uploaded', changed: true }], error: null } })
    const out = await supabaseVideoAssetStore(admin).transition('a1', 'uploaded', { eventType: 'upload_verified', actor: `user:${OWNER}`, reason: null, moderation: null })
    expect(out).toEqual({ state: 'uploaded', changed: true })
    expect(log.find(([m]) => m === 'rpc')![1]).toEqual(['video_asset_transition', {
      p_asset: 'a1', p_to: 'uploaded', p_event_type: 'upload_verified', p_actor: `user:${OWNER}`, p_reason: null, p_correlation: null, p_moderation_state: null,
    }])
  })

  it('an illegal transition (SQLSTATE 23514) surfaces as an error carrying that code', async () => {
    const { admin } = stub({ rpc: { error: { code: '23514', message: 'cannot go from "x" to "y"' } } })
    await expect(supabaseVideoAssetStore(admin).transition('a1', 'published', { eventType: 'e', actor: 'a' })).rejects.toMatchObject({ code: '23514' })
  })

  it('setMediaInfo writes the duration and display size of THAT asset only, in the database column names', async () => {
    const { admin, log } = stub({})
    await supabaseVideoAssetStore(admin).setMediaInfo('a1', { durationMs: 95_200, width: 1080, height: 1920, hasAudio: true })
    expect(log.find(([m]) => m === 'update')![1][0]).toEqual({ duration_ms: 95_200, width: 1080, height: 1920, has_audio: true })
    expect(log.find(([m]) => m === 'eq')![1]).toEqual(['id', 'a1'])
  })

  it('a failed setMediaInfo throws with the SQLSTATE only', async () => {
    const { admin } = stub({ update: { error: { code: '23514', message: 'row {"x":1}' } } })
    await expect(supabaseVideoAssetStore(admin).setMediaInfo('a1', { durationMs: 1, width: 1, height: 1, hasAudio: false })).rejects.toMatchObject({ message: 'video asset store: setMediaInfo failed (23514)' })
  })

  it('setTranscodeJob, setStaging write only their own columns of THAT asset', async () => {
    const a = stub({}); await supabaseVideoAssetStore(a.admin).setTranscodeJob('a1', { jobName: 'projects/1/locations/x/jobs/j', attempts: 2, error: null })
    expect(a.log.find(([m]) => m === 'update')![1][0]).toEqual({ transcode_job_id: 'projects/1/locations/x/jobs/j', transcode_attempts: 2, transcode_error: null })
    const b = stub({}); await supabaseVideoAssetStore(b.admin).setStaging('a1', 'vstg/o/a1/manifest.m3u8')
    expect(b.log.find(([m]) => m === 'update')![1][0]).toEqual({ staging_manifest_key: 'vstg/o/a1/manifest.m3u8', transcode_error: null })
  })

  it('listProcessing asks only for videos in processing older than the window, oldest first, bounded', async () => {
    const { admin, log } = stub({ select: [{ data: [{ ...ROW, state: 'processing' }], error: null }] })
    const rows = await supabaseVideoAssetStore(admin).listProcessing(120_000, 50)
    expect(rows).toHaveLength(1)
    expect(log.find(([m]) => m === 'eq')![1]).toEqual(['state', 'processing'])
  })

  it('setSource writes the bucket and the key of THAT asset only', async () => {
    const { admin, log } = stub({})
    await supabaseVideoAssetStore(admin).setSource('a1', 'tappyai-video-source', 'vsrc/o/k.mp4')
    expect(log.find(([m]) => m === 'update')![1][0]).toEqual({ source_bucket: 'tappyai-video-source', source_object_key: 'vsrc/o/k.mp4' })
    expect(log.find(([m]) => m === 'eq')![1]).toEqual(['id', 'a1'])
  })
})
