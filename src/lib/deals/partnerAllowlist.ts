// The Deals page on the web shows only the deals of four partners (owner 20/11/2026): Accesstrade, Lazada, Agoda and Vexere. The feed itself (GET /api/deals) is shared with the apps and is not
// changed: the web page filters what it draws. A partner name matches when it BEGINS with one of the four (so "Lazada", "lazada.vn" and "Accesstrade VN" match; "notagoda" does not). Pure.

export const ALLOWED_DEAL_PARTNERS: readonly string[] = ['accesstrade', 'lazada', 'agoda', 'vexere']

export function isAllowedDealPartner(name: unknown): boolean {
  if (typeof name !== 'string') return false
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  return n.length > 0 && ALLOWED_DEAL_PARTNERS.some(p => n === p || n.startsWith(p))
}

export function onlyAllowedPartners<T extends { partnerName?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter(r => isAllowedDealPartner(r.partnerName))
}
