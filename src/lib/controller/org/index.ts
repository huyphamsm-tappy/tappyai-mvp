// Controller V2 — Organization / Department foundation (public surface).
export * from './types'
export { DEPARTMENTS, DEPARTMENT_IDS, getDepartment, CROSS_DEPARTMENT_ACCESS } from './departments'
export { scopeCovers, anyScopeCovers } from './scope'
export {
  buildDepartmentContext,
  homeMode,
  authorizedScopes,
  canViewDepartment,
  departmentSummaries,
} from './context'
export { authorizeDepartmentResource, visibleDepartmentIds } from './authorization'
export {
  canAdministerDepartment,
  canDelegate,
  type DelegationRequest,
  type DelegationDecision,
  type DelegationDenyReason,
} from './delegation'
export {
  inMemoryMembershipResolver,
  deferredDbMembershipResolver,
  type MembershipResolver,
} from './membership'
export {
  dbMembershipResolver,
  supabaseMembershipStore,
  type MembershipStore,
  type MembershipRow,
} from './dbMembership'
// NB: ./server (createAdminClient seam) is intentionally NOT re-exported here —
// this barrel stays server-free so client bundles don't pull it in.
