import { z } from 'zod'
import { DEPARTMENT_IDS } from '@/lib/controller/org'

// Department id enum, derived from the canonical 15-department registry.
const department = z.enum(DEPARTMENT_IDS as [string, ...string[]])
const orgRole = z.enum(['DEPARTMENT_HEAD', 'DEPARTMENT_MANAGER', 'EMPLOYEE'])

export const AssignMembershipSchema = z.object({
  targetUserId: z.string().uuid(),
  targetDepartment: department,
  targetOrgRole: orgRole,
  // Must equal the department (or be rejected as SCOPE_ESCALATION by the service).
  targetScope: z.string().min(1),
})

export const StatusMembershipSchema = z.object({
  targetUserId: z.string().uuid(),
  departmentId: department,
  status: z.enum(['active', 'suspended']),
})

export const RemoveMembershipSchema = z.object({
  targetUserId: z.string().uuid(),
  departmentId: department,
})
