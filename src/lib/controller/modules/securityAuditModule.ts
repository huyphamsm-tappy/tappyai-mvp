// Controller V2 — FIRST REAL MODULE (FOUNDATION-02 STEP 11).
//
// This describes the ALREADY-EXISTING, already-deployed Audit surface
// (`/admin/audit`, permission `audit.log.read`, C7 audit chain) as a Controller
// module. It declares metadata and points at the existing surface — it does NOT
// re-implement audit, RBAC, or the PDP. Its purpose is to prove the framework
// end-to-end against a genuine backend capability, without inventing product
// behaviour.

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { HubDescriptor, ModuleManifest } from '../types'

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

export const securityAuditModule: ModuleManifest = {
  id: 'tappy.hub.security.audit',
  name: 'Audit Log',
  version: '1.0.0',
  owner: 'platform',
  hub: 'tappy.hub.security',
  capabilities: ['audit.read'],
  permissions: [PERMISSIONS.AUDIT_LOG_READ],
  dependencies: [],
  routes: ['/admin/audit'],
  navigation: {
    label: 'admin.nav.auditLog',
    icon: 'ScrollText',
    order: 20,
    visibilityPermission: PERMISSIONS.AUDIT_LOG_READ,
  },
  lifecycle: 'stable',
  status: 'enabled',
  compatibility: { controller: '^1' },
}
