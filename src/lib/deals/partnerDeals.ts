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
  // `category` is the LOCALIZED display label (resolved for the requested locale).
  // `categoryKey` is the language-independent styling key (always the vi base
  // label) so clients keep a stable category→colour map regardless of language.
  category: string
  categoryKey: string
  title: string
  description: string | null
  officialUrl: string
  bannerImage: string | null
  logoImage: string | null
  isFeatured: boolean
  // Promotion display fields — extracted from metadata.promotion. Raw metadata is
  // NEVER exposed; only these whitelisted display fields (+ endAt for countdown).
  discountLabel: string | null
  voucherCode: string | null
  endAt: string | null
}

// Full row for the admin CRUD (adds scheduling/status + read-only click_count).
// affiliate_code stays out of the app entirely for now (schema placeholder only).
export interface PartnerDealRow extends PartnerDeal {
  displayOrder: number
  isActive: boolean
  startAt: string | null
  countryCode: string
  clickCount: number
  createdAt: string
  updatedAt: string
}

// metadata is SELECTed (to read metadata.promotion) but never returned raw.
const PUBLIC_COLUMNS =
  'id, partner_slug, partner_name, partner_type, category, title, description, official_url, banner_image, logo_image, is_featured, metadata, end_at'
const ADMIN_COLUMNS =
  `${PUBLIC_COLUMNS}, display_order, is_active, start_at, country_code, click_count, created_at, updated_at`

// Pull the two whitelisted promo fields out of metadata.promotion. Anything else
// in metadata (reserved/future namespaces) stays internal.
function readPromotion(metadata: unknown): { discountLabel: string | null; voucherCode: string | null } {
  const promo = (metadata as { promotion?: unknown } | null)?.promotion as
    | { discountLabel?: unknown; voucherCode?: unknown }
    | undefined
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return { discountLabel: str(promo?.discountLabel), voucherCode: str(promo?.voucherCode) }
}

function toPublic(row: Record<string, unknown>): PartnerDeal {
  const { discountLabel, voucherCode } = readPromotion(row.metadata)
  const baseCategory = (row.category as string) ?? ''
  return {
    id: row.id as string,
    partnerSlug: (row.partner_slug as string) ?? '',
    partnerName: (row.partner_name as string) ?? '',
    partnerType: (row.partner_type as string) ?? '',
    // Base (vi) values by default; getActiveDeals overlays a locale on top. The
    // styling key is always the vi base category and never changes with language.
    category: baseCategory,
    categoryKey: baseCategory,
    title: (row.title as string) ?? '',
    description: (row.description as string | null) ?? null,
    officialUrl: (row.official_url as string) ?? '',
    bannerImage: (row.banner_image as string | null) ?? null,
    logoImage: (row.logo_image as string | null) ?? null,
    isFeatured: (row.is_featured as boolean) ?? false,
    discountLabel,
    voucherCode,
    endAt: (row.end_at as string | null) ?? null,
  }
}

function toRow(row: Record<string, unknown>): PartnerDealRow {
  return {
    ...toPublic(row),
    displayOrder: (row.display_order as number) ?? 0,
    isActive: (row.is_active as boolean) ?? false,
    startAt: (row.start_at as string | null) ?? null,
    countryCode: (row.country_code as string) ?? 'VN',
    clickCount: (row.click_count as number) ?? 0,
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  }
}

// Supported UI locales. 'vi' is the base (source of truth) — never needs a
// lookup. Anything else resolves against partner_deal_translations with a
// field-by-field fall back to the vi base. Unknown locales collapse to 'vi'.
const BASE_LOCALE = 'vi'
function normalizeLocale(locale?: string | null): string {
  const l = (locale ?? '').trim().toLowerCase()
  if (!l || l.startsWith('vi')) return BASE_LOCALE
  // Keep a region tag if present ('en-us' → 'en-US') so exact rows can match;
  // the resolver also tries the language-only form.
  const [lang, region] = l.split('-')
  return region ? `${lang}-${region.toUpperCase()}` : lang
}

// PUBLIC read — anon/server client, so RLS enforces active + in-date-window. We
// additionally scope by country and sort by display_order. When a non-vi locale
// is requested, overlay partner_deal_translations (field-by-field, vi fallback).
// Best-effort: returns [] on any error, and silently keeps vi text if the
// translation lookup fails, so the deals surface degrades gracefully.
export async function getActiveDeals(countryCode = 'VN', locale?: string | null): Promise<PartnerDeal[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('partner_deals')
      .select(PUBLIC_COLUMNS)
      .eq('country_code', countryCode)
      .order('display_order', { ascending: true })
    if (error || !data) return []
    const deals = data.map(toPublic)

    const wantLocale = normalizeLocale(locale)
    if (wantLocale === BASE_LOCALE || deals.length === 0) return deals

    // Try the exact locale first, then the language-only form ('en-US' → 'en').
    // Both are non-vi so the vi base is never queried here.
    const langOnly = wantLocale.split('-')[0]
    const candidates = langOnly === wantLocale ? [wantLocale] : [wantLocale, langOnly]

    const { data: trData } = await supabase
      .from('partner_deal_translations')
      .select('deal_id, locale, category, title, description')
      .in('deal_id', deals.map((d) => d.id))
      .in('locale', candidates)

    if (!trData || trData.length === 0) return deals

    // Prefer the exact-locale row over the language-only row per deal.
    const byDeal = new Map<string, Record<string, unknown>>()
    for (const pref of candidates) {
      for (const tr of trData as Record<string, unknown>[]) {
        if (tr.locale === pref && !byDeal.has(tr.deal_id as string)) {
          byDeal.set(tr.deal_id as string, tr)
        }
      }
    }

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
    return deals.map((d) => {
      const tr = byDeal.get(d.id)
      if (!tr) return d
      // Field-by-field overlay; a null/blank translated field keeps the vi base.
      // categoryKey stays the vi base label (stable styling key).
      return {
        ...d,
        category: str(tr.category) ?? d.category,
        title: str(tr.title) ?? d.title,
        description: str(tr.description) ?? d.description,
      }
    })
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
