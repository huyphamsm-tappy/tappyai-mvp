import { describe, it, expect } from 'vitest'
import { moduleDepartment, isModuleVisibleForDepartment, filterNavByDepartment } from '../navDepartment'
import type { NavGroup } from '../../navigationProvider'
import type { DepartmentMembership } from '../types'

// FOUNDATION-07C — department-aware nav FILTERING (pure, post-PDP refinement).
// Nav visibility is UX only; server authorization remains the boundary.

const member = (departmentId: DepartmentMembership['departmentId']): DepartmentMembership =>
  ({ userId: 'u', departmentId, orgRole: 'EMPLOYEE', scope: departmentId, status: 'active' })

const COMMERCE_MOD = 'tappy.hub.commerce.deals'
const NEUTRAL_MOD = 'tappy.hub.dashboard.home' // owned by no department

describe('moduleDepartment', () => {
  it('maps a department-owned module to its department', () => {
    expect(moduleDepartment(COMMERCE_MOD)).toBe('commerce')
    expect(moduleDepartment('tappy.hub.analytics.auth')).toBe('ai_data')
  })
  it('returns null for a department-neutral module', () => {
    expect(moduleDepartment(NEUTRAL_MOD)).toBeNull()
  })
})

describe('isModuleVisibleForDepartment', () => {
  it('owner sees any module (GLOBAL)', () => {
    expect(isModuleVisibleForDepartment(COMMERCE_MOD, { isOwner: true, memberships: [] })).toBe(true)
  })
  it('a commerce member sees the commerce module; a marketing member does not', () => {
    expect(isModuleVisibleForDepartment(COMMERCE_MOD, { isOwner: false, memberships: [member('commerce')] })).toBe(true)
    expect(isModuleVisibleForDepartment(COMMERCE_MOD, { isOwner: false, memberships: [member('marketing')] })).toBe(false)
  })
  it('a neutral module is visible to any authenticated actor (PDP is its only gate)', () => {
    expect(isModuleVisibleForDepartment(NEUTRAL_MOD, { isOwner: false, memberships: [member('marketing')] })).toBe(true)
  })
  it('a suspended membership does not confer visibility', () => {
    const suspended: DepartmentMembership = { ...member('commerce'), status: 'suspended' }
    expect(isModuleVisibleForDepartment(COMMERCE_MOD, { isOwner: false, memberships: [suspended] })).toBe(false)
  })
})

describe('filterNavByDepartment', () => {
  const groups: NavGroup[] = [
    {
      hubId: 'commerce', label: 'Commerce', order: 30,
      items: [
        { moduleId: COMMERCE_MOD, label: 'Deals', route: '/admin/deals', order: 0 },
        { moduleId: NEUTRAL_MOD, label: 'Home', route: '/admin', order: 0 },
      ],
    },
  ]
  it('a marketing member sees only the neutral module; the group is not dropped', () => {
    const out = filterNavByDepartment(groups, { isOwner: false, memberships: [member('marketing')] })
    expect(out).toHaveLength(1)
    expect(out[0].items.map((i) => i.moduleId)).toEqual([NEUTRAL_MOD])
  })
  it('a commerce member sees both', () => {
    const out = filterNavByDepartment(groups, { isOwner: false, memberships: [member('commerce')] })
    expect(out[0].items).toHaveLength(2)
  })
  it('owner sees both', () => {
    const out = filterNavByDepartment(groups, { isOwner: true, memberships: [] })
    expect(out[0].items).toHaveLength(2)
  })
  it('a group with only unauthorized department modules is dropped', () => {
    const commerceOnly: NavGroup[] = [{ hubId: 'commerce', label: 'Commerce', order: 30, items: [{ moduleId: COMMERCE_MOD, label: 'Deals', route: '/admin/deals', order: 0 }] }]
    expect(filterNavByDepartment(commerceOnly, { isOwner: false, memberships: [member('marketing')] })).toHaveLength(0)
  })

  // A non-Owner with NO membership at all. Every case above gives the actor a
  // membership somewhere, so this state was previously unexercised — and it is
  // exactly the state every non-Owner is in the moment the feature flag is
  // switched on, before the first membership row exists.
  describe('a non-Owner with ZERO memberships', () => {
    const memberless = { isOwner: false, memberships: [] as DepartmentMembership[] }

    it('sees no department-owned module', () => {
      expect(isModuleVisibleForDepartment(COMMERCE_MOD, memberless)).toBe(false)
      expect(isModuleVisibleForDepartment('tappy.hub.analytics.auth', memberless)).toBe(false)
    })

    it('still sees department-neutral modules — the PDP remains their only gate', () => {
      expect(isModuleVisibleForDepartment(NEUTRAL_MOD, memberless)).toBe(true)
    })

    it('keeps the neutral item and loses the department-owned one', () => {
      const out = filterNavByDepartment(groups, memberless)
      expect(out).toHaveLength(1)
      expect(out[0].items.map((i) => i.moduleId)).toEqual([NEUTRAL_MOD])
    })

    // The Owner in this same state is already covered by 'owner sees both' above.
  })
})
