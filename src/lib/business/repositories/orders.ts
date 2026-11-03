import type { MerchantContext } from '../authz'
import { businessDb } from './client'

// Tappy Business — the order repository.
//
// ============================================================================
// 🔑 THE ONE PLACE MERCHANT OWNERSHIP IS DERIVED RATHER THAN AUTHENTICATED
// ============================================================================
// Guest order creation has no session, so there is no MerchantContext to take
// as a first argument. That is the deliberate exception, and it is the reason
// this file needs reading carefully.
//
// The exception is narrow: ownership is resolved FROM THE PRODUCT ROW, never
// from the request.
//
//     product public_id (from the URL the customer opened)
//         → business_products row
//             → merchant_id
//                 → the order is created under that merchant
//
// A `merchant_id` sent by a client is not read anywhere in this file, and could
// not help if it were: `business_order_items` carries composite foreign keys
// into (order_id, merchant_id) and (product_id, merchant_id), so an order whose
// item names a different merchant than its product cannot be written at all.
// That is structural, not conventional.

/** Everything order creation needs to decide whether a product can be ordered. */
export interface OrderableProduct {
  productId: string
  productPublicId: string
  merchantId: string
  merchantPublicId: string
  merchantStatus: string
  merchantOwnerUserId: string
  shopName: string
  name: string
  priceAmount: string | number
  currency: string
  isAvailable: boolean
  status: string
}

/**
 * Resolve a product for ordering, together with the merchant that owns it.
 *
 * Two reads rather than a PostgREST embed: the join is one hop, the shapes stay
 * obvious, and nothing here depends on the relationship name PostgREST happens
 * to infer. Returns null when the product does not exist — the caller answers
 * 404 without saying which of the two was missing.
 */
export async function findOrderableProduct(publicId: string): Promise<OrderableProduct | null> {
  const db = businessDb()

  const { data: product, error } = await db
    .from('business_products')
    .select('id, public_id, merchant_id, name, price_amount, currency, is_available, status')
    .eq('public_id', publicId)
    .maybeSingle()

  if (error) throw error
  if (!product) return null

  const row = product as {
    id: string
    public_id: string
    merchant_id: string
    name: string
    price_amount: string | number
    currency: string
    is_available: boolean
    status: string
  }

  const { data: merchant, error: merchantError } = await db
    .from('business_merchants')
    .select('id, public_id, status, controller_user_id, shop_name')
    .eq('id', row.merchant_id)
    .maybeSingle()

  if (merchantError) throw merchantError
  if (!merchant) return null

  const m = merchant as {
    id: string
    public_id: string
    status: string
    controller_user_id: string
    shop_name: string
  }

  return {
    productId: row.id,
    productPublicId: row.public_id,
    merchantId: m.id,
    merchantPublicId: m.public_id,
    merchantStatus: m.status,
    merchantOwnerUserId: m.controller_user_id,
    shopName: m.shop_name,
    name: row.name,
    priceAmount: row.price_amount,
    currency: row.currency,
    isAvailable: row.is_available,
    status: row.status,
  }
}

export interface CreateOrderArgs {
  orderPublicId: string
  merchantId: string
  trackingTokenHash: Buffer
  customerName: string
  customerPhone: string
  customerAddress: string
  customerNote: string | null
  source: string
  sourceContentPublicId: string | null
  expiresAt: string
  productId: string
  productPublicId: string
  productNameSnapshot: string
  unitPriceAmount: number
  quantity: number
  selectedOptionsSnapshot: unknown
}

export interface CreatedOrder {
  order_public_id: string
  status: string
  total_amount: string | number
  total_items: number
  created_at: string
  expires_at: string
}

/**
 * Write the order, its item and its opening history row as ONE transaction.
 *
 * Supabase's REST interface has no transaction across statements, so this goes
 * through `fn_business_create_order`. Three separate inserts could leave an
 * order with no item after a crash — wrong totals, no product, and nothing that
 * could repair it because the customer has already closed the page.
 *
 * Every authoritative value passed here was computed by the caller from the
 * PRODUCT ROW, not from the request: unit price, product name, merchant. The
 * function derives the line total and the order totals from them, and a deferred
 * constraint trigger re-checks the totals against the items at COMMIT.
 */
export async function createOrder(args: CreateOrderArgs): Promise<CreatedOrder> {
  const { data, error } = await businessDb().rpc('fn_business_create_order', {
    p_order_public_id: args.orderPublicId,
    p_merchant_id: args.merchantId,
    // PostgREST takes bytea as a hex-escape string.
    p_tracking_token_hash: `\\x${args.trackingTokenHash.toString('hex')}`,
    p_customer_name: args.customerName,
    p_customer_phone: args.customerPhone,
    p_customer_address: args.customerAddress,
    p_customer_note: args.customerNote,
    p_source: args.source,
    p_source_content_public_id: args.sourceContentPublicId,
    p_expires_at: args.expiresAt,
    p_product_id: args.productId,
    p_product_public_id: args.productPublicId,
    p_product_name_snapshot: args.productNameSnapshot,
    p_unit_price_amount: args.unitPriceAmount,
    p_quantity: args.quantity,
    p_selected_options_snapshot: args.selectedOptionsSnapshot,
  })

  if (error) throw error
  const rows = (data as CreatedOrder[] | null) ?? []
  if (rows.length === 0) throw new Error('order creation returned no row')
  return rows[0]
}

/**
 * Close PENDING orders whose 72 hours have run out.
 *
 * The whole transition — the status change and its history row — happens inside
 * `fn_business_expire_orders`, because only the database can make a conditional
 * update and its audit entry atomic. A merchant accepting at the same instant
 * wins or loses cleanly; neither ends up half-applied.
 *
 * Returns how many orders were closed, so the cron route can report it.
 */
export async function expireStaleOrders(limit = 500): Promise<number> {
  const { data, error } = await businessDb().rpc('fn_business_expire_orders', { p_limit: limit })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

// ── Tracking (P2.2) ─────────────────────────────────────────────────────────

/** The order as a tracking page needs it. No internal id appears in this shape. */
export interface TrackedOrder {
  public_id: string
  status: string
  created_at: string
  updated_at: string
  customer_name: string
  customer_phone: string
  customer_address: string
  total_amount: string | number
  total_items: number
  currency: string
  merchant_id: string
}

export interface TrackedOrderItem {
  product_name_snapshot: string
  quantity: number
  unit_price_amount: string | number
  line_total_amount: string | number
  currency: string
  selected_options_snapshot: unknown
}

/**
 * Resolve an order from the SHA-256 of its tracking token.
 *
 * 🔑 THE HASH IS THE ONLY WAY IN. There is no lookup by `public_id`, by phone,
 * by merchant, or by anything else — this function takes one argument and it is
 * the digest. P0 §16 forbids enumeration by phone and §21 makes the token the
 * whole access model, so adding a second parameter here would be adding a
 * second authorization mechanism.
 *
 * The digest is compared by the database's own index on
 * `business_orders.tracking_token_hash`, which is UNIQUE. A wrong token matches
 * zero rows; there is no partial match to observe, and the caller cannot tell a
 * miss from a non-existent order because both return null.
 *
 * The raw token never reaches this layer as anything but its digest, and never
 * reaches PostgreSQL at all.
 */
export async function findOrderByTrackingHash(
  tokenHash: Buffer
): Promise<{ order: TrackedOrder; items: TrackedOrderItem[] } | null> {
  const db = businessDb()

  const { data, error } = await db
    .from('business_orders')
    .select(
      'id, public_id, status, created_at, updated_at, customer_name, customer_phone, customer_address, total_amount, total_items, currency, merchant_id'
    )
    // PostgREST takes bytea as a hex escape, the same shape `createOrder` sends.
    .eq('tracking_token_hash', `\\x${tokenHash.toString('hex')}`)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as TrackedOrder & { id: string }

  const { data: items, error: itemError } = await db
    .from('business_order_items')
    .select(
      'product_name_snapshot, quantity, unit_price_amount, line_total_amount, currency, selected_options_snapshot'
    )
    .eq('order_id', row.id)
    .order('created_at', { ascending: true })

  if (itemError) throw itemError

  // `id` is dropped here rather than in the view: an internal UUID that never
  // leaves the repository cannot be leaked by a later change to the mapper.
  const { id: _internalId, ...order } = row
  void _internalId
  return { order, items: (items as TrackedOrderItem[] | null) ?? [] }
}

/** The shop identity a tracking page may show. Display name and phone only. */
export async function findTrackedMerchant(
  merchantId: string
): Promise<{ shop_name: string; phone: string; status: string } | null> {
  const { data, error } = await businessDb()
    .from('business_merchants')
    .select('shop_name, phone, status')
    .eq('id', merchantId)
    .maybeSingle()

  if (error) throw error
  return (data as { shop_name: string; phone: string; status: string } | null) ?? null
}

// ── Merchant order management (P3) ──────────────────────────────────────────
//
// 🔑 Everything below takes `MerchantContext` FIRST and derives `merchant_id`
// from it. A merchant's own orders carry their customers' real names, phone
// numbers and delivery addresses, so this is the surface where a missing filter
// costs the most — and the tables grant to `service_role` with RLS carrying no
// policies, so PostgreSQL will not catch it for us.

export interface MerchantOrderSummaryRow {
  public_id: string
  status: string
  created_at: string
  updated_at: string
  expires_at: string
  customer_name: string
  customer_phone: string
  total_amount: string | number
  total_items: number
  currency: string
  source: string
}

export interface OrderHistoryRow {
  from_status: string | null
  to_status: string
  actor_type: string
  reason: string
  created_at: string
}

const SUMMARY_COLUMNS =
  'public_id, status, created_at, updated_at, expires_at, customer_name, customer_phone, total_amount, total_items, currency, source'

/** Newest first. `public_id` breaks a tie so a page boundary is deterministic. */
export interface ListMerchantOrdersOptions {
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  limit: number
  cursor?: { createdAt: string; publicId: string } | null
}

/**
 * The merchant's own inbox.
 *
 * Keyset pagination, following `src/app/api/admin/users/schema.ts`: two orders
 * created in the same millisecond would make an offset page skip or repeat a
 * row, and an order a merchant never sees is a sale they never make.
 *
 * ⚠️ NOTE WHAT IS NOT SELECTED: `tracking_token_hash`. A merchant has no use
 * for it and it is the customer's credential, not theirs — leaving it out of
 * the query means it cannot be leaked by a later change to the view.
 */
export async function listMerchantOrders(
  ctx: MerchantContext,
  opts: ListMerchantOrdersOptions
): Promise<MerchantOrderSummaryRow[]> {
  let query = businessDb()
    .from('business_orders')
    .select(SUMMARY_COLUMNS)
    .eq('merchant_id', ctx.merchantId)

  if (opts.status) query = query.eq('status', opts.status)
  if (opts.cursor) {
    // Strictly after the cursor in the same (created_at DESC, public_id DESC)
    // order the query below imposes.
    query = query.or(
      `created_at.lt.${opts.cursor.createdAt},and(created_at.eq.${opts.cursor.createdAt},public_id.lt.${opts.cursor.publicId})`
    )
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('public_id', { ascending: false })
    .limit(opts.limit)

  if (error) throw error
  return (data as MerchantOrderSummaryRow[] | null) ?? []
}

/**
 * One of the merchant's own orders, with its items and its history.
 *
 * Returns null when the order is not theirs, so the route answers the same 404
 * it gives for an order that does not exist — knowing another merchant's public
 * id must not confirm that their order is real.
 */
export async function findMerchantOrder(
  ctx: MerchantContext,
  publicId: string
): Promise<{
  order: MerchantOrderSummaryRow & { customer_address: string; customer_note: string | null }
  items: TrackedOrderItem[]
  history: OrderHistoryRow[]
} | null> {
  const db = businessDb()

  const { data, error } = await db
    .from('business_orders')
    .select(`id, ${SUMMARY_COLUMNS}, customer_address, customer_note`)
    .eq('public_id', publicId)
    .eq('merchant_id', ctx.merchantId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as MerchantOrderSummaryRow & {
    id: string
    customer_address: string
    customer_note: string | null
  }

  const [{ data: items, error: itemError }, { data: history, error: historyError }] =
    await Promise.all([
      db
        .from('business_order_items')
        .select(
          'product_name_snapshot, quantity, unit_price_amount, line_total_amount, currency, selected_options_snapshot'
        )
        .eq('order_id', row.id)
        .order('created_at', { ascending: true }),
      db
        .from('business_order_status_history')
        .select('from_status, to_status, actor_type, reason, created_at')
        .eq('order_id', row.id)
        .order('created_at', { ascending: true }),
    ])

  if (itemError) throw itemError
  if (historyError) throw historyError

  // The internal id is dropped here rather than in the view, so a value that
  // never leaves the repository cannot be leaked by a later mapper change.
  const { id: _internalId, ...order } = row
  void _internalId

  return {
    order,
    items: (items as TrackedOrderItem[] | null) ?? [],
    history: (history as OrderHistoryRow[] | null) ?? [],
  }
}

export type TransitionOutcome =
  /** The order is not this merchant's, or does not exist. Same answer for both. */
  | { readonly kind: 'not_found' }
  /** It transitioned. Exactly one history row was written. */
  | { readonly kind: 'transitioned'; readonly status: string; readonly updatedAt: string }
  /** Already terminal. Nothing was written — not even a history row. */
  | { readonly kind: 'already_terminal'; readonly status: string; readonly updatedAt: string }

/**
 * PENDING → ACCEPTED or PENDING → REJECTED, for one of the merchant's own orders.
 *
 * The status change and its history row happen inside
 * `fn_business_transition_order`, under a row lock. Two concurrent accepts, or
 * an accept racing a reject, serialise on the row: exactly one transitions and
 * the other reads the terminal state the first wrote.
 *
 * 🚨 The actor is `ctx.controllerUserId` — the authenticated Controller
 * identity. Nothing from the request body reaches the history row's actor.
 */
export async function transitionOrder(
  ctx: MerchantContext,
  publicId: string,
  toStatus: 'ACCEPTED' | 'REJECTED',
  reason: string
): Promise<TransitionOutcome> {
  const { data, error } = await businessDb().rpc('fn_business_transition_order', {
    p_merchant_id: ctx.merchantId,
    p_order_public_id: publicId,
    p_to_status: toStatus,
    p_actor_id: ctx.controllerUserId,
    p_reason: reason,
  })

  if (error) throw error
  const rows = (data as { transitioned: boolean; status: string; updated_at: string }[] | null) ?? []
  if (rows.length === 0) return { kind: 'not_found' }

  const row = rows[0]
  return row.transitioned
    ? { kind: 'transitioned', status: row.status, updatedAt: row.updated_at }
    : { kind: 'already_terminal', status: row.status, updatedAt: row.updated_at }
}
