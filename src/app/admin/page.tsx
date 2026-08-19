import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAdminController } from '@/lib/controller/registry/adminModules'
import { deriveNavigation } from '@/lib/controller/navigationProvider'
import { ControllerHome } from '@/components/admin/home/ControllerHome'
import type { ControllerHomeData, HomeAuditEvent } from '@/components/admin/home/types'
import { homeMode, departmentSummaries } from '@/lib/controller/org'
import { resolveDepartmentContext } from '@/lib/controller/org/server'

// Controller V2 — Home / Control Center (server component).
//
// Carries its own permission guard, then computes the Home's data server-side:
// platform health from the Controller module registry, quick actions from the
// registry + PDP (deriveNavigation), and PDP-GATED signals/attention. A field is
// only populated if the actor is authorized — otherwise it is null (rendered as
// "restricted"/"—"), never fabricated. No new authorization or audit path.
export default async function AdminHomePage() {
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

  const quickActions = deriveNavigation(core, actor)
    .flatMap((g) => g.items)
    .map((i) => ({ moduleId: i.moduleId, label: i.label, icon: i.icon, route: i.route }))

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

  const rawEnv = process.env.VERCEL_ENV
  const env: ControllerHomeData['env'] = rawEnv === 'production' ? 'production' : rawEnv === 'preview' ? 'preview' : 'local'

  const data: ControllerHomeData = {
    controllerVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? core.version,
    env,
    actor: { role: actor.highestRole ?? 'analyst', isOwner: actor.isOwner, email: actor.email },
    mode,
    platform,
    signals: { adminRoles },
    attention: { recentAudit },
    quickActions,
    scope,
    departments,
  }

  return <ControllerHome data={data} />
}
