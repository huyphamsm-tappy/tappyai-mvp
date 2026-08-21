import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { orderNotes, listNotes, addNote, NOTES_PAGE_SIZE, type UserNoteRow } from './userNotes'

// Module 08 — internal admin notes, the derivation and read layer.
//
// §3.8 states the order in six words — "Pinned notes shown at top" — over a
// chronological list. Two keys, and the interesting cases are all about what
// happens when they disagree.

const row = (over: Partial<UserNoteRow> = {}): UserNoteRow => ({
  id: 'n1',
  user_id: 'u1',
  author_id: 'a1',
  note: 'called support, verified identity',
  is_pinned: false,
  created_at: '2026-08-10T00:00:00Z',
  updated_at: '2026-08-10T00:00:00Z',
  ...over,
})

describe('§3.8 — pinned at top, then newest first', () => {
  it('a pinned note outranks a NEWER unpinned one', () => {
    // The case that separates the two keys. Chronological alone would put the
    // newer note first and quietly bury the one an operator deliberately
    // pinned — which is the entire point of pinning.
    const out = orderNotes([
      row({ id: 'new', created_at: '2026-08-20T00:00:00Z' }),
      row({ id: 'pinned-old', is_pinned: true, created_at: '2026-08-01T00:00:00Z' }),
    ])
    expect(out.map((n) => n.id)).toEqual(['pinned-old', 'new'])
  })

  it('among pinned notes, newest first', () => {
    const out = orderNotes([
      row({ id: 'p-old', is_pinned: true, created_at: '2026-08-01T00:00:00Z' }),
      row({ id: 'p-new', is_pinned: true, created_at: '2026-08-09T00:00:00Z' }),
    ])
    expect(out.map((n) => n.id)).toEqual(['p-new', 'p-old'])
  })

  it('among unpinned notes, newest first', () => {
    const out = orderNotes([
      row({ id: 'old', created_at: '2026-08-01T00:00:00Z' }),
      row({ id: 'new', created_at: '2026-08-09T00:00:00Z' }),
    ])
    expect(out.map((n) => n.id)).toEqual(['new', 'old'])
  })

  it('does not mutate its input', () => {
    const input = [row({ id: 'a' }), row({ id: 'b', is_pinned: true })]
    orderNotes(input)
    expect(input.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('an empty list stays empty', () => {
    expect(orderNotes([])).toEqual([])
  })
})

describe('reading — an unreachable table is not an empty one', () => {
  function client(result: { data: unknown; error: { message: string } | null } | Error): SupabaseClient {
    const terminal = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
    const proxy: SupabaseClient = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          // BOTH branches forwarded: a `then` that ignores its reject handler
          // makes an awaited rejection hang instead of failing.
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => terminal().then(res, rej)
        }
        return () => proxy
      },
    }) as unknown as SupabaseClient
    return { from: () => proxy } as unknown as SupabaseClient
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('🔑 a query error is ERROR, never empty', async () => {
    // Before the migration is applied this table does not exist at all, so
    // "there are no notes" and "we could not read the notes" are genuinely
    // different answers an operator would act on differently.
    const r = await listNotes(client({ data: null, error: { message: 'relation does not exist' } }), 'u1')
    expect(r.status).toBe('error')
    expect(r.notes).toEqual([])
  })

  it('a thrown driver failure is ERROR and does not propagate', async () => {
    const r = await listNotes(client(new Error('socket closed')), 'u1')
    expect(r.status).toBe('error')
  })

  it('a successful empty read is EMPTY', async () => {
    const r = await listNotes(client({ data: [], error: null }), 'u1')
    expect(r.status).toBe('empty')
  })

  it('a successful read is ordered by the §3.8 rule, not by arrival', async () => {
    const r = await listNotes(
      client({
        data: [row({ id: 'new', created_at: '2026-08-20T00:00:00Z' }), row({ id: 'pin', is_pinned: true })],
        error: null,
      }),
      'u1'
    )
    expect(r.status).toBe('ok')
    expect(r.notes.map((n) => n.id)).toEqual(['pin', 'new'])
  })

  it('the page size is bounded — a person is not a filing cabinet', () => {
    expect(NOTES_PAGE_SIZE).toBeLessThanOrEqual(100)
  })
})

describe('writing — the author is the actor, never the caller’s claim', () => {
  it('🔑 author_id comes from the argument the ROUTE supplies', async () => {
    // The route passes the authenticated actor. If this ever read an author
    // from request input, any note could be attributed to anyone — including
    // to an administrator who never wrote it.
    let inserted: Record<string, unknown> | null = null
    const admin = {
      from: () => ({
        insert(v: Record<string, unknown>) {
          inserted = v
          return { select: () => ({ single: async () => ({ data: row(), error: null }) }) }
        },
      }),
    } as unknown as SupabaseClient

    await addNote(admin, { userId: 'u1', authorId: 'actor-9', note: 'hello' })
    expect(inserted).toMatchObject({ user_id: 'u1', author_id: 'actor-9', note: 'hello' })
  })

  it('is_pinned defaults to false when the caller says nothing', async () => {
    let inserted: Record<string, unknown> | null = null
    const admin = {
      from: () => ({
        insert(v: Record<string, unknown>) {
          inserted = v
          return { select: () => ({ single: async () => ({ data: row(), error: null }) }) }
        },
      }),
    } as unknown as SupabaseClient

    await addNote(admin, { userId: 'u1', authorId: 'a1', note: 'hello' })
    expect(inserted).toMatchObject({ is_pinned: false })
  })

  it('a failed insert returns null rather than a fabricated row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: { message: 'denied' } }) }),
        }),
      }),
    } as unknown as SupabaseClient

    expect(await addNote(admin, { userId: 'u1', authorId: 'a1', note: 'x' })).toBeNull()
  })
})

describe('🔑 the §3 role matrix, pinned', () => {
  // `12_RBAC.md` §3 states the authority for notes exactly once — "User — Add
  // notes": analyst ❌ · moderator ✅ · admin ✅ · super_admin ✅. §3 states no
  // separate READ authority, so both ids carry the same roles.
  //
  // Without this, widening either permission to `analyst` — handing the whole
  // reporting population every operator's written opinion of every user —
  // changes one array and fails nothing.
  const EXPECTED = ['moderator', 'admin', 'super_admin']

  it.each(['users.notes.read', 'users.notes.write'])('%s carries exactly §3’s roles', async (id) => {
    const { permissionRegistry } = await import('@/lib/admin/permissions/registry')
    const def = permissionRegistry.get(id as never)
    expect(def, `${id} is not in the registry`).toBeDefined()
    expect([...(def!.defaultRoles as readonly string[])].sort()).toEqual([...EXPECTED].sort())
  })

  it('analyst holds NEITHER — §3 says ❌', async () => {
    const { permissionRegistry } = await import('@/lib/admin/permissions/registry')
    for (const id of ['users.notes.read', 'users.notes.write']) {
      expect(permissionRegistry.get(id as never)!.defaultRoles).not.toContain('analyst')
    }
  })
})

describe('this module decides nothing about authorization', () => {
  it('🔑 never references the PDP, a permission, or a role', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(__dirname, 'userNotes.ts'), 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.length).toBeLessThan(raw.length) // the stripper really strips
    for (const f of ['requirePermission', 'permissionEngine', 'PERMISSIONS', 'super_admin', 'moderator', 'isOwner']) {
      expect(code, `references ${f}`).not.toContain(f)
    }
  })

  it('🔑 never joins profiles — an internal record gains no display name here', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const code = readFileSync(join(__dirname, 'userNotes.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toContain('profiles')
    expect(code).not.toContain('full_name')
  })
})
