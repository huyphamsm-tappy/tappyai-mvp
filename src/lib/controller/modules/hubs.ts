import type { HubDescriptor } from '../types'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'

// Controller V2 — hub descriptors that more than one module belongs to.
//
// WHY THIS FILE EXISTS.
//
// `userHub` and `securityHub` used to live INSIDE `userManagementModule.ts` and
// `securityAuditModule.ts`. That inverts the relationship the contract
// describes: `FOUNDATION_01_CONTRACTS.md` §2 says a Hub "contains and governs
// modules", so defining one inside a member makes the container depend on one
// of the things it contains.
//
// It stayed harmless while each hub had exactly one module. It stopped being
// harmless the moment Module 09 joined the User hub: `moderationModule.ts` had
// to `import { userHub } from './userManagementModule'`, which is the repo's
// first MODULE → MODULE import — precisely what
// `01_CONTROLLER_V2_ARCHITECTURE.md` §1 rule 1 forbids, and it would have made
// Content Moderation fail to compile if User Management were ever removed.
//
// Hubs that only ever had registry-level definitions (`founderHub`,
// `analyticsHub`, `commerceHub`, `configurationHub`) stay where they are: they
// were never inside a module, so moving them would be churn.

export const userHub: HubDescriptor = {
  id: 'tappy.hub.user',
  name: 'User',
  version: '1.0.0',
  owner: 'platform',
  permissionScope: PERMISSIONS.USERS_LIST_READ,
  navigationGroup: 'admin.nav.group.user',
  navigationOrder: 5,
  lifecycle: 'stable',
}

export const securityHub: HubDescriptor = {
  id: 'tappy.hub.security',
  name: 'Security',
  version: '1.0.0',
  owner: 'platform',
  permissionScope: PERMISSIONS.AUDIT_LOG_READ,
  navigationGroup: 'admin.nav.group.security',
  navigationOrder: 20,
  lifecycle: 'stable',
}
