// /api/admin/org/memberships — Controller V2 department membership management
// (FOUNDATION-07C). Thin adapter: the AUTHORITY is the membership service
// (canonical PDP + department authority + audit, fail-closed) — this route only
// gates, validates, and maps to the uniform envelope. There is no client-side-only
// authorization; direct URL/API access runs the exact same checks.
//
// STAGED: gated on CONTROLLER_ORG_MEMBERSHIP_ENABLED (default OFF) → the endpoint
// returns 404 until the org membership feature is enabled (F-07D). UNDEPLOYED in
// this phase; department_membership in production remains empty.

import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { isPlatformOwner } from '@/lib/admin/owner'
import {
  assignMembership,
  setMembershipStatus,
  removeMembership,
  listDepartmentRoster,
  type MembershipResult,
} from '@/lib/controller/org/membershipService'
import { productionMembershipDeps, orgMembershipEnabled } from '@/lib/controller/org/server'
import type { DepartmentId, OrgRole, OrgScope } from '@/lib/controller/org'
import { AssignMembershipSchema, StatusMembershipSchema, RemoveMembershipSchema } from './schema'

export const dynamic = 'force-dynamic'

/** The feature is inert until explicitly enabled — the endpoint does not exist otherwise. */
function featureGate(): Response | null {
  return orgMembershipEnabled() ? null : adminError('NOT_FOUND', 'Not found', 404)
}

// Map a service result to HTTP. Fail-closed: any denial is 403 unless it is
// specifically a not-found/unknown (404) or unauthenticated (401).
function respond(r: MembershipResult): Response {
  if (r.ok) return Response.json({ data: r.membership })
  if (r.reason === 'UNAUTHENTICATED') return adminError('UNAUTHORIZED', r.reason, 401)
  if (r.reason === 'NOT_FOUND' || r.reason === 'UNKNOWN_DEPARTMENT') return adminError('NOT_FOUND', r.reason, 404)
  return adminError('FORBIDDEN', r.reason, 403)
}

/**
 * GET — the department roster (Owner Decision D6, 2026-08-22).
 *
 * FOUNDATION-10B shipped this route with POST/PATCH/DELETE and no GET, and
 * stated why: the read existed in the service but had no consumer. The
 * `/admin/org/memberships` surface is that consumer.
 *
 * The permission is the READ one. Reading who belongs to a department must not
 * require `security.membership.manage`, which is `riskLevel: critical` and
 * exists to CHANGE the thing this only displays. Both are super_admin today, so
 * this widens nothing — but wiring the read to the write permission would make
 * a future widening of one silently widen the other.
 */
export async function GET(req: Request) {
  try {
    const gated = featureGate(); if (gated) return gated
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_MEMBERSHIP_READ)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:org:roster:${ctx.user.id}`, 100, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const result = await listDepartmentRoster(ctx.actor, productionMembershipDeps(req))
    if (!result.ok) {
      if (result.reason === 'UNAUTHENTICATED') return adminError('UNAUTHORIZED', result.reason, 401)
      return adminError('FORBIDDEN', result.reason, 403)
    }
    return Response.json({ data: result.memberships })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const gated = featureGate(); if (gated) return gated
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_MEMBERSHIP_MANAGE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:org:assign:${ctx.user.id}`, 20, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const parsed = AssignMembershipSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const input = parsed.data

    const targetIsOwner = await isPlatformOwner(input.targetUserId)
    const result = await assignMembership(
      ctx.actor,
      {
        targetUserId: input.targetUserId,
        targetIsOwner,
        targetDepartment: input.targetDepartment as DepartmentId,
        targetOrgRole: input.targetOrgRole as OrgRole,
        targetScope: input.targetScope as OrgScope,
      },
      productionMembershipDeps(req)
    )
    return respond(result)
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const gated = featureGate(); if (gated) return gated
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_MEMBERSHIP_MANAGE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:org:status:${ctx.user.id}`, 20, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const parsed = StatusMembershipSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const input = parsed.data

    const targetIsOwner = await isPlatformOwner(input.targetUserId)
    const result = await setMembershipStatus(
      ctx.actor,
      { targetUserId: input.targetUserId, targetIsOwner, departmentId: input.departmentId as DepartmentId, status: input.status },
      productionMembershipDeps(req)
    )
    return respond(result)
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const gated = featureGate(); if (gated) return gated
    const ctx = await requirePermission(req, PERMISSIONS.SECURITY_MEMBERSHIP_MANAGE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:org:remove:${ctx.user.id}`, 20, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    const parsed = RemoveMembershipSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const input = parsed.data

    const targetIsOwner = await isPlatformOwner(input.targetUserId)
    const result = await removeMembership(
      ctx.actor,
      { targetUserId: input.targetUserId, targetIsOwner, departmentId: input.departmentId as DepartmentId },
      productionMembershipDeps(req)
    )
    return respond(result)
  } catch (err) {
    return adminErrorResponse(err)
  }
}
