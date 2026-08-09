import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Component 3: the ENFORCEMENT layer.
//
// `engine.test.ts` proves the Policy Decision Point decides correctly.
// It cannot prove the guards ACT on those decisions correctly, and the
// Component 3 review found that gap the hard way: `requirePagePermission`
// shipped with an infinite redirect loop that no engine test could ever catch,
// because the loop lives entirely in the guard's redirect targets.
//
// So this file tests the guard, not the engine: the decision ORDER (identity →
// Owner Gate → authorization), the failure MODES (throw vs redirect), and the
// redirect TARGETS.

const h = vi.hoisted(() => ({
  resolveActorForUser: vi.fn(),
  getUser: vi.fn(),
  checkOwnerGate: vi.fn(),
  getRequestUser: vi.fn(),
}))

/** `redirect()` throws in Next; this mock preserves that and records the target. */
class RedirectError extends Error {
  constructor(public target: string) {
    super(`REDIRECT:${target}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new RedirectError(target)
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: h.getUser } }),
}))
vi.mock('@/lib/admin/owner', () => ({ checkOwnerGate: h.checkOwnerGate }))

// The engine and registry stay REAL — a guard that authorizes against a mocked
// engine proves nothing about production behaviour.
vi.mock('@/lib/admin/rbac', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, resolveActorForUser: h.resolveActorForUser }
})

import { requirePagePermission } from './guards'
import { PERMISSIONS } from './registry'

const USER = { id: 'u-1', email: 'admin@tappyai.com' }

const actor = (roles: string[], isOwner = false) => ({
  userId: USER.id,
  email: USER.email,
  isOwner,
  roles,
  highestRole: roles[roles.length - 1] ?? null,
  capabilities: [],
  source: 'cookie',
  resolvedAt: 0,
})

/** Run the guard and report how it terminated. */
async function run(permission: string, options?: { deniedRedirect?: string }) {
  try {
    const ok = await requirePagePermission(permission as never, options)
    return { outcome: 'rendered' as const, ok }
  } catch (err) {
    if (err instanceof RedirectError) return { outcome: 'redirect' as const, target: err.target }
    throw err
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getUser.mockResolvedValue({ data: { user: USER } })
  h.checkOwnerGate.mockResolvedValue({ ok: true })
  h.resolveActorForUser.mockResolvedValue(actor(['admin']))
})

describe('requirePagePermission — redirect loop regression', () => {
  // THE BUG: every /admin page carries a guard, including /admin itself. A
  // denial that redirects into the Controller re-runs the same failing check.
  // Component 3 introduced this the moment it gave /admin a guard.

  it('REGRESSION: an Owner Gate failure NEVER redirects into /admin', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })

    const res = await run(PERMISSIONS.DASHBOARD_HOME_VIEW)

    expect(res.outcome).toBe('redirect')
    // Any /admin target loops: the destination re-runs this same failing gate.
    expect(res.target).not.toMatch(/^\/admin/)
  })

  it('REGRESSION: the gate failure target is stable regardless of deniedRedirect', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })

    // A caller must not be able to reintroduce the loop by passing an /admin
    // fallback — the Controller is down, so the exit is not negotiable.
    const res = await run(PERMISSIONS.AUDIT_LOG_READ, { deniedRedirect: '/admin' })

    expect(res.outcome).toBe('redirect')
    expect(res.target).not.toMatch(/^\/admin/)
  })

  it('REGRESSION: /admin passes a deniedRedirect that leaves the Controller', async () => {
    // Mirrors src/app/admin/page.tsx. Without the override this is the loop:
    // denial on /admin redirects to /admin.
    h.resolveActorForUser.mockResolvedValue(actor([]))

    const res = await run(PERMISSIONS.DASHBOARD_HOME_VIEW, { deniedRedirect: '/reviews' })

    expect(res).toEqual({ outcome: 'redirect', target: '/reviews' })
  })

  it('a denial on a NON-root page still returns to the dashboard', async () => {
    h.resolveActorForUser.mockResolvedValue(actor(['analyst']))

    // analyst holds no audit permission; /admin is reachable and terminal.
    const res = await run(PERMISSIONS.AUDIT_LOG_READ)

    expect(res).toEqual({ outcome: 'redirect', target: '/admin' })
  })
})

describe('requirePagePermission — decision order', () => {
  it('unauthenticated redirects to login before anything else runs', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const res = await run(PERMISSIONS.DASHBOARD_HOME_VIEW)

    expect(res).toEqual({ outcome: 'redirect', target: '/login?redirect=/admin' })
    expect(h.checkOwnerGate).not.toHaveBeenCalled()
    expect(h.resolveActorForUser).not.toHaveBeenCalled()
  })

  it('the Owner Gate runs BEFORE authorization, not after', async () => {
    h.checkOwnerGate.mockResolvedValue({ ok: false, reason: 'ENV_SET_BUT_NO_OWNER' })

    await run(PERMISSIONS.DASHBOARD_HOME_VIEW)

    // A Controller whose ownership assertion fails must deny without ever
    // consulting RBAC — otherwise a permission could mask a broken gate.
    expect(h.resolveActorForUser).not.toHaveBeenCalled()
  })

  it('resolves the FULL role list, never the highest role alone', async () => {
    await run(PERMISSIONS.DASHBOARD_HOME_VIEW)

    // Permissions union across roles, so collapsing to the highest role would
    // silently drop access. This asserts the guard calls the all-roles resolver.
    // FOUNDATION-10C: the guard hands over the WHOLE verified user object, not
    // a (id, email) pair it re-derived. That is what makes the corporate
    // identity boundary unforgeable — see resolveActorForUser.
    expect(h.resolveActorForUser).toHaveBeenCalledWith(USER, 'cookie')
  })
})

describe('requirePagePermission — authorization outcomes', () => {
  it('renders for an actor holding the permission', async () => {
    const res = await run(PERMISSIONS.AUDIT_LOG_READ)

    expect(res.outcome).toBe('rendered')
    expect(res.ok).toMatchObject({ userId: USER.id, email: USER.email })
  })

  it('the Platform Owner renders even with NO roles', async () => {
    h.resolveActorForUser.mockResolvedValue(actor([], true))

    const res = await run(PERMISSIONS.SECURITY_ROLES_READ)

    expect(res.outcome).toBe('rendered')
  })

  it('an admin is denied a super_admin-only page', async () => {
    const res = await run(PERMISSIONS.SECURITY_ROLES_READ)

    expect(res).toEqual({ outcome: 'redirect', target: '/admin' })
  })

  it('multiple roles union: analyst+admin reaches an admin-only page', async () => {
    h.resolveActorForUser.mockResolvedValue(actor(['analyst', 'admin']))

    const res = await run(PERMISSIONS.COMMERCE_DEALS_READ)

    expect(res.outcome).toBe('rendered')
  })

  it('an undeclared permission fails CLOSED, it does not render', async () => {
    const res = await run('not.a.real.permission')

    expect(res).toEqual({ outcome: 'redirect', target: '/admin' })
  })
})
