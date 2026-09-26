import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAdminController } from '@/lib/controller/registry/adminModules'
import { deriveNavigation } from '@/lib/controller/navigationProvider'
import { deriveAlerts } from '@/lib/controller/alerts'
import { controllerEnv } from '@/lib/controller/adminConfig'
import { ControllerHome } from '@/components/admin/home/ControllerHome'
import type { ControllerHomeData, HomeAuditEvent } from '@/components/admin/home/types'
import { homeMode, departmentSummaries } from '@/lib/controller/org'
import { resolveDepartmentContext } from '@/lib/controller/org/server'
import { resolveEntryContext } from '@/lib/controller/org/entryContext'
import { moduleDepartment } from '@/lib/controller/org/navDepartment'
import { WorkspaceChooser } from '@/components/controller/WorkspaceChooser'
import { fetchHomeKpis } from '@/lib/admin/analytics/homeSnapshotService'
import { vnToday } from '@/lib/config/product'

// Controller V2 — Home / Control Center (server component).
//
// Carries its own permission guard, then computes the Home's data server-side:
// platform health from the Controller module registry, quick actions from the
// registry + PDP (deriveNavigation), and PDP-GATED signals/attention. A field is
// only populated if the actor is authorized — otherwise it is null (rendered as
// "restricted"/"—"), never fabricated. No new authorization or audit path.
export default async function AdminHomePage({ searchParams }: { searchParams?: { dept?: string | string[] } }) {
  // The `deniedRedirect: '/reviews'` override is gone, and deliberately so: the
  // default used to be '/admin', which for THIS page was the redirect loop. B5
  // changed the default to the denial page, which is outside the Controller — so
  // the override is no longer load-bearing, and dropping it means a refusal here
  // explains itself like every other one.
  const { actor } = await requirePagePermission(PERMISSIONS.DASHBOARD_HOME_VIEW)

  const core = buildAdminController()
  const modules = core.discover()
  const platform = {
    modulesTotal: modules.length,
    modulesEnabled: modules.filter((m) => m.status === 'enabled').length,
    modulesAvailable: modules.filter((m) => m.status === 'enabled' && m.available).length,
    hubsTotal: core.listHubs().length,
  }

  // PDP-derived navigation items. Department scoping is applied further down,
  // once `resolveEntryContext` has said which department (if any) was chosen —
  // the two are separate decisions and are kept that way.
  const navItems = deriveNavigation(core, actor).flatMap((g) => g.items)

  // PDP-gated real signals — only what THIS actor may see.
  const canRoles = permissionEngine.can(actor, PERMISSIONS.SECURITY_ROLES_READ)

  // Capability binding (FOUNDATION-01 §1). Home's manifest DECLARES a dependency
  // on `audit.read`; this is where that declaration is honoured. Two independent
  // conditions must both hold before the audit panel reads anything:
  //
  //   1. the PDP allows this actor to read the audit log, and
  //   2. the kernel can bind `audit.read` — i.e. the providing module is
  //      registered, enabled and not isolated by a failure.
  //
  // They are not redundant. (1) is authorization; (2) is availability. Disabling
  // the Audit module must close this panel for everyone including the Owner,
  // because "disabled ⇒ capability unreachable" is a property of the module, not
  // of the actor — and the Owner bypasses (1) by constitutional rule.
  const auditCapability = core.bindCapability('audit.read')
  const canAudit = permissionEngine.can(actor, PERMISSIONS.AUDIT_LOG_READ) && auditCapability !== undefined

  // Module 01's KPI block. Read on EVERY Home render, not behind an extra gate:
  // the six metrics are user-activity aggregates, which 12_RBAC.md §3 places
  // under User Analytics and grants to all four roles, and they carry no PII and
  // no revenue. `dashboard.home.view` — already required above — is the gate.
  //
  // Server-rendered for first paint, as M01 requires ("no loading flicker").
  // `fetchHomeKpis` never throws: one unreachable table must not 500 the Home.
  const kpis = await fetchHomeKpis(createAdminClient(), vnToday())

  let adminRoles: number | null = null
  let recentAudit: HomeAuditEvent[] | null = null
  if (canRoles || canAudit) {
    const supabase = createAdminClient()
    if (canRoles) {
      const { count, error } = await supabase.from('admin_roles').select('id', { count: 'exact', head: true })
      adminRoles = error ? null : count ?? 0
    }
    if (canAudit) {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, action, actor_email, actor_role, created_at')
        .order('created_at', { ascending: false })
        .limit(6)
      recentAudit = error
        ? []
        : (data ?? []).map((r) => ({
            id: String(r.id),
            action: r.action as string,
            actorEmail: (r.actor_email as string) ?? '—',
            actorRole: (r.actor_role as string) ?? 'none',
            createdAt: r.created_at as string,
          }))
    }
  }

  // Scope-aware organization foundation via the formal DepartmentContext. Owner →
  // GLOBAL (from Actor.isOwner, no DB). Memberships resolve through the flag-gated
  // seam: [] until enabled, so the live Home is behaviorally unchanged. No
  // department business data is loaded here — only the registry foundation +
  // PDP-gated platform signals — so there is nothing to scope-restrict with CSS.
  const deptContext = await resolveDepartmentContext(actor)
  const mode = homeMode(deptContext)
  const scope = deptContext.scope
  // Owner → all 15 (enterprise grid); department user → ONLY their departments
  // (isolation, server-enforced); none → []. Registry-derived, never fabricated.
  const departments = departmentSummaries(deptContext)

  // ── V2.2 ENTRY CONTEXT (Owner Decision D14) ────────────────────────────────
  //
  // `?dept=` is PRESENTATION CONTEXT. It is validated against the actor's own
  // active memberships and can only ever narrow what they already had; it
  // reaches no authorization path, `Actor` gains no department field, and every
  // page and API below still runs `requirePermission()`. An invalid, unknown,
  // hostile or someone-else's id FAILS CLOSED — back to the question, never
  // into a workspace.
  //
  // The URL is the ONLY storage D14 permits: no cookie, no localStorage, no
  // preference row, no `active_department`. Refresh survives because the URL
  // does, and nothing is written anywhere.
  //
  // ⚠️ SIDEBAR IS DELIBERATELY NOT SCOPED BY THIS, and that is an accepted V2.2
  // limitation rather than an oversight: App Router layouts do not receive
  // `searchParams`, and `admin/layout.tsx` is where nav filtering lives. Making
  // it react would need middleware or injected headers, which D14 forbids. So
  // the sidebar stays derived from the actor's full authorized membership set —
  // it must NOT be described as "selected-department scoped".
  const entry = resolveEntryContext(deptContext, typeof searchParams?.dept === 'string' ? searchParams.dept : undefined)

  if (entry.kind === 'choose') {
    // Only reachable for an actor with 2+ active memberships who has not yet
    // chosen (or asked for one they do not hold). `departments` is already
    // scope-filtered, so the options cannot name a department they lack.
    return (
      <WorkspaceChooser
        departments={departments
          .filter((d) => (entry.choosable as readonly string[]).includes(d.id))
          .map((d) => ({ id: d.id, nameKey: d.nameKey, moduleCount: d.moduleCount }))}
      />
    )
  }

  // Entering with a chosen context narrows the HOME's department presentation to
  // that department. Owner and `none` keep `selectedDepartmentId === null`, so
  // both are byte-for-byte unchanged from V2.1.
  //
  // 🔑 V2.4 BUG FIX. This value was computed here and then NEVER USED — the data
  // object below passed the unfiltered `departments`, so `?dept=` narrowed
  // nothing and a member with three memberships still saw all three on Home.
  // The variable name and the comment made it read as implemented; only a grep
  // for its single occurrence exposed it. `d14EntryIntegration.test.tsx` now
  // covers this wiring at page level, which is where the gap was — the resolver
  // itself was correct and well tested throughout.
  //
  // Presentation only: `departments` is ALREADY the isolation boundary
  // (`authorizedScopes` → active memberships), so this can only narrow a set the
  // actor was already entitled to see. No authorization decision reads it.
  const presentedDepartments = entry.selectedDepartmentId
    ? departments.filter((d) => d.id === entry.selectedDepartmentId)
    : departments

  // ── V2.4 — WHICH FUNCTIONS THIS HOME OFFERS ────────────────────────────────
  //
  // `navItems` is already PDP-filtered. Entering with a chosen department also
  // narrows it: another department's modules are not this workspace's functions.
  // Department-NEUTRAL modules (Home, Settings — anything no department owns)
  // always stay; their PDP guard is their only gate, and hiding them would make
  // a scoped Home less usable without making anything safer.
  //
  // ⚠️ PRESENTATION ONLY, AND ONLY ON SELECTION. With no `?dept=` this is the
  // identity function, so the Owner view and the `none` view are unchanged. The
  // SIDEBAR is not touched here at all — `admin/layout.tsx` keeps deriving it
  // from the actor's full membership set, exactly as D14 requires.
  const scopedNavItems = entry.selectedDepartmentId
    ? navItems.filter((i) => {
        const owner = moduleDepartment(i.moduleId)
        return owner === null || owner === entry.selectedDepartmentId
      })
    : navItems

  const toLink = (i: (typeof navItems)[number]) => ({
    moduleId: i.moduleId,
    label: i.label,
    icon: i.icon,
    route: i.route,
  })

  const quickActions = scopedNavItems.map(toLink)

  // The department's OWN functions — ownership ∩ authorization. Empty for the
  // Owner and for `none` (no selection), and empty for a department that owns
  // nothing the actor may open, which is what renders the approved empty state.
  const departmentModules = entry.selectedDepartmentId
    ? scopedNavItems.filter((i) => moduleDepartment(i.moduleId) === entry.selectedDepartmentId).map(toLink)
    : []

  // One env mapping for the whole Controller — see controllerEnv.
  const env = controllerEnv()

  const data: ControllerHomeData = {
    controllerVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? core.version,
    env,
    actor: { role: actor.highestRole ?? 'analyst', isOwner: actor.isOwner, email: actor.email },
    mode,
    platform,
    signals: { adminRoles },
    kpis,
    attention: { recentAudit, alerts: deriveAlerts(core, actor) },
    quickActions,
    // `scope` stays UN-narrowed on purpose: it is the authorization-derived
    // scope, and D14 says department selection is presentation context. Only the
    // presented list narrows.
    scope,
    departments: presentedDepartments,
    departmentModules,
  }

  return <ControllerHome data={data} />
}
