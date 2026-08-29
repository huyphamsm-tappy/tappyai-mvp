// Controller V2 — Department Registry (data/config, NOT authorization logic).
//
// All 15 owner-approved departments. Only the departments with established
// project evidence carry business fields; the rest are honest PLACEHOLDERS
// (architectural identity only — no invented modules/permissions/workflows).
//
// Evidence basis (MEASURED): the only department-owned operational capability
// that exists in the repo today is Commerce (`commerce.deals.*`, the Deals
// module). Marketing has identity but NO established owned capability yet.
// AI/Data is a CROSS-DEPARTMENT analytical capability (analytics.* + governed
// read/analyze into other departments) — it does not OWN other departments'
// resources.

import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { CrossDepartmentAccess, Department, DepartmentId } from './types'

export const DEPARTMENTS: Readonly<Record<DepartmentId, Department>> = Object.freeze({
  // ── Defined (evidence-backed) ──────────────────────────────────────────────
  commerce: {
    id: 'commerce', name: 'admin.dept.commerce', displayName: 'Sales / Commerce / Ecommerce',
    status: 'defined',
    ownedPermissions: ['commerce.deals.read', 'commerce.deals.create', 'commerce.deals.update', 'commerce.deals.delete'],
    modules: ['tappy.hub.commerce.deals'],
    notes: 'Owns the Partner Deals / commerce operational resources (the only established department capability).',
  },
  marketing: {
    id: 'marketing', name: 'admin.dept.marketing', displayName: 'Marketing / Growth',
    status: 'defined',
    // Marketing V1 foundation — Owner-frozen contract, 2026-08-29. Exactly five
    // module groups: Campaigns, Content, Audience, Promotions, Analytics.
    //
    // 🔑 This entry previously read "do not invent marketing.* modules", and
    // that instruction did its job: nothing here was invented. These ids and
    // permissions exist because the Owner defined and froze them, not because a
    // department name suggested them. The same rule still applies to a SIXTH
    // module — the set is closed at five.
    ownedPermissions: [
      'marketing.campaigns.read', 'marketing.campaigns.create', 'marketing.campaigns.update', 'marketing.campaigns.activate',
      'marketing.content.read', 'marketing.content.create', 'marketing.content.update',
      'marketing.audience.read', 'marketing.audience.create', 'marketing.audience.update',
      'marketing.promotions.read', 'marketing.promotions.create', 'marketing.promotions.update', 'marketing.promotions.activate',
      'marketing.analytics.read',
    ],
    modules: [
      'tappy.hub.marketing.campaigns',
      'tappy.hub.marketing.content',
      'tappy.hub.marketing.audience',
      'tappy.hub.marketing.promotions',
      'tappy.hub.marketing.analytics',
    ],
    notes:
      'Marketing V1 FOUNDATION: module identities, permissions and navigation only — no table, API or CRUD behind any of them yet. Promotions is deliberately DISTINCT from Commerce partner_deals (first-party programs vs partner inventory) and must never read or write them. Marketing Analytics is a separate surface from AI/Data analytics.',
  },
  ai_data: {
    id: 'ai_data', name: 'admin.dept.aiData', displayName: 'AI / Data',
    status: 'defined',
    ownedPermissions: ['analytics.read', 'analytics.auth.read', 'analytics.activation.read', 'analytics.content.read'],
    modules: ['tappy.hub.analytics.auth', 'tappy.hub.analytics.activation', 'tappy.hub.analytics.content'],
    notes: 'Cross-department ANALYTICAL capability. Owns analytics tooling; receives governed READ/ANALYZE into other departments — never ownership of their operational data.',
  },

  // ── Placeholders (identity only — NO invented business scope) ──────────────
  executive: { id: 'executive', name: 'admin.dept.executive', displayName: 'Executive / Management', status: 'placeholder', ownedPermissions: [], modules: [] },
  product: { id: 'product', name: 'admin.dept.product', displayName: 'Product', status: 'placeholder', ownedPermissions: [], modules: [] },
  engineering: { id: 'engineering', name: 'admin.dept.engineering', displayName: 'Engineering / Technology', status: 'placeholder', ownedPermissions: [], modules: [] },
  security: { id: 'security', name: 'admin.dept.security', displayName: 'Security', status: 'placeholder', ownedPermissions: [], modules: [] },
  finance: { id: 'finance', name: 'admin.dept.finance', displayName: 'Finance / Accounting', status: 'placeholder', ownedPermissions: [], modules: [] },
  business_development: { id: 'business_development', name: 'admin.dept.bizDev', displayName: 'Business Development', status: 'placeholder', ownedPermissions: [], modules: [] },
  support: { id: 'support', name: 'admin.dept.support', displayName: 'Customer Support / Operations', status: 'placeholder', ownedPermissions: [], modules: [] },
  legal: { id: 'legal', name: 'admin.dept.legal', displayName: 'Legal / Compliance', status: 'placeholder', ownedPermissions: [], modules: [] },
  hr: { id: 'hr', name: 'admin.dept.hr', displayName: 'HR / People', status: 'placeholder', ownedPermissions: [], modules: [] },
  content: { id: 'content', name: 'admin.dept.content', displayName: 'Content / Creative', status: 'placeholder', ownedPermissions: [], modules: [] },
  qa: { id: 'qa', name: 'admin.dept.qa', displayName: 'QA / Release', status: 'placeholder', ownedPermissions: [], modules: [] },
  it: { id: 'it', name: 'admin.dept.it', displayName: 'IT / Internal Systems', status: 'placeholder', ownedPermissions: [], modules: [] },
})

export const DEPARTMENT_IDS = Object.keys(DEPARTMENTS) as DepartmentId[]

export function getDepartment(id: string): Department | undefined {
  return (DEPARTMENTS as Record<string, Department>)[id]
}

/**
 * Governed cross-department access grants (data ownership ≠ data access).
 * AI/Data may READ/ANALYZE Commerce- and Marketing-owned resources. This grants
 * NO ownership and NO write.
 */
export const CROSS_DEPARTMENT_ACCESS: readonly CrossDepartmentAccess[] = Object.freeze([
  { fromDepartment: 'ai_data', toDepartment: 'commerce', mode: 'analyze', permissions: [PERMISSIONS.COMMERCE_DEALS_READ] },
  { fromDepartment: 'ai_data', toDepartment: 'marketing', mode: 'analyze', permissions: [] },
])
