import { describe, it, expect } from 'vitest'
import {
  buildDepartmentContext,
  homeMode,
  authorizedScopes,
  canViewDepartment,
  departmentSummaries,
} from '../context'
import type { DepartmentMembership, DepartmentId, OrgRole, OrgScope } from '../types'

// FOUNDATION-08 — the Home/department context derivation. THE data-isolation
// boundary for Home rendering: a department user's context contains only their
// own departments, never another. Pure + fail-closed.

const member = (departmentId: DepartmentId, orgRole: OrgRole = 'EMPLOYEE', scope?: OrgScope, status: 'active' | 'suspended' = 'active'): DepartmentMembership =>
  ({ userId: 'u', departmentId, orgRole, scope: scope ?? departmentId, status })

const owner = () => buildDepartmentContext(true, [])
const dept = (...ms: DepartmentMembership[]) => buildDepartmentContext(false, ms)

describe('buildDepartmentContext', () => {
  it('owner is global with all department-owned modules', () => {
    const c = owner()
    expect(c.scope.isGlobal).toBe(true)
    expect(c.allowedModules).toContain('tappy.hub.commerce.deals')
    expect(c.allowedModules.length).toBeGreaterThan(0)
  })
  it('a commerce member gets the commerce module; a marketing member gets none (marketing owns nothing yet)', () => {
    expect(dept(member('commerce')).allowedModules).toEqual(['tappy.hub.commerce.deals'])
    expect(dept(member('marketing')).allowedModules).toEqual([])
  })
  it('suspended memberships confer nothing', () => {
    const c = dept(member('commerce', 'EMPLOYEE', 'commerce', 'suspended'))
    expect(c.scope.departmentIds).toEqual([])
    expect(c.allowedModules).toEqual([])
  })
})

describe('homeMode', () => {
  it('owner → owner, member → department, no membership → none', () => {
    expect(homeMode(owner())).toBe('owner')
    expect(homeMode(dept(member('marketing')))).toBe('department')
    expect(homeMode(dept())).toBe('none')
  })
})

describe('authorizedScopes + canViewDepartment — isolation', () => {
  it('owner sees all 15; a marketing member sees only marketing', () => {
    expect(authorizedScopes(owner())).toHaveLength(15)
    expect(authorizedScopes(dept(member('marketing')))).toEqual(['marketing'])
  })
  it('a marketing member cannot view engineering, but can view marketing; owner views any', () => {
    const m = dept(member('marketing'))
    expect(canViewDepartment(m, 'marketing')).toBe(true)
    expect(canViewDepartment(m, 'engineering')).toBe(false)
    expect(canViewDepartment(owner(), 'engineering')).toBe(true)
  })
})

describe('departmentSummaries — the Home data isolation boundary', () => {
  it('owner → all 15 registry summaries with real module counts', () => {
    const s = departmentSummaries(owner())
    expect(s).toHaveLength(15)
    expect(s.find((d) => d.id === 'commerce')?.moduleCount).toBe(1)
    expect(s.find((d) => d.id === 'marketing')?.moduleCount).toBe(0)
    expect(s.filter((d) => d.status === 'defined').map((d) => d.id).sort()).toEqual(['ai_data', 'commerce', 'marketing'])
  })
  it('a department user sees ONLY their department — never another (no cross-department leakage)', () => {
    const s = departmentSummaries(dept(member('marketing')))
    expect(s.map((d) => d.id)).toEqual(['marketing'])
  })
  it('a member of two departments sees exactly those two', () => {
    const s = departmentSummaries(dept(member('marketing'), member('commerce')))
    expect(s.map((d) => d.id).sort()).toEqual(['commerce', 'marketing'])
  })
  it('no membership → no departments', () => {
    expect(departmentSummaries(dept())).toEqual([])
  })
})
