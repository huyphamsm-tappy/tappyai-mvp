import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processAccountDeletionJobs } from './deletionJobs'

// Explore video part 3: the account-deletion job also removes the private video SOURCE files, and never reports done while they may remain.
const U = '11111111-1111-4111-8111-111111111111'

interface Job { id: string; user_id: string; group_ids: string[]; google_tokens: string[]; attempts: number; media_deleted: number | null; done_at?: string | null }
function fakeDb(jobs: Job[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q; q.is = () => q; q.lt = () => q; q.order = () => q; q.not = () => q; q.eq = () => q
      q.limit = async () => ({ data: jobs.filter(j => !j.done_at), error: null })
      q.update = (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null } } })
      return q
    },
  } as unknown as SupabaseClient
  return { db, updates }
}
const emptyPublic = { async listObjects() { return [] as string[] }, async deleteObject() { return true } }
const job = (): Job => ({ id: 'j1', user_id: U, group_ids: [], google_tokens: [], attempts: 0, media_deleted: null })

describe('processAccountDeletionJobs — private video sources', () => {
  it('runs the source deleter once for the job\'s user, after the public files, and adds its count to the job\'s total', async () => {
    const { db, updates } = fakeDb([job()])
    const asked: string[] = []
    const r = await processAccountDeletionJobs({ db, media: emptyPublic, revoke: async () => true, videoSource: { deleteForUser: async (id) => { asked.push(id); return 4 } } })
    expect(asked).toEqual([U])
    expect(r.objectsDeleted).toBe(4)
    expect(r.completed).toBe(1)
    expect(updates[0].patch).toMatchObject({ media_deleted: 4, last_error: null })
    expect(updates[0].patch.done_at).toEqual(expect.any(String))
  })

  it('🚨 a source-deletion failure keeps the job pending with the error recorded — "done" is never reported while the source video may still be there', async () => {
    const { db, updates } = fakeDb([job()])
    const r = await processAccountDeletionJobs({ db, media: emptyPublic, revoke: async () => true, videoSource: { deleteForUser: async () => { throw new Error('objects remain after deletion') } } })
    expect(r.failed).toBe(1)
    expect(r.completed).toBe(0)
    expect(updates[0].patch.done_at).toBeUndefined()
    expect(updates[0].patch.last_error).toBe('objects remain after deletion')
    expect(updates[0].patch.attempts).toBe(1)
  })

  it('without a source deleter the job behaves exactly as before', async () => {
    const { db, updates } = fakeDb([job()])
    const r = await processAccountDeletionJobs({ db, media: emptyPublic, revoke: async () => true })
    expect(r.completed).toBe(1)
    expect(updates[0].patch).toMatchObject({ media_deleted: 0 })
  })

  it('runs the chat-picture and the video-source deleters both, in that order', async () => {
    const { db } = fakeDb([job()])
    const order: string[] = []
    await processAccountDeletionJobs({
      db, media: emptyPublic, revoke: async () => true,
      chatMedia: { deleteForUser: async () => { order.push('chat'); return 1 } },
      videoSource: { deleteForUser: async () => { order.push('video'); return 2 } },
    })
    expect(order).toEqual(['chat', 'video'])
  })
})
