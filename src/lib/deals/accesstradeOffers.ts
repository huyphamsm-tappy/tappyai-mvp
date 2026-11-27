// Accesstrade promotions -> partner_deals rows (owner 26/11/2026: "real discount deals for Lazada and Vexere, not a generic card").
//
// Source: GET https://api.accesstrade.vn/v1/offers_informations (header `Authorization: Token <key>`), filtered by `domain`, active offers only.
// Documented fields of one offer (developers.accesstrade.vn, "Get promotional information"): id, name, content, link, aff_link, merchant, domain, image, banners[],
// start_time / end_time (YYYY-MM-DD), coupons[] { coupon_code, coupon_desc }. The older coupon endpoint names the same things start_date / end_date / prod_link, and wraps the list
// as data.data: both spellings are read, so a change of endpoint does not empty the page.
//
// NOTHING IS INVENTED HERE: a row carries only what the offer says (its name, the coupon code and the coupon's own description, its end date) and the link Accesstrade
// issued for it (aff_link, the tracked deep link). An offer without such a link, with a link outside the allowed hosts, or already ended, is dropped.
// Pure: no I/O. The cron route fetches and writes.

import { DEAL_CATEGORY_SHOPPING, DEAL_CATEGORY_TRAVEL, DEAL_FALLBACK_TITLE } from '@/lib/i18n/dealsIngest'
import { OFFER_ROUTES, type OfferRouteId } from '@/lib/ccp/tracking/accesstradeOffersApi'

export type DealPartnerId = OfferRouteId

export interface DealSource {
  partnerId: DealPartnerId
  partnerName: string
  partnerType: 'ecommerce' | 'travel'
  category: string
  /** hosts a tracked link may point to (from the CCP route table: the Accesstrade deep-link host and the merchant's own) */
  linkHosts: readonly string[]
  displayOrder: number
}

export const DEAL_SOURCES: readonly DealSource[] = [
  { partnerId: 'lazada', partnerName: 'Lazada', partnerType: 'ecommerce', category: DEAL_CATEGORY_SHOPPING, linkHosts: OFFER_ROUTES.lazada.linkHosts, displayOrder: 20 },
  { partnerId: 'vexere', partnerName: 'Vexere', partnerType: 'travel', category: DEAL_CATEGORY_TRAVEL, linkHosts: OFFER_ROUTES.vexere.linkHosts, displayOrder: 21 },
]

/** At most this many deals per partner stay on the page. */
export const MAX_DEALS_PER_PARTNER = 4

export interface DealRow {
  partner_slug: string
  partner_name: string
  partner_type: string
  category: string
  title: string
  description: string | null
  official_url: string
  banner_image: string | null
  logo_image: string | null
  display_order: number
  is_active: true
  is_featured: false
  country_code: 'VN'
  start_at: string
  end_at: string
  metadata: { source: 'accesstrade'; external_id: string; promotion: { discountLabel: string | null; voucherCode: string | null } }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)

/** A tracked link is accepted only when it is https and on one of the source's hosts (or a subdomain of it). */
export function isAllowedLink(url: string | null, hosts: readonly string[]): url is string {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return hosts.some(x => h === x || h.endsWith(`.${x}`))
  } catch {
    return false
  }
}

/** "2026-12-31" or "Sat, 02 Oct 2021 23:58:00 GMT" -> the end of that day in Vietnam (UTC+7) as an ISO instant, or null. */
export function endOfOfferDay(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T23:59:59+07:00`)
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** The offers array of a response, whichever of the two documented shapes it has. */
export function offersOf(json: unknown): unknown[] {
  const d = (json as { data?: unknown } | null)?.data
  if (Array.isArray(d)) return d
  const inner = (d as { data?: unknown } | null)?.data
  return Array.isArray(inner) ? inner : []
}

interface RawCoupon { coupon_code?: unknown; coupon_desc?: unknown }

/**
 * Why an offer would be dropped, or null when it is kept. Mirrors offerToRow so the cron can log what an unexpected answer looked like (counts by reason and the shape of the first
 * offers: host names and key names only, never the key, a code or a full link).
 */
export function rejectReason(raw: unknown, src: DealSource, now: Date): 'not_object' | 'no_id' | 'no_link' | 'link_host' | 'link_not_https' | 'ended' | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return 'not_object'
  if (!str(o.id)) return 'no_id'
  const link = str(o.aff_link) ?? str(o.prod_link)
  if (!link) return 'no_link'
  if (!isAllowedLink(link, src.linkHosts)) {
    try { return new URL(link).protocol !== 'https:' ? 'link_not_https' : 'link_host' } catch { return 'link_host' }
  }
  const end = endOfOfferDay(o.end_time ?? o.end_date)
  if (end && Date.parse(end) <= now.getTime()) return 'ended'
  return null
}

/** A log-safe summary of one answer: how many offers, why they were refused, and the shape of the first three. */
export function describeAnswer(json: unknown, src: DealSource, now: Date) {
  const offers = offersOf(json)
  const reasons: Record<string, number> = {}
  for (const o of offers) { const r = rejectReason(o, src, now) ?? 'kept'; reasons[r] = (reasons[r] ?? 0) + 1 }
  const hostOf = (u: unknown) => { try { return typeof u === 'string' ? new URL(u).hostname : null } catch { return null } }
  const top = json && typeof json === 'object' ? Object.keys(json as object).slice(0, 8) : []
  return {
    topKeys: top,
    offers: offers.length,
    reasons,
    sample: offers.slice(0, 3).map(o => {
      const r = (o ?? {}) as Record<string, unknown>
      return { keys: Object.keys(r).slice(0, 20), merchant: typeof r.merchant === 'string' ? r.merchant.slice(0, 30) : null, domain: typeof r.domain === 'string' ? r.domain.slice(0, 40) : null, affHost: hostOf(r.aff_link), linkHost: hostOf(r.link ?? r.prod_link), end: r.end_time ?? r.end_date ?? null, coupons: Array.isArray(r.coupons) ? r.coupons.length : 0 }
    }),
  }
}

/** One offer -> one row, or null when it must not be shown. */
export function offerToRow(raw: unknown, src: DealSource, now: Date): DealRow | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const id = str(o.id)
  const link = str(o.aff_link) ?? str(o.prod_link)
  if (!id || !isAllowedLink(link, src.linkHosts)) return null

  const end = endOfOfferDay(o.end_time ?? o.end_date)
  // An offer that says when it ends must still be running; one that does not say is kept for a short, bounded window.
  if (end && Date.parse(end) <= now.getTime()) return null
  const endAt = end ?? new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString()

  const coupons = (Array.isArray(o.coupons) ? o.coupons : []) as RawCoupon[]
  const first = coupons.find(c => str(c?.coupon_code))
  const voucherCode = str(first?.coupon_code)
  const couponDesc = str(first?.coupon_desc)

  const name = str(o.name)
  const title = clip(name ?? couponDesc ?? DEAL_FALLBACK_TITLE[src.partnerId], 120)
  const content = str(o.content)
  const banners = Array.isArray(o.banners) ? (o.banners as Array<{ link?: unknown }>) : []
  const image = str(o.image) ?? str(banners[0]?.link) ?? null

  return {
    partner_slug: src.partnerId,
    partner_name: src.partnerName,
    partner_type: src.partnerType,
    category: src.category,
    title,
    description: content ? clip(content.replace(/\s+/g, ' '), 240) : null,
    official_url: link,
    banner_image: image && /^https:\/\//.test(image) ? image : null,
    logo_image: null,
    display_order: src.displayOrder,
    is_active: true,
    is_featured: false,
    country_code: 'VN',
    start_at: now.toISOString(),
    end_at: endAt,
    metadata: {
      source: 'accesstrade',
      external_id: id,
      promotion: { discountLabel: couponDesc ? clip(couponDesc, 80) : null, voucherCode },
    },
  }
}

/** The rows for one source: valid offers only, those with a coupon code first, then the soonest to end; capped. */
export function rowsForSource(json: unknown, src: DealSource, now: Date): DealRow[] {
  const seen = new Set<string>()
  const rows: DealRow[] = []
  for (const raw of offersOf(json)) {
    const row = offerToRow(raw, src, now)
    if (!row || seen.has(row.metadata.external_id)) continue
    seen.add(row.metadata.external_id)
    rows.push(row)
  }
  rows.sort((a, b) => {
    const ac = a.metadata.promotion.voucherCode ? 0 : 1
    const bc = b.metadata.promotion.voucherCode ? 0 : 1
    return ac - bc || Date.parse(a.end_at) - Date.parse(b.end_at)
  })
  return rows.slice(0, MAX_DEALS_PER_PARTNER)
}
