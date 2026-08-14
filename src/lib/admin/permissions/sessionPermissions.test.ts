import { describe, it, expect } from 'vitest'
import type { Actor } from '@/lib/admin/rbac'
import type { AdminRole } from '@/lib/admin/roles'
import { permissionRegistry, PERMISSIONS } from './registry'
import { permissionEngine } from './engine'

// Controller V2 — Component 11: the two session-security permissions.
//
// Contract §17, ratified by the Owner on 2026-08-13 (P-7). The split is
// deliberately asymmetric — read reaches `admin`, revoke does not — so this
// file exercises the ENGINE rather than reading the registry table back. A test
// that asserts the table contains what the table contains proves nothing; what
// matters is which decision `authorize()` actually returns.
//
// What is NOT tested here, because it does not live here: the Ultimate Owner
// can never be the TARGET of a revoke (contract §5.1.1). That is enforced in
// the handler and in the SQL function, and is tested against real behaviour.

const actor = (roles: AdminRole[]): Actor => ({
  userId: 'u-session-test',
  email: 'someone@tappyai.com',
  isOwner: false,
  roles,
  highestRole: roles[0] ?? null,
  capabilities: [],
  source: 'cookie',
  resolvedAt: 0,
})

const allows = (roles: AdminRole[], permission: string) =>
  permissionEngine.authorize(actor(roles), permission as never).allowed

describe('C11 permissions — who may READ sessions', () => {
  it('admits super_admin and admin', () => {
    expect(allows(['super_admin'], PERMISSIONS.SECURITY_SESSIONS_READ)).toBe(true)
    expect(allows(['admin'], PERMISSIONS.SECURITY_SESSIONS_READ)).toBe(true)
  })

  it('refuses moderator, analyst and a roleless actor', () => {
    for (const roles of [['moderator'], ['analyst'], []] as AdminRole[][]) {
      expect(allows(roles, PERMISSIONS.SECURITY_SESSIONS_READ), `${roles.join() || 'no role'} reached the inventory`).toBe(false)
    }
  })
})

describe('C11 permissions — who may REVOKE sessions', () => {
  it('admits super_admin only', () => {
    expect(allows(['super_admin'], PERMISSIONS.SECURITY_SESSIONS_REVOKE)).toBe(true)
  })

  it('refuses admin — this is the asymmetry P-7 ratified', () => {
    // Ending another person's sessions is comparable in blast radius to
    // security.roles.grant, which is super_admin-only. If this ever passes for
    // `admin`, the registry has drifted from the contract.
    expect(allows(['admin'], PERMISSIONS.SECURITY_SESSIONS_REVOKE)).toBe(false)
  })

  it('refuses moderator, analyst and a roleless actor', () => {
    for (const roles of [['moderator'], ['analyst'], []] as AdminRole[][]) {
      expect(allows(roles, PERMISSIONS.SECURITY_SESSIONS_REVOKE), `${roles.join() || 'no role'} could revoke sessions`).toBe(false)
    }
  })

  it('is strictly narrower than the read permission', () => {
    // The relationship, not two independent facts: any role that may revoke may
    // also read, and at least one role may read without being able to revoke.
    const roles: AdminRole[][] = [['super_admin'], ['admin'], ['moderator'], ['analyst']]
    const canRevoke = roles.filter((r) => allows(r, PERMISSIONS.SECURITY_SESSIONS_REVOKE))
    const canRead = roles.filter((r) => allows(r, PERMISSIONS.SECURITY_SESSIONS_READ))
    expect(canRevoke.length).toBeGreaterThan(0)
    expect(canRead.length).toBeGreaterThan(canRevoke.length)
    for (const r of canRevoke) expect(allows(r, PERMISSIONS.SECURITY_SESSIONS_READ)).toBe(true)
  })
})

describe('C11 permissions — registry hygiene', () => {
  it('uses a capability distinct from security.rbac', () => {
    // Folding sessions into security.rbac would make a future capability gate
    // unable to separate "may grant roles" from "may end sessions".
    const defs = permissionRegistry.all.filter((d) => d.id.startsWith('security.sessions.'))
    expect(defs).toHaveLength(2)
    for (const d of defs) {
      expect(d.capability).toBe('security.sessions')
      expect(d.module).toBe('security')
    }
  })

  it('marks revoke as the higher risk of the two', () => {
    const read = permissionRegistry.all.find((d) => d.id === PERMISSIONS.SECURITY_SESSIONS_READ)
    const revoke = permissionRegistry.all.find((d) => d.id === PERMISSIONS.SECURITY_SESSIONS_REVOKE)
    expect(read?.riskLevel).toBe('medium')
    expect(revoke?.riskLevel).toBe('critical')
    expect(revoke?.category).toBe('security')
  })

  // DELIBERATELY NOT TESTED HERE: that the inventory withholds tokens, IP and
  // user-agent (P-6, invariant I-5).
  //
  // The first attempt asserted the descriptions do not contain "token"/"IP" —
  // which failed against the description "Never exposes tokens, IP addresses or
  // user agents". A regex over prose cannot tell "exposes X" from "never
  // exposes X", so it would have been noise in one direction and false comfort
  // in the other. P-6 is enforced where it is real: the explicit column
  // projection in the SQL function and the response shape, both covered by the
  // runtime suite.
})
