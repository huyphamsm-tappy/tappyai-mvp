import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminError } from '@/lib/admin/rbac'

// Module 08 — the ROUTE half of the admin user surface.
//
// `accountStatusAdmin.test.ts` covers what gets written. This file covers what
// happens BEFORE and AFTER the write: who is refused, what the audit trail
// records, and which facts the response is allowed to state.
//
// The guards asserted here are the ones with no second line of defence. There
// is no SQL function behind these routes — `account_status` has no INSERT or
// UPDATE policy at all and is reached purely by `service_role` BYPASSRLS — so
// the handler IS the authority on who may be suspended or banned. A gap here is
// not caught anywhere downstream.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  isSameOrigin: vi.fn(() => true),
  rateLimit: vi.fn(),
  writeAuditLog: vi.fn(),
  auditDecision: vi.fn(),
  rpc: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
  // The soft permission checks the handlers make through the PDP. Driven by a
  // SET of granted ids rather than one boolean, because Owner Decision A
  // (2026-08-20) created two independent admin+ gates on the same surface —
  // `users.email.read_full` and `users.ban_reason.read` — and a single boolean
  // could not tell a test which one it was exercising.
  granted: new Set<string>(),
  queues: {} as Record<string, unknown[]>,
  recorded: [] as { table: string; calls: [string, ...unknown[]][] }[],
}))

// Defined inside the hoisted block: a `vi.mock` factory is lifted above every
// top-level statement, so a factory closing over an ordinary `const` reads it
// before initialization.
const engine = vi.hoisted(() => ({
  can: (_actor: unknown, permission: string) => h.granted.has(permission),
  authorize: (_actor: unknown, permission: string) =>
    h.granted.has(permission)
      ? { allowed: true, reason: 'ROLE_GRANT', permission }
      : { allowed: false, reason: 'NO_GRANT', permission },
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
import { GET as LIST } from './route'
import { GET as DETAIL } from './[id]/route'
import { POST as SUSPEND } from './[id]/suspend/route'
import { POST as UNSUSPEND } from './[id]/unsuspend/route'
import { POST as BAN } from './[id]/ban/route'
import { POST as UNBAN } from './[id]/unban/route'

const ADMIN_ID = '22222222-2222-2222-2222-222222222222'
const SUBJECT = '33333333-3333-3333-3333-333333333333'
const OWNER_ID = '11111111-1111-1111-1111-111111111111'
const REASON = 'coordinated review fraud across twelve accounts'
const NOT_A_UUID = 'nope'

/** The same chainable builder the domain tests use; see accountStatusAdmin.test.ts. */
function fakeClient() {
  return {
    from(table: string) {
      const entry = { table, calls: [] as [string, ...unknown[]][] }
      h.recorded.push(entry)
      const next = () => {
        const queue = h.queues[table] ?? []
        return queue.length > 1 ? queue.shift() : queue[0]
      }
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve)
            }
            return (...args: unknown[]) => {
              entry.calls.push([prop, ...args])
              if (prop === 'single' || prop === 'maybeSingle') return Promise.resolve(next())
              return proxy
            }
          },
        }
      )
      return proxy
    },
    rpc: h.rpc,
    auth: { admin: { getUserById: h.getUserById, listUsers: h.listUsers } },
  }
}

const ok = (data: unknown) => ({ data, error: null })
const profile = (over = {}) => ({
  id: SUBJECT,
  full_name: 'Nguyễn Văn A',
  avatar_url: null,
  created_at: '2026-08-01T00:00:00+00:00',
  language: 'vi',
  onboarded: true,
  follower_count: 3,
  following_count: 5,
  ...over,
})
const statusRow = (over = {}) => ({
  user_id: SUBJECT,
  is_suspended: false,
  suspended_until: null,
  is_banned: false,
  ban_reason: null,
  created_at: '2026-08-01T00:00:00+00:00',
  updated_at: '2026-08-02T00:00:00+00:00',
  ...over,
})

const ctx = (over = {}) => ({
  user: { id: ADMIN_ID, email: 'admin@tappyai.com' },
  actor: { userId: ADMIN_ID, isOwner: false, roles: ['admin'], capabilities: [] },
  decision: { allowed: true, reason: 'ROLE_GRANT' },
  ...over,
})

const list = (qs = '') => LIST(new Request(`https://www.tappyai.com/api/admin/users${qs}`))
const detail = (id = SUBJECT) =>
  DETAIL(new Request(`https://www.tappyai.com/api/admin/users/${id}`), { params: { id } })
const post =
  (handler: (req: Request, c: { params: { id: string } }) => Promise<Response>, path: string) =>
  (body: unknown, id = SUBJECT) =>
    handler(
      new Request(`https://www.tappyai.com/api/admin/users/${id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: { id } }
    )

const suspend = post(SUSPEND, 'suspend')
const unsuspend = post(UNSUSPEND, 'unsuspend')
const ban = post(BAN, 'ban')
const unban = post(UNBAN, 'unban')

/** Tables the handler actually touched, in order. */
const touched = () => h.recorded.map((r) => r.table)
/** Methods called against the Nth builder for a table. */
const callsFor = (table: string, nth = 0) =>
  h.recorded.filter((r) => r.table === table)[nth]?.calls.map(([name]) => name) ?? []
const argsFor = (table: string, method: string, nth = 0) =>
  h.recorded.filter((r) => r.table === table)[nth]?.calls.find(([name]) => name === method)?.slice(1)

beforeEach(() => {
  vi.clearAllMocks()
  h.recorded = []
  h.queues = {}
  h.requirePermission.mockResolvedValue(ctx())
  h.isSameOrigin.mockReturnValue(true)
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  // Default actor: a `moderator` under Owner Decision A — holds the read
  // surface, holds NEITHER admin+ gate. The stricter default is deliberate:
  // a test that needs a gate open has to say so.
  h.granted = new Set([PERMISSIONS.USERS_LIST_READ, PERMISSIONS.USERS_DETAIL_READ])
  h.rpc.mockResolvedValue(ok(false))
  h.getUserById.mockResolvedValue({ data: { user: { email: 'huypham.sm@gmail.com' } }, error: null })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('rejects a filter it does not implement rather than returning an unfiltered list', async () => {
    const res = await list('?platform=android')
    expect(res.status).toBe(422)
    expect(touched()).toEqual([])
  })

  it('reports a user with no status row as active', async () => {
    h.queues = { profiles: [ok([profile()])], account_status: [ok([])] }

    const body = await (await list()).json()
    expect(body.data[0].standing).toBe('active')
    expect(body.data[0].suspended_until).toBeNull()
  })

  it('reports a live suspension, with its expiry', async () => {
    h.queues = {
      profiles: [ok([profile()])],
      account_status: [ok([statusRow({ is_suspended: true, suspended_until: '2099-01-01T00:00:00+00:00' })])],
    }

    const body = await (await list()).json()
    expect(body.data[0].standing).toBe('suspended')
    expect(body.data[0].suspended_until).toBe('2099-01-01T00:00:00+00:00')
  })

  it('withholds the expiry once the standing is no longer "suspended"', async () => {
    // Banned while suspended: rendering a countdown here would tell a moderator
    // the account frees itself on that date. It does not.
    h.queues = {
      profiles: [ok([profile()])],
      account_status: [
        ok([statusRow({ is_suspended: true, suspended_until: '2099-01-01T00:00:00+00:00', is_banned: true })]),
      ],
    }

    const body = await (await list()).json()
    expect(body.data[0].standing).toBe('banned')
    expect(body.data[0].suspended_until).toBeNull()
  })

  it('asks for one row more than the page, and reports hasMore without a count query', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => profile({ id: `id-${i}` }))
    h.queues = { profiles: [ok(rows)], account_status: [ok([])] }

    const body = await (await list('?limit=2')).json()
    expect(argsFor('profiles', 'limit')).toEqual([3])
    expect(body.data).toHaveLength(2)
    expect(body.meta.page.hasMore).toBe(true)
    expect(body.meta.page.cursor).not.toBeNull()
  })

  it('returns no cursor on the last page', async () => {
    h.queues = { profiles: [ok([profile()])], account_status: [ok([])] }

    const body = await (await list('?limit=2')).json()
    expect(body.meta.page.hasMore).toBe(false)
    expect(body.meta.page.cursor).toBeNull()
  })

  it('refuses a malformed cursor instead of silently serving page one', async () => {
    h.queues = { profiles: [ok([profile()])], account_status: [ok([])] }
    const res = await list('?cursor=!!!!')
    expect(res.status).toBe(422)
    expect(touched()).toEqual([])
  })

  it('escapes ilike wildcards so a search for "%" does not match everyone', async () => {
    h.queues = { profiles: [ok([])], account_status: [ok([])] }
    await list('?q=%25a')
    expect(argsFor('profiles', 'ilike')).toEqual(['full_name', '%\\%a%'])
  })

  it('REFUSES the status filter when the moderated set outgrew the in-memory cap', async () => {
    const overflowing = Array.from({ length: 1001 }, (_, i) => ({
      user_id: `id-${i}`,
      is_suspended: false,
      suspended_until: null,
      is_banned: true,
    }))
    h.queues = { account_status: [ok(overflowing)], profiles: [ok([])] }

    const res = await list('?status=active')
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('FILTER_UNAVAILABLE')
    // The point of failing: a truncated exclusion set would have listed banned
    // accounts as active. The profiles query must not run at all.
    expect(touched()).not.toContain('profiles')
  })

  it('short-circuits a status filter that matches nobody', async () => {
    h.queues = { account_status: [ok([])], profiles: [ok([profile()])] }

    const body = await (await list('?status=banned')).json()
    expect(body.data).toEqual([])
    expect(touched()).not.toContain('profiles')
  })

  it('applies status=active as an EXCLUSION, since an absent row is active', async () => {
    h.queues = {
      account_status: [ok([{ user_id: SUBJECT, is_suspended: false, suspended_until: null, is_banned: true }]), ok([])],
      profiles: [ok([profile({ id: 'someone-else' })])],
    }

    await list('?status=active')
    expect(argsFor('profiles', 'not')).toEqual(['id', 'in', `(${SUBJECT})`])
  })

  // ── Owner Decision A (2026-08-20), sub-decision (b): email search is admin+ ─
  //
  // Searching by address is not "viewing" one, but it answers "does this
  // address have an account here?" — an existence oracle over exactly the data
  // `10 §6` withholds from `moderator`. It is gated on the same permission that
  // governs reading an address, so the two cannot drift apart.

  it('REFUSES an email search from an actor without users.email.read_full', async () => {
    h.listUsers.mockResolvedValue({ data: { users: [{ id: SUBJECT, email: 'huypham.sm@gmail.com' }] }, error: null })

    const res = await list('?q=huypham.sm%40gmail.com')
    expect(res.status).toBe(403)
    // The directory is never consulted — a 403 computed after the lookup would
    // still have performed it, and timing would still answer the question.
    expect(h.listUsers).not.toHaveBeenCalled()
    expect(touched()).toEqual([])
  })

  it('audits that refusal through the PDP, not as a silent 403', async () => {
    await list('?q=huypham.sm%40gmail.com')

    expect(h.auditDecision).toHaveBeenCalledTimes(1)
    expect(h.auditDecision.mock.calls[0][0]).toMatchObject({
      surface: 'api',
      decision: expect.objectContaining({
        allowed: false,
        permission: PERMISSIONS.USERS_EMAIL_READ_FULL,
      }),
    })
  })

  it('still allows a NAME search for the same actor — the gate is on addresses only', async () => {
    h.queues = { profiles: [ok([profile()])], account_status: [ok([])] }

    const res = await list('?q=Nguy%E1%BB%85n')
    expect(res.status).toBe(200)
    expect(h.auditDecision).not.toHaveBeenCalled()
  })

  it('an @ in the query becomes an EXACT email lookup, not a substring scan', async () => {
    h.granted.add(PERMISSIONS.USERS_EMAIL_READ_FULL)
    h.listUsers.mockResolvedValue({ data: { users: [{ id: SUBJECT, email: 'huypham.sm@gmail.com' }] }, error: null })
    h.queues = { profiles: [ok(profile())], account_status: [ok([statusRow()])] }

    const body = await (await list('?q=huypham.sm%40gmail.com')).json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe(SUBJECT)
    // Matched on the whole address; `ilike` would have made it enumerable.
    expect(callsFor('profiles')).not.toContain('ilike')
  })

  it('a truncated directory walk is a 503, never an empty list dressed up as an answer', async () => {
    h.granted.add(PERMISSIONS.USERS_EMAIL_READ_FULL)
    // Full pages every time: the walk hits its page bound with more to read.
    h.listUsers.mockResolvedValue({
      data: { users: Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.com` })) },
      error: null,
    })

    const res = await list('?q=nobody%40example.com')
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('SEARCH_INCOMPLETE')
  })

  it('a complete walk that finds nothing IS an answer', async () => {
    h.granted.add(PERMISSIONS.USERS_EMAIL_READ_FULL)
    h.listUsers.mockResolvedValue({ data: { users: [{ id: 'u1', email: 'someone@else.com' }] }, error: null })

    const res = await list('?q=nobody%40example.com')
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([])
  })

  it('carries Retry-After when rate limited', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await list()
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/users/[id]', () => {
  it('rejects a non-UUID before it reaches Postgres as a cast error', async () => {
    const res = await detail(NOT_A_UUID)
    expect(res.status).toBe(422)
    expect(touched()).toEqual([])
  })

  it('404s an unknown user', async () => {
    h.queues = { profiles: [ok(null)] }
    expect((await detail()).status).toBe(404)
  })

  it('MASKS the address when the PDP withholds users.email.read_full', async () => {
    h.queues = { profiles: [ok(profile())], account_status: [ok(statusRow())] }

    const body = await (await detail()).json()
    expect(body.data.email).toBe('h***@gmail.com')
    expect(body.data.email_masked).toBe(true)
  })

  it('reveals the address when the PDP grants it', async () => {
    h.granted.add(PERMISSIONS.USERS_EMAIL_READ_FULL)
    h.queues = { profiles: [ok(profile())], account_status: [ok(statusRow())] }

    const body = await (await detail()).json()
    expect(body.data.email).toBe('huypham.sm@gmail.com')
    expect(body.data.email_masked).toBe(false)
  })

  it('does not claim a hidden address exists when there is none on file', async () => {
    h.getUserById.mockResolvedValue({ data: { user: { email: null } }, error: null })
    h.queues = { profiles: [ok(profile())], account_status: [ok(statusRow())] }

    const body = await (await detail()).json()
    expect(body.data.email).toBeNull()
    expect(body.data.email_masked).toBe(false)
  })

  it('shows the RAW flags next to the derived standing, so a stale row is visible', async () => {
    // Suspension expired, cron has not tidied it: the app treats this user as
    // free, and the admin deciding what to do needs to see both facts.
    h.queues = {
      profiles: [ok(profile())],
      account_status: [ok(statusRow({ is_suspended: true, suspended_until: '2020-01-01T00:00:00+00:00' }))],
    }

    const body = await (await detail()).json()
    expect(body.data.standing).toBe('active')
    expect(body.data.is_suspended).toBe(true)
    expect(body.data.suspended_until).toBeNull()
  })

  // ── Owner Decision A (2026-08-20), sub-decision (a): ban_reason is admin+ ──
  //
  // A `moderator` reaches this route — that is the whole point of Decision A —
  // but the internal moderation note is not theirs to read. They cannot ban or
  // unban, so there is no action the note informs, and Constitution Rule 9
  // (minimum data access per role) settles the rest.

  it('WITHHOLDS ban_reason from an actor without users.ban_reason.read', async () => {
    h.queues = {
      profiles: [ok(profile())],
      account_status: [ok(statusRow({ is_banned: true, ban_reason: 'fraud ring' }))],
    }

    const body = await (await detail()).json()
    expect(body.data.ban_reason).toBeNull()
    // Distinguishable from "there is no note", exactly as `email_masked` is.
    expect(body.data.ban_reason_withheld).toBe(true)
  })

  it('surfaces ban_reason to an actor who holds users.ban_reason.read', async () => {
    h.granted.add(PERMISSIONS.USERS_BAN_REASON_READ)
    h.queues = {
      profiles: [ok(profile())],
      account_status: [ok(statusRow({ is_banned: true, ban_reason: 'fraud ring' }))],
    }

    const body = await (await detail()).json()
    expect(body.data.ban_reason).toBe('fraud ring')
    expect(body.data.ban_reason_withheld).toBe(false)
  })

  it('does not claim a withheld note exists when the account has none', async () => {
    // A banned account whose reason was never recorded, read by a moderator:
    // reporting `withheld: true` would invent a note that is not there.
    h.queues = {
      profiles: [ok(profile())],
      account_status: [ok(statusRow({ is_banned: true, ban_reason: null }))],
    }

    const body = await (await detail()).json()
    expect(body.data.ban_reason).toBeNull()
    expect(body.data.ban_reason_withheld).toBe(false)
  })

  it('withholding the note does not withhold the standing it explains', async () => {
    h.queues = {
      profiles: [ok(profile())],
      account_status: [ok(statusRow({ is_banned: true, ban_reason: 'fraud ring' }))],
    }

    const body = await (await detail()).json()
    expect(body.data.standing).toBe('banned')
    expect(body.data.is_banned).toBe(true)
  })

  it('reports a never-moderated user as active with no status timestamp', async () => {
    h.queues = { profiles: [ok(profile())], account_status: [ok(null)] }

    const body = await (await detail()).json()
    expect(body.data.standing).toBe('active')
    expect(body.data.status_updated_at).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the guards every mutation shares', () => {
  const mutations = [
    ['suspend', suspend, { reason: REASON }],
    ['unsuspend', unsuspend, { reason: REASON }],
    ['ban', ban, { reason: REASON }],
    ['unban', unban, { reason: REASON }],
  ] as const

  it.each(mutations)('%s refuses a cross-origin request before touching anything', async (_n, run, body) => {
    h.isSameOrigin.mockReturnValue(false)
    const res = await run(body)
    expect(res.status).toBe(403)
    expect(touched()).toEqual([])
  })

  it.each(mutations)('%s refuses the Platform Owner as a target, and never writes', async (_n, run, body) => {
    h.rpc.mockResolvedValue(ok(true))
    h.queues = { profiles: [ok({ id: OWNER_ID })], account_status: [ok(null), ok(statusRow())] }

    const res = await run(body, OWNER_ID)
    expect(res.status).toBe(403)
    expect(touched()).not.toContain('account_status')
  })

  it.each(mutations)('%s audits the Owner refusal — a denied attempt is the fact worth keeping', async (_n, run, body) => {
    h.rpc.mockResolvedValue(ok(true))
    await run(body, OWNER_ID)

    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'user.action_denied',
      targetId: OWNER_ID,
      metadata: expect.objectContaining({ reason: 'owner_protected' }),
    })
  })

  it.each(mutations)('%s FAILS CLOSED when the Owner check itself fails', async (_n, run, body) => {
    // `isPlatformOwner()` degrades to false on a read error. Here that would be
    // permission to ban the Owner, so this path must 500 instead.
    h.rpc.mockResolvedValue({ data: null, error: { message: 'platform_owner unreachable' } })
    h.queues = { profiles: [ok({ id: SUBJECT })], account_status: [ok(null), ok(statusRow())] }

    const res = await run(body)
    expect(res.status).toBe(500)
    expect(touched()).not.toContain('account_status')
  })

  it.each(mutations)('%s refuses a self-target, before even asking who the Owner is', async (_n, run, body) => {
    const res = await run(body, ADMIN_ID)
    expect(res.status).toBe(403)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it.each(mutations)('%s rejects a non-UUID target', async (_n, run, body) => {
    expect((await run(body, NOT_A_UUID)).status).toBe(422)
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it.each(mutations)('%s 404s an unknown target rather than surfacing an FK violation', async (_n, run, body) => {
    h.queues = { profiles: [ok(null)], account_status: [ok(null), ok(statusRow())] }

    const res = await run(body)
    expect(res.status).toBe(404)
    expect(touched()).not.toContain('account_status')
  })

  it.each(mutations)('%s requires a stated reason', async (_n, run) => {
    h.queues = { profiles: [ok({ id: SUBJECT })], account_status: [ok(null), ok(statusRow())] }

    const res = await run({ reason: 'spam' })
    expect(res.status).toBe(422)
    expect(touched()).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/admin/users/[id]/suspend', () => {
  beforeEach(() => {
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [ok(null), ok(statusRow({ is_suspended: true, suspended_until: '2026-08-21T12:00:00+00:00' }))],
    }
  })

  it('writes the row and reports the resulting standing', async () => {
    const body = await (await suspend({ reason: REASON, duration_hours: 24 })).json()
    expect(body.data.standing).toBe('suspended')
    expect(callsFor('account_status', 1)).toContain('upsert')
  })

  it('records duration and reason on the audit entry', async () => {
    await suspend({ reason: REASON, duration_hours: 24 })

    expect(h.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'user.suspend',
      targetType: 'user',
      targetId: SUBJECT,
      metadata: expect.objectContaining({ duration_hours: 24, indefinite: false, reason: REASON }),
    })
  })

  it('an omitted duration is recorded as INDEFINITE, not as zero hours', async () => {
    await suspend({ reason: REASON })

    expect(h.writeAuditLog.mock.calls[0][0].metadata).toMatchObject({
      duration_hours: null,
      indefinite: true,
    })
    expect(argsFor('account_status', 'upsert', 1)?.[0]).toMatchObject({ suspended_until: null })
  })

  it('a first sanction leaves beforeState absent, distinguishing it from a re-suspension', async () => {
    await suspend({ reason: REASON, duration_hours: 24 })
    expect(h.writeAuditLog.mock.calls[0][0].beforeState).toBeUndefined()
  })
})

describe('POST /api/admin/users/[id]/ban', () => {
  beforeEach(() => {
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [ok(null), ok(statusRow({ is_banned: true, ban_reason: REASON }))],
    }
  })

  it('is rate limited harder than a suspension', async () => {
    await ban({ reason: REASON })
    expect(h.rateLimit).toHaveBeenCalledWith(`admin:users:ban:${ADMIN_ID}`, 10, 60_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BAN → SESSION REVOCATION.
//
// `10_User_Management.md` §4 has always defined a ban as three things: set the
// flag, revoke every active Supabase session, stop the user logging in. Only
// the first was built, and the route said so in `session_revocation_pending`.
// C11 shipped the revocation mechanism in production on 2026-08-15; this joins
// the two halves.
//
// OWNER DECISION A (2026-08-21): `users.account.ban` authorizes the COMPLETE
// ban operation, revocation included. Not a second authorization path — ONE
// decision for one operation. Direct, arbitrary session revocation stays gated
// on `security.sessions.revoke`, and holding the ban permission grants no
// general power to end sessions outside a ban.
//
// The two subsystems cannot be made atomic: `account_status` is a table in this
// database and `auth.sessions` belongs to GoTrue. So the rule is not atomicity,
// which is unachievable — it is that a partial ban is never SILENT.
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/admin/users/[id]/ban — session revocation', () => {
  /** Dispatch by function name: one mock serves the Owner check and the revoke. */
  function rpcs(revoke: unknown, owner: unknown = ok(false)) {
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_is_platform_owner') return owner
      if (fn === 'fn_session_revoke_all') return revoke
      return ok(null)
    })
  }

  beforeEach(() => {
    h.granted = new Set([PERMISSIONS.USERS_BAN])
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [ok(null), ok(statusRow({ is_banned: true, ban_reason: REASON }))],
    }
    rpcs(ok([{ revoked: 2, reason: 'ok' }]))
  })

  const revokeCalls = () =>
    h.rpc.mock.calls.filter(([fn]) => fn === 'fn_session_revoke_all')

  it('🔑 a ban revokes ALL of the target’s sessions', async () => {
    await ban({ reason: REASON })
    expect(revokeCalls()).toHaveLength(1)
    expect(revokeCalls()[0][1]).toEqual({ p_user_id: SUBJECT })
  })

  it('🔑 reuses fn_session_revoke_all — no second revocation mechanism', async () => {
    // C11's SQL function is where the atomicity and the anonymous exclusion
    // live. A route that revoked sessions its own way would have neither.
    await ban({ reason: REASON })
    const names = h.rpc.mock.calls.map(([fn]) => fn)
    expect(names).toContain('fn_session_revoke_all')
    expect(names.filter((n: string) => String(n).includes('revoke'))).toEqual(['fn_session_revoke_all'])
  })

  it('the response no longer claims the revocation is pending', async () => {
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.standing).toBe('banned')
    expect(body.data.session_revocation_pending).toBe(false)
    expect(body.data.sessions_revoked).toBe(2)
  })

  it('the audit entry records that sessions WERE revoked, and how many', async () => {
    await ban({ reason: REASON, notes: 'ticket #4821' })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'user.ban',
      metadata: expect.objectContaining({ sessions_revoked: true, revoked_count: 2, notes: 'ticket #4821' }),
    })
  })

  it('🔑 the ban permission ALONE is sufficient — Owner Decision A', async () => {
    // The actor holds `users.account.ban` and NOT `security.sessions.revoke`.
    // Requiring both would make the documented ban unperformable by the role
    // the contract gives it to.
    h.granted = new Set([PERMISSIONS.USERS_BAN])
    const res = await ban({ reason: REASON })
    expect(res.status).toBe(200)
    expect(revokeCalls()).toHaveLength(1)
  })

  it('🔑 the PDP is consulted for the ban permission and for nothing else', async () => {
    await ban({ reason: REASON })
    expect(h.requirePermission).toHaveBeenCalledTimes(1)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.USERS_BAN)
  })

  it('🔑 holding only security.sessions.revoke cannot ban', async () => {
    // The gate is `requirePermission`, and it is the only gate. Simulated the
    // way the PDP actually refuses: by throwing.
    h.requirePermission.mockRejectedValueOnce(
      new AdminError('FORBIDDEN', 'Forbidden', 403)
    )
    h.granted = new Set([PERMISSIONS.SECURITY_SESSIONS_REVOKE])
    const res = await ban({ reason: REASON })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(revokeCalls()).toHaveLength(0)
  })

  // ── a partial ban is never silent ─────────────────────────────────────────

  it('🔑 a revocation FAILURE does not produce a ban that claims to be complete', async () => {
    // The flag is written first, so this state is real: banned, still signed
    // in. Exactly today's behaviour — and the response has to keep saying so
    // rather than reporting a clean success.
    rpcs({ data: null, error: { message: 'gotrue unreachable' } })
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.standing).toBe('banned')
    expect(body.data.session_revocation_pending).toBe(true)
    expect(body.data.sessions_revoked).toBe(0)
  })

  it('a revocation failure is recorded on the audit entry too', async () => {
    rpcs({ data: null, error: { message: 'gotrue unreachable' } })
    await ban({ reason: REASON })
    expect(h.writeAuditLog.mock.calls[0][0]).toMatchObject({
      metadata: expect.objectContaining({ sessions_revoked: false }),
    })
  })

  it('🔑 the ban itself still succeeds when revocation fails — it is not rolled back', async () => {
    // Rolling the flag back would leave the worse of the two states: an account
    // that survived a ban attempt because an unrelated subsystem was down.
    rpcs({ data: null, error: { message: 'gotrue unreachable' } })
    const res = await ban({ reason: REASON })
    expect(res.status).toBe(200)
    expect(touched()).toContain('account_status')
  })

  it('🔑 the FLAG is written before the sessions are revoked', async () => {
    // Ordering is the whole atomicity story. Flag-then-revoke fails to
    // "banned but still signed in" — visible and recoverable. Revoke-then-flag
    // fails to "sessions killed for an account that was never banned".
    let statusWrittenFirst: boolean | null = null
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_session_revoke_all') {
        statusWrittenFirst = h.recorded.some((r) => r.table === 'account_status')
        return ok([{ revoked: 1, reason: 'ok' }])
      }
      if (fn === 'fn_is_platform_owner') return ok(false)
      return ok(null)
    })
    await ban({ reason: REASON })
    expect(statusWrittenFirst).toBe(true)
  })

  it('🔑 an RPC that THROWS is a failed revocation, not a successful one', async () => {
    // Every other failure case returns `{error}`. A rejected promise takes the
    // helper's catch, and without this case swallowing it as `ok` survived.
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'fn_session_revoke_all') throw new TypeError('socket hang up')
      if (fn === 'fn_is_platform_owner') return ok(false)
      return ok(null)
    })
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.standing).toBe('banned')
    expect(body.data.session_revocation_pending).toBe(true)
    expect(body.data.sessions_revoked).toBe(0)
  })

  it('🔑 an EMPTY result from the function is not a successful revocation', async () => {
    // `{data: null, error: null}` — the function returned nothing at all. Read
    // as success it would report a clean ban over an unknown session state.
    rpcs(ok(null))
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.session_revocation_pending).toBe(true)
    expect(body.data.sessions_revoked).toBe(0)
  })

  it('an anonymous or session-less subject is not reported as revoked', async () => {
    // C11 §6.1: every read and write filters `is_anonymous = false`, and a
    // forced logout aimed at an anonymous id returns not_found "rather than
    // silently succeeding".
    rpcs(ok([{ revoked: 0, reason: 'not_found' }]))
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.standing).toBe('banned')
    expect(body.data.sessions_revoked).toBe(0)
    expect(body.data.session_revocation_pending).toBe(true)
  })

  it('owner_protected from the SQL function is never reported as success', async () => {
    // Unreachable in practice — `guardMutationTarget` refuses an Owner target
    // before this point — but the two defences are independent on purpose.
    rpcs(ok([{ revoked: 0, reason: 'owner_protected' }]))
    const body = await (await ban({ reason: REASON })).json()
    expect(body.data.sessions_revoked).toBe(0)
    expect(body.data.session_revocation_pending).toBe(true)
  })

  // ── the existing guards must all survive ──────────────────────────────────

  it('the Owner still cannot be banned, and no revocation is attempted', async () => {
    rpcs(ok([{ revoked: 9, reason: 'ok' }]), ok(true))
    const res = await ban({ reason: REASON }, OWNER_ID)
    expect(res.status).toBe(403)
    expect(revokeCalls()).toHaveLength(0)
  })

  it('the ban-reason gate still runs BEFORE anything is revoked', async () => {
    const res = await ban({ reason: 'too short' })
    expect(res.status).toBe(422)
    expect(revokeCalls()).toHaveLength(0)
  })

  it('a cross-origin request revokes nothing', async () => {
    h.isSameOrigin.mockReturnValueOnce(false)
    const res = await ban({ reason: REASON })
    expect(res.status).toBe(403)
    expect(revokeCalls()).toHaveLength(0)
  })

  it('a rate-limited request revokes nothing', async () => {
    h.rateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 30 })
    const res = await ban({ reason: REASON })
    expect(res.status).toBe(429)
    expect(revokeCalls()).toHaveLength(0)
  })

  it('🔑 the route performs no role comparison', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(__dirname, '[id]', 'ban', 'route.ts'), 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.length).toBeLessThan(raw.length) // the stripper really strips
    for (const role of ['super_admin', 'moderator', 'analyst', 'highestRole']) {
      expect(code, `references ${role}`).not.toContain(role)
    }
  })

  it('🔑 the route requires exactly ONE permission — no compound gate', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const code = readFileSync(join(__dirname, '[id]', 'ban', 'route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.match(/requirePermission\(/g) ?? []).toHaveLength(1)
    // Naming the session permission here would be the compound gate Decision A
    // rejects — and would make the documented ban unperformable.
    expect(code).not.toContain('SECURITY_SESSIONS_REVOKE')
  })
})

describe('POST /api/admin/users/[id]/unban', () => {
  it('carries the erased ban_reason into beforeState, or it is lost forever', async () => {
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [ok(statusRow({ is_banned: true, ban_reason: 'fraud ring' })), ok(statusRow())],
    }

    await unban({ reason: REASON })
    expect(h.writeAuditLog.mock.calls[0][0].beforeState).toMatchObject({ ban_reason: 'fraud ring' })
  })

  it('reports the standing the row actually has — a still-suspended user is not active', async () => {
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [
        ok(statusRow({ is_banned: true, is_suspended: true, suspended_until: '2099-01-01T00:00:00+00:00' })),
        ok(statusRow({ is_banned: false, is_suspended: true, suspended_until: '2099-01-01T00:00:00+00:00' })),
      ],
    }

    const body = await (await unban({ reason: REASON })).json()
    expect(body.data.standing).toBe('suspended')
  })
})

describe('POST /api/admin/users/[id]/unsuspend', () => {
  it('is accepted for an already-active account rather than leaking its standing via a 409', async () => {
    h.queues = { profiles: [ok({ id: SUBJECT })], account_status: [ok(null), ok(statusRow())] }

    const res = await unsuspend({ reason: REASON })
    expect(res.status).toBe(200)
    expect((await res.json()).data.standing).toBe('active')
  })

  it('reports banned when lifting a suspension from an account that is also banned', async () => {
    h.queues = {
      profiles: [ok({ id: SUBJECT })],
      account_status: [ok(statusRow({ is_suspended: true, is_banned: true })), ok(statusRow({ is_banned: true }))],
    }

    const body = await (await unsuspend({ reason: REASON })).json()
    expect(body.data.standing).toBe('banned')
  })
})
