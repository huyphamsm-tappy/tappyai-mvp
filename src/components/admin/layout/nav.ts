import type { ComponentType } from 'react'
import {
  LayoutDashboard, BarChart3, Users, ShieldAlert, Megaphone,
  ScrollText, KeyRound, Settings as SettingsIcon, Activity, UserCheck, Zap, Tag,
} from 'lucide-react'
import { hasRole, type AdminRole } from '@/lib/admin/roles'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import { filterByPermission } from '@/lib/admin/permissions/client'
import type { PermissionId } from '@/lib/admin/permissions/types'

// The Controller's navigation model and its visibility rule.
//
// Extracted from AdminShell so the rule can be tested. It was inline, untested,
// and the PR review found that the Component 3 migration had silently dropped
// the role gate from the four `ready:false` placeholders — an analyst could see
// nav entries that had been admin-only. Nothing in the suite noticed.

export type NavItem = {
  href: string
  labelKey: string
  icon: ComponentType<{ className?: string }>
  /**
   * Permission required to see this entry, replacing the old `minRole`.
   * Visibility follows the actor's resolved permission set rather than role
   * rank, so a role can be broad in one module and absent from another —
   * something a ladder could not express.
   */
  permission?: PermissionId
  /**
   * Visibility for `ready:false` PLACEHOLDERS only.
   *
   * These are future Hubs. They own no permission because the module they
   * point at does not exist, and inventing one would make the registry
   * describe something that isn't there. So placeholder visibility stays on
   * role rank — reproducing the pre-Component-3 `minRole` exactly.
   *
   * ⚠️ This is NOT authorization. The entries are disabled, link nowhere, and
   * grant nothing. Replace each with a real `permission` when its Hub ships.
   */
  placeholderMinRole?: AdminRole
  ready: boolean
}

export const NAV: NavItem[] = [
  { href: '/admin', labelKey: 'admin.nav.dashboard', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_HOME_VIEW, ready: true },
  { href: '/admin/analytics', labelKey: 'admin.nav.analytics', icon: BarChart3, permission: PERMISSIONS.ANALYTICS_CONTENT_READ, ready: true },
  { href: '/admin/analytics/auth', labelKey: 'admin.nav.authAnalytics', icon: UserCheck, permission: PERMISSIONS.ANALYTICS_AUTH_READ, ready: true },
  { href: '/admin/analytics/activation', labelKey: 'admin.nav.activationAnalytics', icon: Zap, permission: PERMISSIONS.ANALYTICS_ACTIVATION_READ, ready: true },
  { href: '/admin/users', labelKey: 'admin.nav.users', icon: Users, placeholderMinRole: 'admin', ready: false },
  { href: '/admin/moderation', labelKey: 'admin.nav.moderation', icon: ShieldAlert, placeholderMinRole: 'moderator', ready: false },
  { href: '/admin/engagement', labelKey: 'admin.nav.engagement', icon: Megaphone, placeholderMinRole: 'admin', ready: false },
  { href: '/admin/audit', labelKey: 'admin.nav.auditLog', icon: ScrollText, permission: PERMISSIONS.AUDIT_LOG_READ, ready: true },
  { href: '/admin/deals', labelKey: 'admin.nav.deals', icon: Tag, permission: PERMISSIONS.COMMERCE_DEALS_READ, ready: true },
  { href: '/admin/rbac', labelKey: 'admin.nav.roles', icon: KeyRound, permission: PERMISSIONS.SECURITY_ROLES_READ, ready: true },
  { href: '/admin/monitoring', labelKey: 'admin.nav.monitoring', icon: Activity, placeholderMinRole: 'admin', ready: false },
  { href: '/admin/settings', labelKey: 'admin.nav.settings', icon: SettingsIcon, permission: PERMISSIONS.SETTINGS_CONFIG_READ, ready: true },
]

/**
 * The nav entries this actor may see.
 *
 * Two rules, because the nav holds two kinds of entry:
 *
 *   - **Real pages** are filtered on the resolved permission set. Every one of
 *     them is independently guarded server-side; hiding the entry is a courtesy
 *     so an operator never sees a door they cannot open.
 *   - **Placeholders** (`ready:false`) carry no permission, so the permission
 *     filter passes them through unconditionally. Their role gate is re-applied
 *     here — without it, dropping `minRole` silently revealed admin-only
 *     entries to every analyst.
 *
 * The Owner sees everything. They hold no role, so a rank comparison would hide
 * placeholders from the one principal who outranks all of them.
 */
export function visibleNavItems(
  items: readonly NavItem[],
  permissions: readonly PermissionId[],
  role: AdminRole,
  isOwner: boolean
): NavItem[] {
  return filterByPermission(permissions, items, (item) => item.permission).filter(
    (item) => !item.placeholderMinRole || isOwner || hasRole(role, item.placeholderMinRole)
  )
}
