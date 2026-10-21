import { z } from 'zod'
import { PUBLIC_ID_PATTERN } from './ids'

// Tappy Business — request validation.
//
// One schema module for the whole capability, following src/lib/deals/schema.ts.
// Everything here runs BEFORE any database mutation: a malformed request is
// rejected at the boundary, so the repository layer can assume shape and spend
// its attention on scope instead.
//
// Limits are chosen to be unremarkable. They exist to stop a 10 MB product name
// reaching Postgres, not to enforce merchandising policy — a merchant knows
// better than we do what their product is called.

/**
 * The locked business categories (P0 §7). This list and the CHECK constraint in
 * `20260908_tappy_business_p0.sql` are the same list written twice, and
 * `schema.test.ts` asserts they agree — a category the database rejects must
 * not pass validation and reach an INSERT.
 */
export const BUSINESS_CATEGORIES = [
  'FOOD_BEVERAGE',
  'RESTAURANT',
  'CAFE',
  'FASHION',
  'COSMETICS',
  'GROCERY',
  'ELECTRONICS',
  'HOME_LIVING',
  'HEALTH',
  'SERVICES',
  'OTHER',
] as const

/**
 * The merchant terms a merchant accepts at onboarding.
 *
 * Bumping this string is what makes an existing merchant's acceptance stale.
 * The acceptance table is append-only and keyed by (merchant_id, version), so
 * the history of who accepted what survives the bump.
 */
export const MERCHANT_TERMS_VERSION = '2026-09-08'

/** MVP is single-currency. Widening this is a deliberate, tested change. */
export const SUPPORTED_CURRENCIES = ['VND'] as const

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max))

const publicId = z.string().regex(PUBLIC_ID_PATTERN, 'not a valid public id')

// ── Merchant ────────────────────────────────────────────────────────────────

export const CreateMerchantSchema = z.object({
  businessCategory: z.enum(BUSINESS_CATEGORIES),
  shopName: trimmed(1, 120),
  address: trimmed(1, 300),
  phone: trimmed(6, 20),
  // Sent by the client so acceptance is explicit rather than implied by the
  // request having been made. The server checks it matches the version it is
  // currently serving; an old version is refused rather than silently accepted.
  acceptedTermsVersion: z.literal(MERCHANT_TERMS_VERSION),
})

export const UpdateMerchantSchema = z
  .object({
    businessCategory: z.enum(BUSINESS_CATEGORIES).optional(),
    shopName: trimmed(1, 120).optional(),
    address: trimmed(1, 300).optional(),
    phone: trimmed(6, 20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })

// 🚨 Note what is ABSENT from both: `status`, `legal_name` and
// `tax_or_identity_number`. Suspension is a moderation action gated by
// `commerce.merchants.suspend` — a merchant editing their shop name must not be
// able to lift their own suspension. The legal fields stay uncollected through
// MVP (PHASE_0 §F3): there is no encryption capability in this codebase, and
// accepting an identity number without one is the wrong order of operations.

// ── Product options ─────────────────────────────────────────────────────────
//
// Structured attributes only (P0 §12): predefined values, no price delta, no
// per-variant stock, no variant matrix. Free text is forbidden because
// "Màu: đỏ đậm nhé shop" cannot be mapped onto any commerce engine's option
// model without a human reading it.

export const MAX_OPTION_GROUPS = 5
export const MAX_OPTION_VALUES = 20

export const OptionGroupSchema = z.object({
  name: trimmed(1, 40),
  isRequired: z.boolean().default(false),
  values: z
    .array(trimmed(1, 60))
    .min(1, 'an option group needs at least one value')
    .max(MAX_OPTION_VALUES)
    // A group offering "Đỏ" twice is a merchant mistake that would reach the
    // customer as a duplicated radio button, and the database's
    // UNIQUE (option_group_id, value) would reject the second row anyway —
    // better to say so here than to surface a constraint violation.
    .refine((vals) => new Set(vals).size === vals.length, { message: 'duplicate option value' }),
})

const optionGroups = z
  .array(OptionGroupSchema)
  .max(MAX_OPTION_GROUPS)
  .refine((gs) => new Set(gs.map((g) => g.name)).size === gs.length, {
    message: 'duplicate option group name',
  })

// ── Product ─────────────────────────────────────────────────────────────────

/**
 * Price is an integer count of the currency's minor unit. VND has exponent 0,
 * so 45000 means 45,000 ₫ — see src/lib/business/money.ts. A float is rejected
 * rather than rounded: a caller that produced 45.5 has a bug, and rounding it
 * would hide the bug in a customer's total.
 */
const priceAmount = z
  .number()
  .int('price must be a whole number of đồng — money is never a float')
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const CreateProductSchema = z.object({
  name: trimmed(1, 200),
  description: trimmed(0, 2000).optional(),
  priceAmount,
  currency: z.enum(SUPPORTED_CURRENCIES).default('VND'),
  isAvailable: z.boolean().default(true),
  imageAssetKey: z.string().max(512).optional(),
  options: optionGroups.optional(),
})

export const UpdateProductSchema = z
  .object({
    name: trimmed(1, 200).optional(),
    description: trimmed(0, 2000).optional(),
    priceAmount: priceAmount.optional(),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    isAvailable: z.boolean().optional(),
    // `null` clears the image; omitting the key leaves it untouched. The two
    // are different intentions and a single `undefined` cannot express both.
    imageAssetKey: z.string().max(512).nullable().optional(),
    // Options are replaced as a SET when present. There is no per-option
    // endpoint: an option only ever exists inside a product the caller already
    // owns, so addressing one directly would create a second thing to
    // authorize for no gain.
    options: optionGroups.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })

export const ProductPublicIdSchema = publicId

export type CreateMerchantInput = z.infer<typeof CreateMerchantSchema>
export type UpdateMerchantInput = z.infer<typeof UpdateMerchantSchema>
export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type OptionGroupInput = z.infer<typeof OptionGroupSchema>

// ── Media ───────────────────────────────────────────────────────────────────

/**
 * Does this asset key belong to this merchant?
 *
 * The media layer builds every key as `{prefix}/{ownerId}/{random}.{ext}`
 * (src/lib/media/uploadPolicy.ts), and the product upload endpoint passes the
 * merchant's PUBLIC id as the owner. So ownership is legible from the key, and
 * a merchant naming another merchant's image — or pointing at `avatars/…`,
 * which is somebody's face — fails here.
 *
 * The bucket is publicly readable, so this is not a confidentiality control: a
 * shared image leaks nothing that the product page would not already show. It
 * is an integrity control, and it is the reason a product's image cannot be
 * made to display an arbitrary object from the store.
 */
export function isOwnedProductImageKey(key: string, merchantPublicId: string): boolean {
  const parts = key.split('/')
  return (
    parts.length === 3 &&
    parts[0] === 'products' &&
    parts[1] === merchantPublicId &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(parts[2])
  )
}

// ── Guest order creation (P2.1) ─────────────────────────────────────────────
//
// 🚨 NOTE WHAT THIS SCHEMA DOES NOT ACCEPT: no `merchantId`, no `price`, no
// `currency`, no `totalAmount`, no `totalItems`, no `status`. Every one of those
// is computed server-side from the product row. A client that sends them is not
// rejected — zod strips them — so a malicious body is simply ignored rather than
// being echoed back as a hint about what the server reads.

export const MAX_ORDER_QUANTITY = 99

/** One chosen option, matched against the product's own groups before use. */
export const SelectedOptionSchema = z.object({
  group: trimmed(1, 40),
  value: trimmed(1, 60),
})

export const CreateOrderSchema = z.object({
  productPublicId: publicId,
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY),
  selectedOptions: z.array(SelectedOptionSchema).max(MAX_OPTION_GROUPS).default([]),
  customer: z.object({
    name: trimmed(1, 120),
    // Lenient on shape, strict on length. A Vietnamese customer may write
    // "0901 234 567" or "+84 90 123 4567"; refusing a real number to enforce a
    // format would refuse a sale. Normalisation happens in tracking.ts.
    phone: trimmed(8, 20).refine((v) => (v.replace(/\D+/g, '').length >= 8), {
      message: 'phone must contain at least 8 digits',
    }),
    address: trimmed(1, 300),
    note: trimmed(0, 500).optional(),
  }),
  // Operational attribution (P0 §35). Two columns, not an analytics system.
  source: z.enum(['DIRECT', 'QR', 'CLIP']).default('DIRECT'),
  sourceContentPublicId: z.string().max(64).optional(),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type SelectedOptionInput = z.infer<typeof SelectedOptionSchema>

/**
 * Are the chosen options a valid selection for this product?
 *
 * Structured options mean the answer is decidable: every chosen group must be a
 * group the product declares, every chosen value must be one that group offers,
 * a group may be chosen at most once, and every required group must appear.
 * Free text would make all four unanswerable, which is why P0 §12 forbids it.
 *
 * Returns the snapshot to store, or null when the selection is invalid.
 */
export function resolveSelectedOptions(
  chosen: readonly SelectedOptionInput[],
  groups: readonly { name: string; is_required: boolean; values: string[] }[]
): { group: string; value: string }[] | null {
  const seen = new Set<string>()
  for (const pick of chosen) {
    if (seen.has(pick.group)) return null
    seen.add(pick.group)
    const group = groups.find((g) => g.name === pick.group)
    if (!group) return null
    if (!group.values.includes(pick.value)) return null
  }
  for (const group of groups) {
    if (group.is_required && !seen.has(group.name)) return null
  }
  // Stored in the product's own group order, so a snapshot reads the way the
  // page did rather than in whatever order the client happened to send.
  return groups
    .filter((g) => seen.has(g.name))
    .map((g) => ({ group: g.name, value: chosen.find((c) => c.group === g.name)!.value }))
}

// ── Merchant order management (P3) ──────────────────────────────────────────

/**
 * Keyset cursor over `(created_at, public_id)`.
 *
 * Same shape as `src/app/api/admin/users/schema.ts`, including its rule: a
 * malformed cursor is `null` and becomes a 422, NEVER a silent restart at page
 * one — a merchant paging their inbox would otherwise loop over the newest page
 * forever and never see the older orders.
 *
 * Both halves are interpolated into a PostgREST `or=` filter, whose grammar
 * gives `,` `(` `)` `"` structural meaning, so each is allow-listed before use.
 */
export function encodeOrderCursor(createdAt: string, publicId: string): string {
  return Buffer.from(`${createdAt}|${publicId}`, 'utf8').toString('base64url')
}

export function decodeOrderCursor(
  cursor: string
): { createdAt: string; publicId: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.indexOf('|')
    if (sep <= 0) return null
    const createdAt = raw.slice(0, sep)
    const publicId = raw.slice(sep + 1)
    if (!/^[0-9T:.+\-]+Z?$/.test(createdAt)) return null
    if (!PUBLIC_ID_PATTERN.test(publicId)) return null
    if (Number.isNaN(new Date(createdAt).getTime())) return null
    return { createdAt, publicId }
  } catch {
    return null
  }
}

export const MERCHANT_ORDERS_MAX_LIMIT = 50

export const MerchantOrderListQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).optional(),
  limit: z.coerce.number().int().min(1).max(MERCHANT_ORDERS_MAX_LIMIT).default(20),
  cursor: z.string().max(200).optional(),
})

/**
 * Why a merchant could not take the order.
 *
 * Bounded, and stored in `business_order_status_history.reason` — the column P0
 * already provides. It is NOT customer-visible: the tracking view exposes the
 * status and its fixed copy, never the reason, because "hết hàng" and "khách
 * hàng đáng ngờ" are not the same thing to say to a customer.
 *
 * `SPAM` earns its place: it is the one the merchant bulk-reject tooling will
 * need, and collapsing it into OTHER would lose the only signal that separates
 * abuse from ordinary business.
 */
export const REJECT_REASONS = [
  'OUT_OF_STOCK',
  'CANNOT_DELIVER',
  'CUSTOMER_UNREACHABLE',
  'SPAM',
  'OTHER',
] as const

export const RejectOrderSchema = z.object({
  reason: z.enum(REJECT_REASONS).default('OTHER'),
})

// 🚨 Note what neither transition schema accepts: `status`, `merchantId`,
// `actor`, `actorId`, any timestamp, any total, and any product or customer
// field. Accept takes NO body at all. Every one of those is derived by the
// server, and zod strips them so a hostile body is inert.

export type MerchantOrderListQuery = z.infer<typeof MerchantOrderListQuerySchema>
export type RejectOrderInput = z.infer<typeof RejectOrderSchema>
