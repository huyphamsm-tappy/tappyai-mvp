// Controller V2 — Home data contract (server-computed in admin/page.tsx, passed
// to the client ControllerHome). Serializable only. `null` on a field means the
// actor is not permitted to see it (PDP-restricted) — never "zero".

import type { HomeMode, HomeDepartmentSummary } from '@/lib/controller/org'

export interface HomeAuditEvent {
  id: string
  action: string
  actorEmail: string
  actorRole: string
  createdAt: string
}

export interface HomeModuleLink {
  moduleId: string
  label: string
  icon?: string
  route: string
}

export interface ControllerHomeData {
  controllerVersion: string
  env: 'production' | 'preview' | 'local'
  actor: { role: string; isOwner: boolean; email: string }
  /** owner → enterprise command center · department → scoped workspace · none → no workspace. */
  mode: HomeMode
  platform: {
    modulesTotal: number
    modulesEnabled: number
    modulesAvailable: number
    hubsTotal: number
  }
  /** adminRoles is null when the actor lacks security.roles.read. */
  signals: { adminRoles: number | null }
  /** recentAudit is null when the actor lacks audit.log.read. */
  attention: { recentAudit: HomeAuditEvent[] | null }
  quickActions: HomeModuleLink[]
  /** Scope-aware organization context (Owner → global; else the actor's departments). */
  scope: { isGlobal: boolean; departmentIds: string[] }
  /**
   * Departments the actor may SEE: the Ultimate Owner gets all 15 (enterprise
   * grid); a department user gets ONLY their own departments. This is the Home
   * isolation boundary — a department user's list never contains another
   * department. Registry-derived; moduleCount is real, never a fabricated KPI.
   */
  departments: HomeDepartmentSummary[]
}
