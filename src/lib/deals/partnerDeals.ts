// Partner Deals data layer (Bug #14 V1). Single source of truth for both the
// public REST API (/api/deals — consumed by web, Android, iOS) and the web page.
// Deals are admin-managed rows in `partner_deals`, no longer a hardcoded pool.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Public shape returned to clients — display + public metadata only. NEVER the
// internal fields (is_active, timestamps, affiliate_code, click_count).
export interface PartnerDeal {
  id: string
  partnerSlug: string
  partnerName: string
  partnerType: string
  category: string
  title: string
  description: string | null
  officialUrl: string
  bannerImage: string | null
  logoImage: string | null
  isFeatured: boolean
}

// Full row for the admin CRUD (adds scheduling/status + read-only click_count).
// affiliate_code stays out of the app entirely for now (schema placeholder only).
export interface PartnerDealRow extends PartnerDeal {
  displayOrder: number
  isActive: boolean
  startAt: string | null
  endAt: string | null
  countryCode: string
  clickCount: number
  createdAt: string
  updatedAt: string
}

const PUBLIC_COLUMNS =
  'id, partner_slug, partner_name, partner_type, category, title, description, official_url, banner_image, logo_image, is_featured'
const ADMIN_COLUMNS =
  `${PUBLIC_COLUMNS}, display_order, is_active, start_at, end_at, country_code, click_count, created_at, updated_at`

function toPublic(row: Record<string, unknown>): PartnerDeal {
  return {
    id: row.id as string,
    partnerSlug: (row.partner_slug as string) ?? '',
    partnerName: (row.partner_name as string) ?? '',
    partnerType: (row.partner_type as string) ?? '',
    category: (row.category as string) ?? '',
    title: (row.title as string) ?? '',
    description: (row.description as string | null) ?? null,
    officialUrl: (row.official_url as string) ?? '',
    bannerImage: (row.banner_image as string | null) ?? null,
    logoImage: (row.logo_image as string | null) ?? null,
    isFeatured: (row.is_featured as boolean) ?? false,
  }
}

function toRow(row: Record<string, unknown>): PartnerDealRow {
  return {
    ...toPublic(row),
    displayOrder: (row.display_order as number) ?? 0,
    isActive: (row.is_active as boolean) ?? false,
    startAt: (row.start_at as string | null) ?? null,
    endAt: (row.end_at as string | null) ?? null,
    countryCode: (row.country_code as string) ?? 'VN',
    clickCount: (row.click_count as number) ?? 0,
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  }
}

// PUBLIC read — anon/server client, so RLS enforces active + in-date-window. We
// additionally scope by country and sort by display_order. Best-effort: returns
// [] on any error so the deals surface degrades gracefully instead of throwing.
export async function getActiveDeals(countryCode = 'VN'): Promise<PartnerDeal[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('partner_deals')
      .select(PUBLIC_COLUMNS)
      .eq('country_code', countryCode)
      .order('display_order', { ascending: true })
    if (error || !data) return []
    return data.map(toPublic)
  } catch {
    return []
  }
}

// ADMIN read — service-role client (bypasses RLS) so the manager sees ALL deals,
// including inactive, future, and expired ones.
export async function listAllDealsForAdmin(): Promise<PartnerDealRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('partner_deals')
    .select(ADMIN_COLUMNS)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toRow)
}

export { toRow as mapPartnerDealRow }
