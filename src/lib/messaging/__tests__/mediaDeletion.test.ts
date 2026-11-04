import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createChatMediaDeleter } from '../mediaDeletion'

// A deleted account's pictures in the private chat-media bucket are removed (the other person's pictures in the same conversations are not). The account is already gone
// when the deletion job runs, so the rows' sender_id is NULL: the pictures are found by the user id inside their path, "<thread>/<user>/<file>".

const U = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'
const T = '99999999-9999-4999-8999-999999999999'

function fake(rows: string[], opts: { removeError?: string; selectError?: string } = {}) {
  const calls = { likes: [] as string[], removed: [] as string[][], bucket: '', pages: 0 }
  // The rows KEEP their path after the object is removed (a picture-only message needs one): `gone` is where removed paths go on being returned by the query.
  const gone: string[] = []
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      let pattern = ''
      let after = ''
      q.select = () => q
      q.like = (_c: string, p: string) => { pattern = p; calls.likes.push(p); return q }
      q.gt = (_c: string, v: string) => { after = v; return q }
      q.order = () => q
      q.limit = async (n: number) => {
        if (opts.selectError) return { data: null, error: { message: opts.selectError } }
        calls.pages++
        // the like pattern is "%/<user>/%": a row matches when its path contains "/<user>/"; paging is keyset (strictly after the last path), ascending
        const needle = pattern.replace(/^%/, '').replace(/%$/, '')
        const hit = [...rows, ...gone].filter(r => r.includes(needle) && r > after).sort().slice(0, n)
        return { data: hit.map(media_path => ({ media_path })), error: null }
      }
      return q
    },
    storage: {
      from: (bucket: string) => {
        calls.bucket = bucket
        return {
          remove: async (paths: string[]) => {
            if (opts.removeError) return { data: null, error: { message: opts.removeError } }
            calls.removed.push(paths)
            for (const p of paths) { const i = rows.indexOf(p); if (i >= 0) { rows.splice(i, 1); gone.push(p) } }
            return { data: paths.map(name => ({ name })), error: null }
          },
        }
      },
    },
  } as unknown as SupabaseClient
  return { db, calls, rows }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

describe('createChatMediaDeleter · deleteForUser', () => {
  it('removes ONLY the objects under this user\'s folder, from the private chat-media bucket, and returns how many', async () => {
    const f = fake([`${T}/${U}/a.webp`, `${T}/${U}/b.jpg`, `${T}/${V}/theirs.webp`])
    const n = await createChatMediaDeleter(f.db).deleteForUser(U)
    expect(n).toBe(2)
    expect(f.calls.bucket).toBe('chat-media')
    expect(f.calls.removed.flat().sort()).toEqual([`${T}/${U}/a.webp`, `${T}/${U}/b.jpg`])
    expect(f.rows).toEqual([`${T}/${V}/theirs.webp`]) // the other person's picture in the same conversation stays
  })

  it('looks the pictures up by the user id inside the path ("%/<user>/%"), because the account is gone and sender_id is NULL', async () => {
    const f = fake([])
    await createChatMediaDeleter(f.db).deleteForUser(U)
    expect(f.calls.likes).toEqual([`%/${U}/%`])
  })

  it('a user with no pictures removes nothing and makes no storage call', async () => {
    const f = fake([`${T}/${V}/x.jpg`])
    expect(await createChatMediaDeleter(f.db).deleteForUser(U)).toBe(0)
    expect(f.calls.removed).toEqual([])
  })

  it('works through more than one page of rows (the rows keep their path after removal, so it must NOT read from the start again) and removes in chunks of at most 100', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => `${T}/${U}/f${String(i).padStart(5, '0')}.jpg`)
    const f = fake(rows)
    expect(await createChatMediaDeleter(f.db).deleteForUser(U)).toBe(2500)
    expect(Math.max(...f.calls.removed.map(c => c.length))).toBeLessThanOrEqual(100)
    expect(f.rows).toEqual([])
    expect(f.calls.pages).toBe(3) // 1000 + 1000 + 500: it stops, it does not loop
  })

  it('🚨 an id that is not a uuid is refused BEFORE any query — a pattern built from it could match another person\'s pictures', async () => {
    const f = fake([`${T}/${U}/a.jpg`])
    for (const bad of ['', '%', `${U}%`, 'x/../y', "1'; drop", '*']) {
      await expect(createChatMediaDeleter(f.db).deleteForUser(bad), JSON.stringify(bad)).rejects.toThrow()
    }
    expect(f.calls.likes).toEqual([])
    expect(f.calls.removed).toEqual([])
  })

  it('before migration 20261109 the picture column does not exist (SQLSTATE 42703): there are no pictures to remove, so it is 0 — it must not wedge every account deletion', async () => {
    const db = { from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.like = () => q; q.gt = () => q; q.order = () => q; q.limit = async () => ({ data: null, error: { code: '42703', message: 'column chat_messages.media_path does not exist' } }); return q } } as unknown as SupabaseClient
    await expect(createChatMediaDeleter(db).deleteForUser(U)).resolves.toBe(0)
  })

  it('a failed read or a failed removal THROWS (the job stays queued and is retried) — it never reports success', async () => {
    await expect(createChatMediaDeleter(fake([`${T}/${U}/a.jpg`], { selectError: 'db down' }).db).deleteForUser(U)).rejects.toThrow()
    await expect(createChatMediaDeleter(fake([`${T}/${U}/a.jpg`], { removeError: 'storage down' }).db).deleteForUser(U)).rejects.toThrow()
  })
})
