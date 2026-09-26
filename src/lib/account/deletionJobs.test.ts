import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processAccountDeletionJobs } from './deletionJobs'

// F-096 · the queue worker: revoke the Google grant, delete the uploads, confirm nothing is left,
// and only then mark the job done. Synthetic ids; a fake bucket and a fake queue table.

const U = '11111111-1111-4111-8111-111111111111'
const G = 'aaaaaaaa-0000-4000-8000-000000000001'

interface Job { id: string; user_id: string; group_ids: string[]; google_tokens: string[]; attempts: number; media_deleted: number | null; done_at?: string | null; last_error?: string | null }

function fakeDb(jobs: Job[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q; q.is = () => q; q.lt = () => q; q.order = () => q
      q.limit = async () => ({ data: jobs.filter(j => !j.done_at), error: null })
      q.update = (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null } } })
      return q
    },
  } as unknown as SupabaseClient
  return { db, updates }
}

function fakeBucket(names: string[], opts: { failDeleteOf?: string; failList?: boolean } = {}) {
  const store = new Set(names)
  const listed: string[] = []
  return {
    store, listed,
    media: {
      async listObjects(prefix: string) {
        listed.push(prefix)
        if (opts.failList) throw new Error('Media provider "gcs" list failed (HTTP 403)')
        return [...store].filter(n => n.startsWith(prefix))
      },
      async deleteObject(key: string) {
        if (key === opts.failDeleteOf) return true // claims success, object stays — the re-list must catch it
        return store.delete(key)
      },
    },
  }
}

const job = (over: Partial<Job> = {}): Job => ({ id: 'j1', user_id: U, group_ids: [G], google_tokens: ['1//tok'], attempts: 0, media_deleted: null, ...over })
const FILES = [`avatars/${U}-a.jpg`, `covers/${U}-b.jpg`, `reviews/${U}/1.jpg`, `videos/${U}/v.mp4`, `thumbnails/${U}/t.jpg`, `music/${U}/m.mp3`, `avatars/group-${G}-g.jpg`]
const OTHERS = ['avatars/22222222-2222-4222-8222-222222222222-x.jpg', 'reviews/22222222-2222-4222-8222-222222222222/9.jpg', `deals/${U}/banner.png`]

describe('processAccountDeletionJobs', () => {
  it('revokes the grant, deletes every upload of the user and their groups, nobody else’s, then marks done', async () => {
    const { db, updates } = fakeDb([job()])
    const bucket = fakeBucket([...FILES, ...OTHERS])
    const revoked: string[] = []
    const r = await processAccountDeletionJobs({ db, media: bucket.media, revoke: async t => { revoked.push(t); return true } })
    expect(r).toEqual({ processed: 1, completed: 1, failed: 0, objectsDeleted: 7, tokensRevoked: 1 })
    expect(revoked).toEqual(['1//tok'])
    expect([...bucket.store].sort()).toEqual([...OTHERS].sort()) // deal artwork and other users untouched
    expect(updates[0].patch).toMatchObject({ attempts: 1, google_tokens: [], media_deleted: 7, last_error: null })
    expect(updates[0].patch.done_at).toEqual(expect.any(String))
  })

  it('a revoke that fails keeps the job pending with that token; the files still go', async () => {
    const { db, updates } = fakeDb([job()])
    const bucket = fakeBucket(FILES)
    const r = await processAccountDeletionJobs({ db, media: bucket.media, revoke: async () => false })
    expect(r.completed).toBe(0)
    expect(bucket.store.size).toBe(0)
    expect(updates[0].patch).toMatchObject({ google_tokens: ['1//tok'], done_at: null, last_error: 'google revoke did not complete' })
  })

  it('🚨 an object that survives its delete keeps the job pending — "done" means the re-list is empty', async () => {
    const { db, updates } = fakeDb([job({ google_tokens: [] })])
    const bucket = fakeBucket(FILES, { failDeleteOf: `reviews/${U}/1.jpg` })
    const r = await processAccountDeletionJobs({ db, media: bucket.media, revoke: async () => true })
    expect(r.failed).toBe(1)
    expect(updates[0].patch).toMatchObject({ attempts: 1, last_error: 'objects remain after deletion' })
    expect(updates[0].patch.done_at).toBeUndefined()
  })

  it('a bucket that refuses the listing records the error and retries later', async () => {
    const { db, updates } = fakeDb([job({ google_tokens: [] })])
    const bucket = fakeBucket(FILES, { failList: true })
    const r = await processAccountDeletionJobs({ db, media: bucket.media, revoke: async () => true })
    expect(r.failed).toBe(1)
    expect(updates[0].patch.last_error).toContain('list failed (HTTP 403)')
  })

  it('🚨 a malformed user id never reaches the bucket', async () => {
    const { db } = fakeDb([job({ user_id: '', google_tokens: [] })])
    const bucket = fakeBucket(FILES)
    const r = await processAccountDeletionJobs({ db, media: bucket.media, revoke: async () => true })
    expect(r.failed).toBe(1)
    expect(bucket.listed).toEqual([])
    expect(bucket.store.size).toBe(FILES.length)
  })

  it('🚨 tokens and object names never appear in what the worker records as an error', async () => {
    const { db, updates } = fakeDb([job({ google_tokens: ['1//secret-token'] })])
    const bucket = fakeBucket(FILES, { failDeleteOf: `reviews/${U}/1.jpg` })
    await processAccountDeletionJobs({ db, media: bucket.media, revoke: async () => true })
    const err = String(updates[0].patch.last_error)
    expect(err).not.toContain('secret-token')
    expect(err).not.toContain(U)
  })
})
