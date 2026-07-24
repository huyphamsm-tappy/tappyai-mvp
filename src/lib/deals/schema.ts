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

// Create — the required fields plus optional scheduling/media/status.
export const CreateDealSchema = z.object({
  partnerName: z.string().trim().min(1, 'partnerName required').max(120),
  category: z.string().trim().min(1, 'category required').max(60),
  title: z.string().trim().min(1, 'title required').max(160),
  description: z.string().trim().max(280).nullable().optional(),
  officialUrl: httpsUrl,
  bannerImage: imageUrlOrNull,
  logoImage: imageUrlOrNull,
  displayOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  startAt: isoDateOrNull,
  endAt: isoDateOrNull,
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
})

// Update — every field optional (edit / disable / reorder / schedule all go
// through PATCH). At least one field must be present.
export const UpdateDealSchema = CreateDealSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  'No fields to update'
)

export type CreateDealInput = z.infer<typeof CreateDealSchema>
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>

// Map camelCase API input → snake_case DB columns (only defined keys).
export function toDbColumns(input: Partial<CreateDealInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.partnerName !== undefined) out.partner_name = input.partnerName
  if (input.category !== undefined) out.category = input.category
  if (input.title !== undefined) out.title = input.title
  if (input.description !== undefined) out.description = input.description
  if (input.officialUrl !== undefined) out.official_url = input.officialUrl
  if (input.bannerImage !== undefined) out.banner_image = input.bannerImage
  if (input.logoImage !== undefined) out.logo_image = input.logoImage
  if (input.displayOrder !== undefined) out.display_order = input.displayOrder
  if (input.isActive !== undefined) out.is_active = input.isActive
  if (input.startAt !== undefined) out.start_at = input.startAt
  if (input.endAt !== undefined) out.end_at = input.endAt
  if (input.countryCode !== undefined) out.country_code = input.countryCode
  return out
}
