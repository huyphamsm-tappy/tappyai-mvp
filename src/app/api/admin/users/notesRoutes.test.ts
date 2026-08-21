import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

// Module 08 — the ROUTE half of internal admin notes.
//
// `userNotes.test.ts` covers the read shape and the §3.8 order. This covers who
// is refused, what the audit trail records, and — the point of the file — what
// the audit trail is NOT allowed to record.
//
// These rows are an operator's written opinion of a person, kept without that
// person's knowledge. Two rules follow, and neither is obvious enough to leave
// unasserted:
//
//   • the note TEXT must never reach a second table. Copying it into the audit
//     log would duplicate the sensitive prose under different access rules —
//     the audit log is `audit.log.read`, admin+, a different population from
//     `users.notes.read`.
//   • `author_id` comes from the authenticated actor and never from the body,
//     or any note could be attributed to any administrator.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  auditDecision: vi.fn(),
  rpc: vi.fn(),
  inserted: null as Record<string, unknown> | null,
  selectResult: { data: [] as unknown, error: null as { message: string } | null },
  insertResult: { data: null as unknown, error: null as { message: string } | null },
  profileQueue: [] as unknown[],
}))

const engine = vi.hoisted(() => ({
  can: () => true,
  authorize: () => ({ allowed: true, reason: 'ROLE_GRANT' }),
}))

vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, isSameOrigin: h.isSameOrigin }
})
vi.mock('@/lib/admin/permissions', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requirePermission: h.requirePermission }
})
vi.mock('@/lib/admin/permissions/engine', () => ({ permissionEngine: engine }))
vi.mock('@/lib/admin/permissions/decisionAudit', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, auditAuthorizationDecision: h.auditDecision }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.writeAuditLog }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { GET, POST } from './[id]/notes/route'

const ACTOR = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const NOTE = 'called support, verified identity against the ticket'

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'user_notes') {
        const proxy: Record<string, unknown> = new Proxy({}, {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (res: (v: unknown) => unknown) => Promise.resolve(h.selectResult).then(res)
            }
            if (prop === 'insert') {
              return (v: Record<string, unknown>) => {
                h.inserted = v
                return {
                  select: () => ({ single: async () => h.insertResult }),
                }
              }
            }
            if (prop === 'single' || prop === 'maybeSingle') return async () => h.selectResult
            return () => proxy
          },
        })
        return proxy
      }
      // profiles, for guardMutationTarget's existence check
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown) =>
              Promise.resolve(h.profileQueue[0] ?? { data: { id: SUBJECT }, error: null }).then(res)
          }
          if (prop === 'single' || prop === 'maybeSingle')
            return async () => h.profileQueue[0] ?? { data: { id: SUBJECT }, error: null }
          return () => proxy
        },
      })
      return proxy
    },
    rpc: h.rpc,
  }
}

const ctx = () => ({
  user: { id: ACTOR, email: 'mod@tappyai.com' },
  actor: { userId: ACTOR, isOwner: false, roles: ['moderator'], capabilities: [] },
  decision: { allowed: true, reason: 'ROLE_GRANT' },
})

const noteRow = (over = {}) => ({
  id: 'n-1', user_id: SUBJECT, author_id: ACTOR, note: NOTE,
  is_pinned: false, created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z',
  ...over,
})

const list = (id = SUBJECT) =>
  GET(new Request(`https://www.tappyai.com/api/admin/users/${id}/notes`), { params: { id } })

const add = (body: unknown, id = SUBJECT) =>
  POST(
    new Request(`https://www.tappyai.com/api/admin/users/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: { id } }
  )

beforeEach(() => {
  vi.clearAllMocks()
  h.inserted = null
  h.selectResult = { data: [noteRow()], error: null }
  h.insertResult = { data: noteRow(), error: null }
  h.profileQueue = []
  h.requirePermission.mockResolvedValue(ctx())
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.rpc.mockResolvedValue({ data: false, error: null }) // fn_is_platform_owner
})

// ===========================================================================
// Authorization — two ids, and each route uses exactly one
// ===========================================================================
describe('authorization', () => {
  it('🔑 GET requires users.notes.read', async () => {
    await list()
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.USERS_NOTES_READ)
  })

  it('🔑 POST requires users.notes.write — NOT the read permission', async () => {
    await add({ note: NOTE })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.USERS_NOTES_WRITE)
  })

  it('a refused actor reads nothing', async () => {
    h.requirePermission.mockRejectedValueOnce(
      new AdminError('FORBIDDEN', 'Forbidden', 403)
    )
    const res = await list()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('the routes perform no role comparison', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(__dirname, '[id]', 'notes', 'route.ts'), 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.length).toBeLessThan(raw.length)
    for (const r of ['super_admin', 'moderator', 'analyst', 'highestRole']) {
      expect(code, `references ${r}`).not.toContain(r)
    }
  })
})

// ===========================================================================
// 🔑 The note text must not spread
// ===========================================================================
describe('🔑 the note text never leaves user_notes', () => {
  it('the LIST audit entry records a count, not the notes', async () => {
    await list()
    const entry = h.writeAuditLog.mock.calls[0][0]
    expect(entry).toMatchObject({ action: 'user.notes_listed', targetId: SUBJECT })
    expect(JSON.stringify(entry)).not.toContain(NOTE)
    expect(entry.metadata).toMatchObject({ returned: 1 })
  })

  it('the ADD audit entry records a length and a pin state, not the text', async () => {
    // The audit log is `audit.log.read` — admin+, a different population from
    // `users.notes.read`. Copying the prose there widens who can read it
    // without anyone deciding to.
    await add({ note: NOTE })
    const entry = h.writeAuditLog.mock.calls[0][0]
    expect(entry).toMatchObject({ action: 'user.note_added' })
    expect(JSON.stringify(entry)).not.toContain(NOTE)
    expect(entry.metadata).toMatchObject({ note_length: NOTE.length, pinned: false })
  })
})

// ===========================================================================
// 🔑 Authorship cannot be claimed
// ===========================================================================
describe('🔑 the author is the authenticated actor', () => {
  it('author_id is the actor, never the body', async () => {
    await add({ note: NOTE })
    expect(h.inserted).toMatchObject({ author_id: ACTOR, user_id: SUBJECT, note: NOTE })
  })

  it('a body that tries to set author_id is REJECTED, not ignored', async () => {
    // `.strict()`. Silently dropping it would let a caller believe the note was
    // filed under somebody else.
    const res = await add({ note: NOTE, author_id: OWNER_ID })
    expect(res.status).toBe(422)
    expect(h.inserted).toBeNull()
  })

  it('a body that tries to set user_id is rejected too', async () => {
    const res = await add({ note: NOTE, user_id: OWNER_ID })
    expect(res.status).toBe(422)
  })
})

// ===========================================================================
// Validation and guards
// ===========================================================================
describe('validation', () => {
  it('an empty note is refused', async () => {
    expect((await add({ note: '' })).status).toBe(422)
  })

  it('🔑 a whitespace-only note is refused — padding is not content', async () => {
    expect((await add({ note: '     ' })).status).toBe(422)
    expect(h.inserted).toBeNull()
  })

  it('an over-long note is refused', async () => {
    expect((await add({ note: 'x'.repeat(2001) })).status).toBe(422)
  })

  it('the stored note is TRIMMED', async () => {
    await add({ note: `   ${NOTE}   ` })
    expect(h.inserted).toMatchObject({ note: NOTE })
  })

  it('a malformed user id is refused before any read', async () => {
    const res = await list('not-a-uuid')
    expect(res.status).toBe(422)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('a cross-origin request neither reads nor writes', async () => {
    h.isSameOrigin.mockReturnValue(false)
    expect((await list()).status).toBe(403)
    expect((await add({ note: NOTE })).status).toBe(403)
    expect(h.inserted).toBeNull()
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('a rate-limited request writes nothing', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    expect((await add({ note: NOTE })).status).toBe(429)
    expect(h.inserted).toBeNull()
  })

  it('🔑 the Platform Owner is not a subject of notes', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null })
    const res = await add({ note: NOTE }, OWNER_ID)
    expect(res.status).toBe(403)
    expect(h.inserted).toBeNull()
  })
})

// ===========================================================================
// Failure states
// ===========================================================================
describe('failure is never silent', () => {
  it('🔑 an unreadable table is a 500, not an empty list', async () => {
    // Until the migration is applied this table does not exist. "This account
    // has no notes" would be a confident answer to a question nobody could
    // answer.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.selectResult = { data: null, error: { message: 'relation "user_notes" does not exist' } }
    const res = await list()
    expect(res.status).toBe(500)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('a genuinely empty list is a 200 with no notes', async () => {
    h.selectResult = { data: [], error: null }
    const res = await list()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [] })
  })

  it('a failed insert is a 500 and is not audited as a success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertResult = { data: null, error: { message: 'denied' } }
    const res = await add({ note: NOTE })
    expect(res.status).toBe(500)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })

  it('🔑 the failure is DELIBERATE, not a crash that happens to be a 500', async () => {
    // Mutation N09 deleted the `if (!created)` guard and survived twice. Without
    // it the audit line dereferences null, throws, and the outer catch answers
    // 500 — and `adminErrorResponse` maps an unknown error to the SAME envelope,
    // so status and body are byte-identical. Measured, not assumed.
    //
    // The difference that remains is real: a handled failure is silent, while a
    // crash logs `[admin] unhandled error`. A route that only works because an
    // exception rescues it stops working the moment the audit call moves.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertResult = { data: null, error: { message: 'denied' } }
    const body = await (await add({ note: NOTE })).json()
    expect(body.error?.code).toBe('INTERNAL_ERROR')
    expect(body.error?.message).toBe('Operation failed')
    const logged = spy.mock.calls.map((c) => String(c[0])).join(' | ')
    expect(logged).not.toContain('unhandled error')
  })

  it('a write that returns no row and no error is still a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertResult = { data: null, error: null }
    const res = await add({ note: NOTE })
    expect(res.status).toBe(500)
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
})
