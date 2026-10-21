import type { MerchantContext } from '../authz'
import { newPublicId } from '../ids'
import type { OptionGroupInput } from '../schema'
import { businessDb } from './client'

// Tappy Business — the product repository.
//
// 🔑 EVERY FUNCTION THAT TOUCHES A MERCHANT'S ROWS TAKES `MerchantContext`
// FIRST, and derives its filter from it. The context can only be produced by
// `resolveMerchantContext()`, which reads the Controller session and nothing
// else, so a caller cannot reach these rows without having proved who they are.
//
// Products are addressed by `public_id` from outside, never by the internal
// UUID — but a public id alone is not authorization. Every lookup carries BOTH
// `public_id` and `merchant_id`, so substituting another merchant's public id
// matches zero rows rather than someone else's product. That is the whole of
// the IDOR defence at this layer, and `products.test.ts` drives it directly.
//
// The one exception is `findPublicProduct`, the unauthenticated customer read.
// It takes no context because there is no caller identity to take, and it is
// deliberately the only function in this file that does not scope by merchant.
// What protects it instead is that it returns a narrow, explicitly listed set
// of columns — see `PublicProductRow` and the mapper in ../publicProduct.ts.

export interface ProductRow {
  public_id: string
  name: string
  description: string | null
  image_asset_key: string | null
  price_amount: string | number
  currency: string
  is_available: boolean
  status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** What a customer may see. Note the absence of every internal and audit field. */
export interface PublicProductRow {
  public_id: string
  name: string
  description: string | null
  image_asset_key: string | null
  price_amount: string | number
  currency: string
  is_available: boolean
  status: string
  merchant_id: string
}

export interface OptionGroupRow {
  name: string
  position: number
  is_required: boolean
  values: string[]
}

const PRODUCT_COLUMNS =
  'public_id, name, description, image_asset_key, price_amount, currency, is_available, status, created_at, updated_at, deleted_at'

/** The product lifecycle states a merchant's own listing shows by default. */
const LISTABLE = ['ACTIVE', 'UNPUBLISHED']

export interface CreateProductData {
  name: string
  description?: string
  priceAmount: number
  currency: string
  isAvailable: boolean
  imageAssetKey?: string | null
  options?: OptionGroupInput[]
}

export interface UpdateProductData {
  name?: string
  description?: string
  priceAmount?: number
  currency?: string
  isAvailable?: boolean
  imageAssetKey?: string | null
  options?: OptionGroupInput[]
}

/**
 * Resolve a product the caller owns to its internal id.
 *
 * Private on purpose: an internal UUID is a key to a row, and handing one out
 * would let a later refactor pass it somewhere that does not re-check the
 * merchant. Every exported function that needs one gets it through here, which
 * is scoped.
 */
async function ownedProductId(ctx: MerchantContext, publicId: string): Promise<string | null> {
  const { data, error } = await businessDb()
    .from('business_products')
    .select('id')
    .eq('public_id', publicId)
    .eq('merchant_id', ctx.merchantId)
    .maybeSingle()

  if (error) throw error
  return (data as { id: string } | null)?.id ?? null
}

/** The caller's own catalogue. Soft-deleted products are excluded. */
export async function listProducts(ctx: MerchantContext): Promise<ProductRow[]> {
  const { data, error } = await businessDb()
    .from('business_products')
    .select(PRODUCT_COLUMNS)
    .eq('merchant_id', ctx.merchantId)
    .in('status', LISTABLE)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as ProductRow[] | null) ?? []
}

/**
 * One of the caller's own products, or null.
 *
 * Null covers both "no such product" and "not yours" — the caller cannot tell
 * which, so the endpoint above returns the same 404 for both and never confirms
 * that another merchant's product exists.
 */
export async function findProduct(
  ctx: MerchantContext,
  publicId: string
): Promise<ProductRow | null> {
  const { data, error } = await businessDb()
    .from('business_products')
    .select(PRODUCT_COLUMNS)
    .eq('public_id', publicId)
    .eq('merchant_id', ctx.merchantId)
    .maybeSingle()

  if (error) throw error
  return (data as ProductRow | null) ?? null
}

export async function createProduct(
  ctx: MerchantContext,
  input: CreateProductData
): Promise<ProductRow> {
  const { data, error } = await businessDb()
    .from('business_products')
    .insert({
      public_id: newPublicId(),
      // From the context, never from the request. This single line is why a
      // client cannot create a product inside somebody else's shop.
      merchant_id: ctx.merchantId,
      name: input.name,
      description: input.description ?? null,
      image_asset_key: input.imageAssetKey ?? null,
      price_amount: input.priceAmount,
      currency: input.currency,
      is_available: input.isAvailable,
    })
    .select(PRODUCT_COLUMNS)
    .single()

  if (error) throw error
  const product = data as ProductRow

  if (input.options?.length) {
    await replaceOptions(ctx, product.public_id, input.options)
  }
  return product
}

/**
 * Update one of the caller's own products.
 *
 * Returns null when the product is not theirs, so the caller cannot distinguish
 * "does not exist" from "belongs to someone else".
 *
 * `merchant_id`, `public_id` and `status` are not patchable: ownership cannot
 * be transferred by an edit, the external identifier is stable for the life of
 * the row (P0 §11), and deletion goes through `softDeleteProduct` so the
 * tombstone's timestamp is always written with it.
 */
export async function updateProduct(
  ctx: MerchantContext,
  publicId: string,
  patch: UpdateProductData
): Promise<ProductRow | null> {
  const columns: Record<string, unknown> = {}
  if (patch.name !== undefined) columns.name = patch.name
  if (patch.description !== undefined) columns.description = patch.description
  if (patch.priceAmount !== undefined) columns.price_amount = patch.priceAmount
  if (patch.currency !== undefined) columns.currency = patch.currency
  if (patch.isAvailable !== undefined) columns.is_available = patch.isAvailable
  if (patch.imageAssetKey !== undefined) columns.image_asset_key = patch.imageAssetKey

  let product: ProductRow | null
  if (Object.keys(columns).length === 0) {
    product = await findProduct(ctx, publicId)
  } else {
    const { data, error } = await businessDb()
      .from('business_products')
      .update(columns)
      .eq('public_id', publicId)
      .eq('merchant_id', ctx.merchantId)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()

    if (error) throw error
    product = (data as ProductRow | null) ?? null
  }

  if (!product) return null
  if (patch.options !== undefined) await replaceOptions(ctx, publicId, patch.options)
  return product
}

/**
 * Retire a product without removing it (P0 §9, §11).
 *
 * `service_role` holds no DELETE on this table, so a hard delete is not
 * available even by mistake. Public URLs shared to Facebook and Zalo outlive
 * the product, and historical order items reference it; a 404 on a link a
 * merchant posted is a worse answer than "Sản phẩm ngừng bán".
 *
 * The status and the timestamp are written together because the schema's
 * `business_products_deletion_consistent` CHECK requires it.
 */
export async function softDeleteProduct(
  ctx: MerchantContext,
  publicId: string
): Promise<ProductRow | null> {
  const { data, error } = await businessDb()
    .from('business_products')
    .update({ status: 'DELETED', deleted_at: new Date().toISOString(), is_available: false })
    .eq('public_id', publicId)
    .eq('merchant_id', ctx.merchantId)
    .select(PRODUCT_COLUMNS)
    .maybeSingle()

  if (error) throw error
  return (data as ProductRow | null) ?? null
}

// ── Options ─────────────────────────────────────────────────────────────────
//
// Options are edited as a SET, never individually. An option only ever exists
// inside a product, and a product is already authorized, so addressing a single
// option through its own id would create a second thing to authorize for no
// gain — and a second place for the check to be forgotten.
//
// The write path is delete-then-insert against a product the caller was proved
// to own. `business_product_option_values` cascades from its group, so removing
// the groups removes their values and no orphan can survive an edit.

export async function listOptions(
  ctx: MerchantContext,
  publicId: string
): Promise<OptionGroupRow[]> {
  const productId = await ownedProductId(ctx, publicId)
  if (!productId) return []
  return optionsForProductId(productId)
}

export async function replaceOptions(
  ctx: MerchantContext,
  publicId: string,
  groups: OptionGroupInput[]
): Promise<OptionGroupRow[]> {
  const productId = await ownedProductId(ctx, publicId)
  // Not the caller's product: change nothing and report nothing. The caller
  // already sees a 404 from the surrounding read.
  if (!productId) return []

  const db = businessDb()
  const { error: clearError } = await db
    .from('business_product_option_groups')
    .delete()
    .eq('product_id', productId)
  if (clearError) throw clearError

  for (const [index, group] of groups.entries()) {
    const { data, error } = await db
      .from('business_product_option_groups')
      .insert({
        product_id: productId,
        name: group.name,
        position: index,
        is_required: group.isRequired,
      })
      .select('id')
      .single()
    if (error) throw error

    const groupId = (data as { id: string }).id
    const { error: valueError } = await db.from('business_product_option_values').insert(
      group.values.map((value, position) => ({
        option_group_id: groupId,
        value,
        position,
      }))
    )
    if (valueError) throw valueError
  }

  return optionsForProductId(productId)
}

/**
 * Groups and their values for a product id that the caller has ALREADY been
 * proved to own. Private for that reason: it applies no scope of its own.
 */
async function optionsForProductId(productId: string): Promise<OptionGroupRow[]> {
  const db = businessDb()
  const { data: groups, error } = await db
    .from('business_product_option_groups')
    .select('id, name, position, is_required')
    .eq('product_id', productId)
    .order('position', { ascending: true })

  if (error) throw error
  const rows = (groups as { id: string; name: string; position: number; is_required: boolean }[] | null) ?? []
  if (rows.length === 0) return []

  const { data: values, error: valueError } = await db
    .from('business_product_option_values')
    .select('option_group_id, value, position')
    .in('option_group_id', rows.map((g) => g.id))
    .order('position', { ascending: true })

  if (valueError) throw valueError
  const valueRows = (values as { option_group_id: string; value: string; position: number }[] | null) ?? []

  return rows.map((g) => ({
    name: g.name,
    position: g.position,
    is_required: g.is_required,
    values: valueRows.filter((v) => v.option_group_id === g.id).map((v) => v.value),
  }))
}

// ── The public read ─────────────────────────────────────────────────────────

/**
 * A product by public id, for an unauthenticated customer.
 *
 * ⚠️ THE ONLY UNSCOPED FUNCTION IN THIS FILE. There is no caller identity to
 * scope by — that is what "public" means. Two things stand in for the missing
 * filter:
 *
 *   1. The column list is narrow and explicit. No internal UUID, no audit
 *      field, no merchant private data, no terms record.
 *   2. `merchant_id` is returned so the caller can resolve the shop's public
 *      name, and is stripped by the mapper in ../publicProduct.ts before
 *      anything reaches the network.
 *
 * A soft-deleted or unpublished product still RESOLVES: P0 §11 requires the
 * tombstone rather than a 404, because a link a merchant posted to Facebook
 * outlives the product. The caller decides what to render from `status`.
 */
export async function findPublicProduct(publicId: string): Promise<PublicProductRow | null> {
  const { data, error } = await businessDb()
    .from('business_products')
    .select(
      'public_id, name, description, image_asset_key, price_amount, currency, is_available, status, merchant_id'
    )
    .eq('public_id', publicId)
    .maybeSingle()

  if (error) throw error
  return (data as PublicProductRow | null) ?? null
}

/** The shop identity a customer may see beside a product. Name only. */
export async function findPublicMerchant(
  merchantId: string
): Promise<{ shop_name: string; status: string } | null> {
  const { data, error } = await businessDb()
    .from('business_merchants')
    .select('shop_name, status')
    .eq('id', merchantId)
    .maybeSingle()

  if (error) throw error
  return (data as { shop_name: string; status: string } | null) ?? null
}

/** Options for the public page. Read by product id resolved from a public id. */
export async function findPublicOptions(publicId: string): Promise<OptionGroupRow[]> {
  const { data, error } = await businessDb()
    .from('business_products')
    .select('id')
    .eq('public_id', publicId)
    .maybeSingle()

  if (error) throw error
  const id = (data as { id: string } | null)?.id
  return id ? optionsForProductId(id) : []
}
