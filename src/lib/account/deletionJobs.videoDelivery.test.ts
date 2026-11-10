import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processAccountDeletionJobs } from './deletionJobs'

// Explore video (publishing + delivery): the account-deletion job also removes the approved HLS copies from the DELIVERY bucket, and never reports done while they may remain.
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

describe('processAccountDeletionJobs — delivery copies', () => {
  it('runs the delivery deleter once for the job\'s user and adds its count to the total', async () => {
    const { db, updates } = fakeDb([job()])
    const asked: string[] = []
    const r = await processAccountDeletionJobs({ db, media: emptyPublic, revoke: async () => true, videoDelivery: { deleteForUser: async (id) => { asked.push(id); return 7 } } })
    expect(asked).toEqual([U])
    expect(r.objectsDeleted).toBe(7)
    expect(r.completed).toBe(1)
    expect(updates[0].patch.done_at).toEqual(expect.any(String))
  })

  it('🚨 a delivery-deletion failure keeps the job pending with the error recorded — never done while an approved copy may still be served', async () => {
    const { db, updates } = fakeDb([job()])
    const r = await processAccountDeletionJobs({ db, media: emptyPublic, revoke: async () => true, videoDelivery: { deleteForUser: async () => { throw new Error('video delivery: objects remain after deletion') } } })
    expect(r.failed).toBe(1)
    expect(r.completed).toBe(0)
    expect(updates[0].patch.done_at).toBeUndefined()
    expect(updates[0].patch.last_error).toBe('video delivery: objects remain after deletion')
  })

  it('without a delivery deleter the job behaves exactly as before; with all three private stores they run in order chat, source, delivery', async () => {
    const plain = fakeDb([job()])
    expect((await processAccountDeletionJobs({ db: plain.db, media: emptyPublic, revoke: async () => true })).completed).toBe(1)
    const { db } = fakeDb([job()])
    const order: string[] = []
    await processAccountDeletionJobs({
      db, media: emptyPublic, revoke: async () => true,
      chatMedia: { deleteForUser: async () => { order.push('chat'); return 0 } },
      videoSource: { deleteForUser: async () => { order.push('source'); return 0 } },
      videoDelivery: { deleteForUser: async () => { order.push('delivery'); return 0 } },
    })
    expect(order).toEqual(['chat', 'source', 'delivery'])
  })
})
