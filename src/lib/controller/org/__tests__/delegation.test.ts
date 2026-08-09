import { describe, it, expect } from 'vitest'
import { canDelegate, canAdministerDepartment } from '../delegation'
import type { DepartmentMembership, DepartmentId, OrgRole, OrgScope } from '../types'

// FOUNDATION-06 — Department Head delegation BOUNDARY. Pure decisions; no PDP,
// no DB. Proves a Head is a bounded administrator and the Ultimate Owner stays
// singular and untouchable through delegation.

const member = (departmentId: DepartmentId, orgRole: OrgRole, scope: OrgScope, status: 'active' | 'suspended' = 'active'): DepartmentMembership =>
  ({ userId: 'actor', departmentId, orgRole, scope, status })

const owner = { userId: 'owner', isOwner: true }
const head = { userId: 'actor', isOwner: false }
const MKT_HEAD = [member('marketing', 'DEPARTMENT_HEAD', 'marketing')]

describe('canAdministerDepartment', () => {
  it('the Ultimate Owner administers any department', () => {
    expect(canAdministerDepartment(owner, [], 'finance')).toBe(true)
  })
  it('a Head administers only their own department', () => {
    expect(canAdministerDepartment(head, MKT_HEAD, 'marketing')).toBe(true)
    expect(canAdministerDepartment(head, MKT_HEAD, 'engineering')).toBe(false)
  })
  it('an Employee administers nothing', () => {
    expect(canAdministerDepartment(head, [member('marketing', 'EMPLOYEE', 'marketing')], 'marketing')).toBe(false)
  })
  it('a suspended Head administers nothing', () => {
    expect(canAdministerDepartment(head, [member('marketing', 'DEPARTMENT_HEAD', 'marketing', 'suspended')], 'marketing')).toBe(false)
  })
})

describe('canDelegate — Ultimate Owner', () => {
  it('may assign a Manager/Employee within a department scope', () => {
    expect(canDelegate(owner, [], { targetUserId: 't', targetDepartment: 'finance', targetOrgRole: 'DEPARTMENT_MANAGER', targetScope: 'finance' }))
      .toEqual({ allowed: true, reason: 'ULTIMATE_OWNER' })
  })
  it('may NOT mint another Ultimate Owner (owner is singular, DB-enforced)', () => {
    expect(canDelegate(owner, [], { targetUserId: 't', targetDepartment: 'finance', targetOrgRole: 'ULTIMATE_OWNER', targetScope: 'finance' }))
      .toMatchObject({ allowed: false, reason: 'OWNER_IS_SINGULAR' })
  })
  it('may NOT modify the Ultimate Owner', () => {
    expect(canDelegate(owner, [], { targetUserId: 't', targetIsOwner: true, targetDepartment: 'finance', targetOrgRole: 'EMPLOYEE', targetScope: 'finance' }))
      .toMatchObject({ allowed: false, reason: 'CANNOT_MODIFY_OWNER' })
  })
})

describe('canDelegate — Department Head boundaries', () => {
  it('may assign an Employee within their own department', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'marketing' }))
      .toEqual({ allowed: true, reason: 'DEPARTMENT_HEAD' })
  })
  it('may NOT create a peer Head', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'marketing', targetOrgRole: 'DEPARTMENT_HEAD', targetScope: 'marketing' }))
      .toMatchObject({ allowed: false, reason: 'CANNOT_CREATE_PEER_OR_HIGHER' })
  })
  it('may NOT administer another department', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'engineering', targetOrgRole: 'EMPLOYEE', targetScope: 'engineering' }))
      .toMatchObject({ allowed: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
  it('may NOT grant GLOBAL scope (escalation)', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'GLOBAL' }))
      .toMatchObject({ allowed: false, reason: 'SCOPE_ESCALATION' })
  })
  it('may NOT assign a scope other than the target department', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'engineering' }))
      .toMatchObject({ allowed: false, reason: 'SCOPE_ESCALATION' })
  })
  it('may NOT grant authority to themselves', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 'actor', targetDepartment: 'marketing', targetOrgRole: 'DEPARTMENT_MANAGER', targetScope: 'marketing' }))
      .toMatchObject({ allowed: false, reason: 'CANNOT_SELF_GRANT' })
  })
  it('an Employee (not a Head) cannot delegate at all', () => {
    expect(canDelegate(head, [member('marketing', 'EMPLOYEE', 'marketing')], { targetUserId: 't', targetDepartment: 'marketing', targetOrgRole: 'EMPLOYEE', targetScope: 'marketing' }))
      .toMatchObject({ allowed: false, reason: 'NOT_DEPARTMENT_ADMIN' })
  })
  it('unknown department fails closed', () => {
    expect(canDelegate(head, MKT_HEAD, { targetUserId: 't', targetDepartment: 'nope' as DepartmentId, targetOrgRole: 'EMPLOYEE', targetScope: 'nope' as OrgScope }))
      .toMatchObject({ allowed: false, reason: 'UNKNOWN_DEPARTMENT' })
  })
})
