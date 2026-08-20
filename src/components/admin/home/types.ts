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

import type { ControllerAlert } from '@/lib/controller/alerts'

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
  /**
   * Module 01's business KPIs, read from `daily_snapshots` (M01: pre-computed,
   * no live queries to raw tables).
   *
   * Its own `status` distinguishes `empty` (the pipeline has not run) from a
   * genuine zero day, and `stale` from fresh — so the UI never has to guess,
   * and a missing measurement is never rendered as `0`.
   */
  kpis: import('@/lib/admin/analytics/homeSnapshotService').HomeKpis
  attention: {
    /** null when the actor lacks audit.log.read. */
    recentAudit: HomeAuditEvent[] | null
    /**
     * Alert Well (B5). Derived server-side from registry facts, already
     * permission-filtered and ordered most-severe-first. An empty array is a
     * real answer — "nothing needs attention" — not a missing source.
     */
    alerts: ControllerAlert[]
  }
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
