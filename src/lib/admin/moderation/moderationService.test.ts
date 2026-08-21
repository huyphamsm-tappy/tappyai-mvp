import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listQueue,
  distinctSourceCount,
  statusFor,
  actionFor,
  publicationStateFor,
  QUEUE_PAGE_SIZE,
} from './moderationService'

// Module 09 — the read layer.
//
// The assertions that matter here are ADR-026's: what the projection is allowed
// to return, and what a moderator gets INSTEAD of the provenance id.

const item = (over = {}) => ({
  id: 'q1', type: 'music_report', status: 'pending', priority: 1,
  reported_by: 'u1', target_type: 'music_track', target_id: 't1',
  reason: 'copyright', assigned_to: null, resolved_by: null, resolution: null,
  created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z', resolved_at: null,
  ...over,
})

/** Records the exact select/order/eq calls so the projection can be asserted. */
function client(result: { data: unknown; error: { message: string } | null } | Error) {
  const calls: [string, ...unknown[]][] = []
  const terminal = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
  const proxy: SupabaseClient = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => terminal().then(res, rej)
      }
      return (...args: unknown[]) => { calls.push([prop, ...args]); return proxy }
    },
  }) as unknown as SupabaseClient
  return { admin: { from: () => proxy } as unknown as SupabaseClient, calls }
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

describe('🔑 ADR-026 I-5 — metadata never leaves the server', () => {
  it('the queue projection names its columns and EXCLUDES metadata', async () => {
    // `select('*')` would return `reporter_source_id` to every caller allowed
    // to read the queue. A caller cannot receive what was never read, and that
    // is the whole enforcement — not remembering to strip it later.
    const { admin, calls } = client({ data: [item()], error: null })
    await listQueue(admin)
    const select = calls.find(([n]) => n === 'select')!
    expect(select[1]).not.toContain('metadata')
    expect(select[1]).not.toBe('*')
  })

  it('every §4.4 column a moderator needs IS projected', async () => {
    const { admin, calls } = client({ data: [], error: null })
    await listQueue(admin)
    const cols = String(calls.find(([n]) => n === 'select')![1])
    for (const c of ['id', 'type', 'status', 'priority', 'reported_by', 'target_type', 'target_id', 'reason']) {
      expect(cols, `missing ${c}`).toContain(c)
    }
  })

  it('a returned item carries no metadata key at all', async () => {
    const { admin } = client({ data: [item()], error: null })
    const r = await listQueue(admin)
    expect(JSON.stringify(r.items)).not.toContain('metadata')
    expect(JSON.stringify(r.items)).not.toContain('reporter_source_id')
  })
})

describe('the queue is a worklist, ordered like its index', () => {
  it('asks for urgent first, then oldest first', async () => {
    const { admin, calls } = client({ data: [item()], error: null })
    await listQueue(admin)
    const orders = calls.filter(([n]) => n === 'order')
    expect(orders[0]).toEqual(['order', 'priority', { ascending: false }])
    expect(orders[1]).toEqual(['order', 'created_at', { ascending: true }])
  })

  it('bounds the page', async () => {
    const { admin, calls } = client({ data: [], error: null })
    await listQueue(admin)
    expect(calls.find(([n]) => n === 'limit')).toEqual(['limit', QUEUE_PAGE_SIZE])
    expect(QUEUE_PAGE_SIZE).toBeLessThanOrEqual(50)
  })

  it('filters by status only when asked', async () => {
    const withFilter = client({ data: [], error: null })
    await listQueue(withFilter.admin, { status: 'pending' })
    expect(withFilter.calls.find(([n]) => n === 'eq')).toEqual(['eq', 'status', 'pending'])

    const without = client({ data: [], error: null })
    await listQueue(without.admin)
    expect(without.calls.find(([n]) => n === 'eq')).toBeUndefined()
  })
})

describe('a failed read is not an empty queue', () => {
  it('🔑 a query error is ERROR — "no reports" is a claim a moderator acts on', async () => {
    const { admin } = client({ data: null, error: { message: 'relation does not exist' } })
    expect((await listQueue(admin)).status).toBe('error')
  })

  it('a thrown failure is ERROR and does not propagate', async () => {
    const { admin } = client(new Error('socket closed'))
    expect((await listQueue(admin)).status).toBe('error')
  })

  it('a successful empty read is EMPTY', async () => {
    const { admin } = client({ data: [], error: null })
    expect((await listQueue(admin)).status).toBe('empty')
  })
})

describe('🔑 distinct sources — the number leaves, the id does not', () => {
  it('counts two different provenance ids as two sources', async () => {
    // The signal `content_reports`' UNIQUE constraint exists to preserve: five
    // reports from one person are not five people.
    const { admin } = client({
      data: [
        { metadata: { reporter_source_id: 'src-a', source_id: '1' } },
        { metadata: { reporter_source_id: 'src-b', source_id: '2' } },
      ],
      error: null,
    })
    expect(await distinctSourceCount(admin, 'review', 'r1')).toBe(2)
  })

  it('🔑 the same source reporting twice counts ONCE', async () => {
    const { admin } = client({
      data: [
        { metadata: { reporter_source_id: 'src-a', source_id: '1' } },
        { metadata: { reporter_source_id: 'src-a', source_id: '2' } },
      ],
      error: null,
    })
    expect(await distinctSourceCount(admin, 'review', 'r1')).toBe(1)
  })

  it('music reports have no provenance id and still count individually', async () => {
    const { admin } = client({
      data: [
        { metadata: { source_table: 'music_track_reports', source_id: '1' } },
        { metadata: { source_table: 'music_track_reports', source_id: '2' } },
      ],
      error: null,
    })
    expect(await distinctSourceCount(admin, 'music_track', 't1')).toBe(2)
  })

  it('🔑 an unreadable count is NULL, never 0', async () => {
    // 0 sources would tell a moderator nobody reported this — the opposite of
    // what an unreadable count means.
    const { admin } = client({ data: null, error: { message: 'boom' } })
    expect(await distinctSourceCount(admin, 'review', 'r1')).toBeNull()
  })

  it('a thrown failure is NULL too', async () => {
    const { admin } = client(new Error('socket closed'))
    expect(await distinctSourceCount(admin, 'review', 'r1')).toBeNull()
  })

  it('returns a NUMBER, never the ids themselves', async () => {
    const { admin } = client({ data: [{ metadata: { reporter_source_id: 'src-secret' } }], error: null })
    const n = await distinctSourceCount(admin, 'review', 'r1')
    expect(typeof n).toBe('number')
    expect(JSON.stringify(n)).not.toContain('src-secret')
  })
})

describe('resolutions map to §4.4 status and §4.5 action', () => {
  it('🔑 dismiss is DISMISSED; every real decision is RESOLVED', async () => {
    // §4.4's enum has both, and they are not interchangeable: "we looked and
    // there was nothing" is a different outcome from "we acted".
    expect(statusFor('dismiss')).toBe('dismissed')
    for (const k of ['hide', 'restore', 'delete'] as const) expect(statusFor(k)).toBe('resolved')
  })

  it.each([
    ['dismiss', 'dismiss_report'],
    ['hide', 'hide_content'],
    ['restore', 'restore_content'],
    ['delete', 'delete_content'],
  ] as const)('%s records %s', (kind, action) => {
    expect(actionFor(kind)).toBe(action)
  })

  it('🔑 hide sets the GATE’s own publication_state, not a parallel flag', async () => {
    // `20260817_content_safety_gate.sql` owns `reviews.publication_state`.
    // Two ways to hide a review is one too many.
    expect(publicationStateFor('hide')).toBe('RESTRICTED')
    expect(publicationStateFor('restore')).toBe('PUBLISHED')
  })
})

describe('this module decides nothing about authorization', () => {
  it('🔑 never references the PDP, a permission, or a role', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(__dirname, 'moderationService.ts'), 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.length).toBeLessThan(raw.length) // the stripper really strips
    for (const f of ['requirePermission', 'permissionEngine', 'PERMISSIONS', 'super_admin', 'moderator', 'isOwner']) {
      expect(code, `references ${f}`).not.toContain(f)
    }
  })
})
