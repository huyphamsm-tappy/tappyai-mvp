import { z } from 'zod'

// official_url must ALWAYS be HTTPS (enforced here + by a DB CHECK constraint).
const httpsUrl = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .refine((u) => u.startsWith('https://'), 'URL must use https://')

const isoDateOrNull = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()

const imageUrlOrNull = httpsUrl.nullable().optional()

// partner_slug: lowercase, url-safe, the permanent internal id. Required on
// create; NOT accepted on update (immutable — also enforced by a DB trigger).
const partnerSlug = z
  .string()
  .trim()
  .min(1, 'partnerSlug required')
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'partnerSlug must be lowercase letters, digits and hyphens')

// Common partner types — SUGGESTIONS for the admin UI only, NOT a validation
// allow-list: new types must not require a code change.
export const PARTNER_TYPES = ['ecommerce', 'food', 'ride', 'travel'] as const

// partner_type: free-form string, required, lowercase, max 32. String (not enum)
// validation so future partner types work with zero code changes.
const partnerType = z.string().trim().min(1, 'partnerType required').max(32, 'partnerType too long').toLowerCase()

// Promotion display fields — stored inside metadata.promotion (NOT flat metadata),
// surfaced to clients as discountLabel / voucherCode only. Optional; empty → null.
const discountLabel = z.string().trim().max(24, 'discountLabel too long').nullable().optional()
const voucherCode = z.string().trim().max(40, 'voucherCode too long').nullable().optional()

// Create — the required fields plus optional scheduling/media/status.
export const CreateDealSchema = z.object({
  partnerSlug,
  partnerName: z.string().trim().min(1, 'partnerName required').max(120),
  partnerType,
  category: z.string().trim().min(1, 'category required').max(60),
  title: z.string().trim().min(1, 'title required').max(160),
  description: z.string().trim().max(280).nullable().optional(),
  officialUrl: httpsUrl,
  bannerImage: imageUrlOrNull,
  logoImage: imageUrlOrNull,
  discountLabel,
  voucherCode,
  displayOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  startAt: isoDateOrNull,
  endAt: isoDateOrNull,
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
})

// Update — every field optional (edit / disable / reorder / schedule all go
// through PATCH). partner_slug is OMITTED: it is immutable after creation.
// click_count is never editable (only the click endpoint bumps it). At least
// one field must be present.
export const UpdateDealSchema = CreateDealSchema.omit({ partnerSlug: true })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, 'No fields to update')

export type CreateDealInput = z.infer<typeof CreateDealSchema>
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>

// Map camelCase API input → snake_case DB columns (only defined keys).
export function toDbColumns(input: Partial<CreateDealInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.partnerSlug !== undefined) out.partner_slug = input.partnerSlug
  if (input.partnerName !== undefined) out.partner_name = input.partnerName
  if (input.partnerType !== undefined) out.partner_type = input.partnerType
  if (input.isFeatured !== undefined) out.is_featured = input.isFeatured
  if (input.category !== undefined) out.category = input.category
  if (input.title !== undefined) out.title = input.title
  if (input.description !== undefined) out.description = input.description
  if (input.officialUrl !== undefined) out.official_url = input.officialUrl
  if (input.bannerImage !== undefined) out.banner_image = input.bannerImage
  if (input.logoImage !== undefined) out.logo_image = input.logoImage
  // Promotion fields nest under metadata.promotion. Only written when a promo
  // field is present, so scheduling/reorder/toggle PATCHes never clobber it.
  // NOTE: this replaces metadata wholesale — safe today (promotion is the only
  // namespace). A future affiliate feed (V2) writing metadata must merge instead.
  if (input.discountLabel !== undefined || input.voucherCode !== undefined) {
    const promotion: Record<string, string> = {}
    if (input.discountLabel) promotion.discountLabel = input.discountLabel
    if (input.voucherCode) promotion.voucherCode = input.voucherCode
    out.metadata = { promotion }
  }
  if (input.displayOrder !== undefined) out.display_order = input.displayOrder
  if (input.isActive !== undefined) out.is_active = input.isActive
  if (input.startAt !== undefined) out.start_at = input.startAt
  if (input.endAt !== undefined) out.end_at = input.endAt
  if (input.countryCode !== undefined) out.country_code = input.countryCode
  return out
}
