import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// FOUNDATION-08 — DEPLOYMENT SAFETY.
//
// F-08's Home needs the F-06/F-07 organization library, so shipping the Home
// necessarily ships that library. The entire argument for why that is safe is:
// "it is inert while CONTROLLER_ORG_MEMBERSHIP_ENABLED is OFF."
//
// Mutation testing found that argument was NOT covered by any test (M-F5), and
// that the navigation guard was satisfied by the *string* `filterNavByDepartment`
// appearing inside dead code (M-F6) — an inert guard of exactly the kind this
// project has shipped before. These tests close both, plus the documented
// redirect-loop hazard on /admin (M-F7).
//
// Production code is untouched: these assert existing behaviour, they do not
// relax it.

const ROOT = process.cwd()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('DB must not be touched while the flag is OFF') } }))

const ORIGINAL = process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED

describe('M-F5 — the org layer is INERT while the feature flag is OFF', () => {
  beforeEach(() => { delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED })
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
    else process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = ORIGINAL
  })

  it('orgMembershipEnabled() is false unless the value is exactly "true"', async () => {
    const { orgMembershipEnabled } = await import('../server')
    for (const v of [undefined, '', 'false', 'FALSE', 'TRUE', 'True', '1', 'yes', 'on']) {
      if (v === undefined) delete process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED
      else process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = v
      expect(orgMembershipEnabled(), `value=${String(v)}`).toBe(false)
    }
    process.env.CONTROLLER_ORG_MEMBERSHIP_ENABLED = 'true'
    expect(orgMembershipEnabled()).toBe(true)
  })

  it('resolveActorMemberships returns [] and NEVER touches the database', async () => {
    // The admin client is mocked to throw. If the flag gate were removed the
    // call would reach it and this test would fail loudly — which is precisely
    // what mutation M-F5 did not previously trigger.
    const { resolveActorMemberships } = await import('../server')
    const actor = { userId: 'u-1', isOwner: false } as never
    await expect(resolveActorMemberships(actor)).resolves.toEqual([])
  })

  it('resolveDepartmentContext yields no memberships, and Owner reach still comes from Actor.isOwner', async () => {
    const { resolveDepartmentContext } = await import('../server')
    const owner = { userId: 'u-owner', isOwner: true } as never
    const staff = { userId: 'u-staff', isOwner: false } as never

    const ownerCtx = await resolveDepartmentContext(owner)
    expect(ownerCtx.memberships).toEqual([])
    expect(ownerCtx.isOwner).toBe(true) // GLOBAL reach does not depend on the flag

    const staffCtx = await resolveDepartmentContext(staff)
    expect(staffCtx.memberships).toEqual([])
    expect(staffCtx.isOwner).toBe(false)
    expect(staffCtx.scope.departmentIds).toEqual([]) // → NoWorkspace, not fabricated data
  })
})

describe('M-F6 — the department nav filter is REACHABLE, not merely mentioned', () => {
  const layout = readFileSync(join(ROOT, 'src/app/admin/layout.tsx'), 'utf8')

  it('the filter call is guarded by orgMembershipEnabled(), not stranded in dead code', () => {
    // `toContain('filterNavByDepartment')` alone passes even when the call sits
    // inside `if (false) { … }`. Assert the whole guarded shape instead.
    expect(layout).toMatch(/if\s*\(\s*orgMembershipEnabled\(\)\s*\)\s*\{[\s\S]{0,400}?filterNavByDepartment\s*\(/)
  })

  it('no always-false guard disables the filter', () => {
    expect(layout).not.toMatch(/if\s*\(\s*(false|0|null|undefined)\s*\)/)
  })

  it('the PDP navigation authority still runs before any department filter', () => {
    // Compare the CALL sites, not first occurrence: `filterNavByDepartment`
    // also appears in the import statement near the top of the file, which
    // would make a naive index comparison fail (and, reversed, would make it
    // pass vacuously).
    const pdpAt = layout.indexOf('resolveAdminNavigation(actor)')
    const filterAt = layout.indexOf('navGroups = filterNavByDepartment(')
    expect(pdpAt).toBeGreaterThan(-1)
    expect(filterAt).toBeGreaterThan(-1)
    expect(filterAt).toBeGreaterThan(pdpAt) // filter refines the PDP result, never replaces it
  })
})

describe('M-F7 — a denial on /admin leaves the Controller (documented redirect-loop hazard)', () => {
  // The hazard is unchanged; what closes it moved. This test used to require the
  // Home page to pass `deniedRedirect: '/reviews'`, because the DEFAULT was
  // '/admin' — which on /admin itself is the infinite loop. B5 changed the
  // default to the denial page, which is outside the Controller, so the override
  // is no longer load-bearing and the page dropped it.
  //
  // Asserting the DESTINATION rather than the override keeps the invariant and
  // stops pinning one particular way of achieving it.
  it('the guard default is outside the Controller, so /admin needs no override', async () => {
    const { denialPath } = await import('@/lib/admin/denial')

    expect(denialPath('missing_permission', 'dashboard.home.view' as never)).not.toMatch(/^\/admin/)
  })

  it('the Home page therefore passes no /admin denial target of its own', () => {
    const page = readFileSync(join(ROOT, 'src/app/admin/page.tsx'), 'utf8')

    // If someone reintroduces an override, it must still not point into /admin.
    const override = page.match(/deniedRedirect:\s*'([^']+)'/)
    if (override) expect(override[1]).not.toMatch(/^\/admin/)
  })
})
