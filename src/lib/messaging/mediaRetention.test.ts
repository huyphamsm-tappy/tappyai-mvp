import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runChatMediaRetention, CHAT_MEDIA_RETENTION_DAYS, ORPHAN_MIN_AGE_HOURS } from './mediaRetention'

/**
 * The retention job: pictures older than the period are removed from the private bucket and their message is stamped; unused uploads are removed; the object goes BEFORE
 * the stamp; failures throw; a database without the migration is "nothing to do".
 */

interface Opts {
  due?: Array<Array<{ id: string; media_path: string | null }>>
  orphans?: Array<Array<{ name: string | null }>>
  readError?: { code?: string } | null
  rpcError?: { code?: string } | null
  removeError?: boolean
  stampError?: boolean
}
function fakeDb(o: Opts = {}) {
  const log: string[] = []
  const calls = { cutoff: '', removed: [] as string[][], stamped: [] as string[][], rpc: [] as unknown[] }
  const dueQueue = [...(o.due ?? [])]
  const orphanQueue = [...(o.orphans ?? [])]
  const sel: Record<string, unknown> = {}
  for (const m of ['select', 'not', 'is', 'order', 'limit']) sel[m] = () => sel
  sel.lt = (_c: string, v: string) => { calls.cutoff = v; return sel }
  ;(sel as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(o.readError ? { data: null, error: o.readError } : { data: dueQueue.shift() ?? [], error: null }).then(res)
  const db = {
    from: () => ({
      select: () => sel,
      update: () => ({ in: (_c: string, ids: string[]) => { log.push('stamp'); calls.stamped.push(ids); return Promise.resolve({ error: o.stampError ? { message: 'x' } : null }) } }),
    }),
    storage: { from: () => ({ remove: async (p: string[]) => { log.push('remove'); calls.removed.push(p); return { data: p.map(name => ({ name })), error: o.removeError ? { message: 'x' } : null } } }) },
    rpc: async (fn: string, args: unknown) => { calls.rpc.push([fn, args]); return o.rpcError ? { data: null, error: o.rpcError } : { data: orphanQueue.shift() ?? [], error: null } },
  }
  return { db: db as unknown as SupabaseClient, log, calls }
}
const NOW = new Date('2026-12-01T00:00:00.000Z')

describe('runChatMediaRetention', () => {
  it('expires pictures older than the period: the cutoff is exactly the retention period before now', async () => {
    const { db, calls } = fakeDb()
    await runChatMediaRetention(db, NOW)
    expect(CHAT_MEDIA_RETENTION_DAYS).toBe(30)
    expect(calls.cutoff).toBe('2026-11-01T00:00:00.000Z')
  })

  it('removes the objects, THEN stamps the messages, and counts them', async () => {
    const { db, log, calls } = fakeDb({ due: [[{ id: 'm1', media_path: 't/u/a.webp' }, { id: 'm2', media_path: 't/u/b.webp' }]] })
    const r = await runChatMediaRetention(db, NOW)
    expect(r).toEqual({ expired: 2, orphans: 0 })
    expect(log.slice(0, 2)).toEqual(['remove', 'stamp'])
    expect(calls.removed[0]).toEqual(['t/u/a.webp', 't/u/b.webp'])
    expect(calls.stamped[0]).toEqual(['m1', 'm2'])
  })

  it('a failed removal throws and stamps NOTHING (the file is still tracked, the next run retries)', async () => {
    const { db, log } = fakeDb({ due: [[{ id: 'm1', media_path: 't/u/a.webp' }]], removeError: true })
    await expect(runChatMediaRetention(db, NOW)).rejects.toThrow('removal failed')
    expect(log).not.toContain('stamp')
  })

  it('a failed stamp throws (the removal was already done and is simply repeated next time)', async () => {
    const { db } = fakeDb({ due: [[{ id: 'm1', media_path: 't/u/a.webp' }]], stampError: true })
    await expect(runChatMediaRetention(db, NOW)).rejects.toThrow('stamp failed')
  })

  it('a read failure throws; a database without the column (42703) or the function (42883) is simply nothing to do', async () => {
    await expect(runChatMediaRetention(fakeDb({ readError: { code: 'XX000' } }).db, NOW)).rejects.toThrow('read failed')
    expect(await runChatMediaRetention(fakeDb({ readError: { code: '42703' }, rpcError: { code: '42883' } }).db, NOW)).toEqual({ expired: 0, orphans: 0 })
  })

  it('removes the orphans the database lists, asking for objects at least a day old', async () => {
    const { db, calls } = fakeDb({ orphans: [[{ name: 't/u/o1.webp' }, { name: 't/u/o2.webp' }]] })
    const r = await runChatMediaRetention(db, NOW)
    expect(r.orphans).toBe(2)
    expect(calls.rpc[0]).toEqual(['chat_media_orphans', { p_older_than_hours: ORPHAN_MIN_AGE_HOURS, p_limit: 200 }])
    expect(calls.removed.flat()).toEqual(['t/u/o1.webp', 't/u/o2.webp'])
  })

  it('an orphan-list failure other than "function missing" throws', async () => {
    await expect(runChatMediaRetention(fakeDb({ rpcError: { code: 'XX000' } }).db, NOW)).rejects.toThrow('orphan list failed')
  })

  it('a full batch is followed by another read; a short batch ends the loop', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, media_path: `t/u/${i}.webp` }))
    const { db } = fakeDb({ due: [full, [{ id: 'last', media_path: 't/u/last.webp' }]] })
    expect((await runChatMediaRetention(db, NOW)).expired).toBe(201)
  })

  it('never calls removal when there is nothing due or orphaned', async () => {
    const { db, calls } = fakeDb()
    expect(await runChatMediaRetention(db, NOW)).toEqual({ expired: 0, orphans: 0 })
    expect(calls.removed).toEqual([])
  })
})

vi.mock('./media', () => ({ CHAT_MEDIA_BUCKET: 'chat-media' }))
