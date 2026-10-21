import { mediaUrl } from '@/lib/media'
import { maskAddress, maskName, maskPhone } from './masking'
import { assertAmount, formatAmount } from './money'
import type { OptionGroupRow, ProductRow, PublicProductRow } from './repositories/products'
import type {
  MerchantOrderSummaryRow,
  OrderHistoryRow,
  TrackedOrder,
  TrackedOrderItem,
} from './repositories/orders'

// Tappy Business — what leaves the server.
//
// 🔑 EVERY RESPONSE IS BUILT BY ALLOW-LIST, never by spreading a database row.
//
// Spreading is how an internal UUID, an audit timestamp or a column added next
// quarter reaches a customer: the leak arrives with the migration that adds the
// column, not with the code that exposes it, so nothing in review looks wrong.
// Naming each field means a new column is invisible until somebody decides it
// should not be — which is the decision that ought to be explicit.
//
// `publicProductBoundary.test.ts` asserts the public shape against a row
// carrying deliberately poisoned internal fields.

/**
 * BIGINT crosses the Supabase client as a string once it could exceed a JS
 * number's exact range. Every amount is re-validated as an integer here, so a
 * value that arrived malformed fails at the boundary instead of being rendered
 * as `NaN₫` on a product page.
 */
function toAmount(value: string | number): number {
  return assertAmount(typeof value === 'string' ? Number(value) : value, 'price_amount')
}

function toOptions(groups: OptionGroupRow[]) {
  return groups.map((g) => ({
    name: g.name,
    isRequired: g.is_required,
    values: g.values,
  }))
}

/** The catalogue view a merchant sees of their own product. */
export function toMerchantProduct(row: ProductRow, options: OptionGroupRow[] = []) {
  return {
    publicId: row.public_id,
    name: row.name,
    description: row.description,
    imageAssetKey: row.image_asset_key,
    imageUrl: row.image_asset_key ? mediaUrl(row.image_asset_key) : null,
    priceAmount: toAmount(row.price_amount),
    currency: row.currency,
    isAvailable: row.is_available,
    status: row.status,
    options: toOptions(options),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/**
 * The customer-facing view.
 *
 * ⚠️ Compare this list with `toMerchantProduct`. Absent, deliberately:
 * `imageAssetKey` (storage layout is ours, not theirs), `createdAt`,
 * `updatedAt`, `deletedAt`, and every merchant field except the shop's display
 * name. The internal UUID appears in neither.
 *
 * `isOrderable` is computed here rather than left to the client, because it is
 * the answer to a question the client must not get wrong: a suspended shop or a
 * retired product must stop taking orders the moment the flag flips, and a
 * client deciding for itself would keep selling until it next reloaded.
 *
 * A retired product still resolves and still renders (P0 §11) — a link a
 * merchant posted to Facebook outlives the product, and "Sản phẩm ngừng bán" is
 * a better answer than a 404.
 */
export function toPublicProduct(
  row: PublicProductRow,
  shop: { shop_name: string; status: string } | null,
  options: OptionGroupRow[] = []
) {
  const merchantActive = shop?.status === 'ACTIVE'
  const productActive = row.status === 'ACTIVE'

  return {
    publicId: row.public_id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_asset_key ? mediaUrl(row.image_asset_key) : null,
    priceAmount: toAmount(row.price_amount),
    currency: row.currency,
    priceFormatted: formatAmount(toAmount(row.price_amount), row.currency),
    isAvailable: row.is_available,
    status: productActive ? 'ACTIVE' : 'RETIRED',
    isOrderable: productActive && merchantActive && row.is_available,
    options: toOptions(options),
    shop: shop ? { name: shop.shop_name } : null,
  }
}

// ── Order tracking (P2.2) ───────────────────────────────────────────────────

/** What the customer-facing status line says. Exactly the three locked states. */
const STATUS_COPY: Record<string, { title: string; detail: string }> = {
  PENDING: {
    title: 'Đã đặt hàng',
    detail: 'Shop đang xử lý đơn hàng.',
  },
  ACCEPTED: {
    title: 'Shop đã chấp nhận đơn hàng',
    detail: 'Vui lòng liên hệ trực tiếp với shop để xác nhận đơn hàng và các thông tin liên quan.',
  },
  REJECTED: {
    title: 'Shop không thể nhận đơn hàng này',
    detail: 'Vui lòng liên hệ trực tiếp với shop để biết thêm thông tin.',
  },
}

/**
 * The tracking response.
 *
 * 🔑 EVERY FIELD IS NAMED. Nothing is spread, and the repository has already
 * dropped the order's internal id before this function can see it — two layers,
 * because the reader of this page may be anyone the link reached.
 *
 * Absent, deliberately: the tracking token and its hash, every internal UUID,
 * the merchant's owner id, the customer's unmasked phone and address,
 * `expires_at` (a countdown a customer cannot act on), `source` and
 * `source_content_public_id` (operational attribution, not theirs), and every
 * status-history actor id.
 *
 * 🚨 THE MERCHANT'S PHONE APPEARS ONLY AFTER ACCEPTED. That is P0 §29: Tappy
 * stops managing the transaction at that point, so the customer must be able to
 * reach the shop — and before that point there is nothing to discuss, so a
 * leaked link does not become a directory of merchant phone numbers.
 */
export function toTrackingView(
  order: TrackedOrder,
  items: TrackedOrderItem[],
  shop: { shop_name: string; phone: string; status: string } | null
) {
  const status = order.status === 'ACCEPTED' || order.status === 'REJECTED' ? order.status : 'PENDING'
  const copy = STATUS_COPY[status]

  return {
    // The order's PUBLIC id, so a customer can quote a reference to the shop.
    // It is not a credential: it cannot be exchanged for the tracking token,
    // and the tracking endpoint does not accept it.
    reference: order.public_id,
    status,
    statusTitle: copy.title,
    statusDetail: copy.detail,
    placedAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
      options: Array.isArray(item.selected_options_snapshot) ? item.selected_options_snapshot : [],
      lineTotal: toAmount(item.line_total_amount),
    })),
    totalItems: order.total_items,
    totalAmount: toAmount(order.total_amount),
    currency: order.currency,
    totalFormatted: formatAmount(toAmount(order.total_amount), order.currency),
    notice: 'Tạm tính — chưa gồm phí vận chuyển. Shop sẽ xác nhận tổng tiền cuối cùng.',
    customer: {
      name: maskName(order.customer_name),
      phone: maskPhone(order.customer_phone),
      address: maskAddress(order.customer_address),
    },
    shop: shop
      ? { name: shop.shop_name, phone: status === 'ACCEPTED' ? shop.phone : null }
      : null,
  }
}

// ── Merchant order management (P3) ──────────────────────────────────────────
//
// This is an AUTHENTICATED MERCHANT surface, so unlike the public tracking view
// it may show the customer's real name, phone and address — the merchant has to
// contact them, and P0 §6 makes the merchant the party responsible for doing so.
//
// 🚨 It still is not a dump of the row. Absent, deliberately: every internal
// UUID (dropped in the repository before it reaches here), the tracking token
// and its hash — the customer's credential, not the merchant's — and
// `source_content_public_id`, which is Explore's identifier and means nothing
// to a shop.

/** One line of the merchant's inbox. Enough to triage; the detail has the rest. */
export function toMerchantOrderSummary(row: MerchantOrderSummaryRow) {
  return {
    reference: row.public_id,
    status: row.status,
    placedAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    totalItems: row.total_items,
    totalAmount: toAmount(row.total_amount),
    currency: row.currency,
    totalFormatted: formatAmount(toAmount(row.total_amount), row.currency),
    source: row.source,
  }
}

/**
 * The full order a merchant acts on.
 *
 * `history` is included because a merchant who finds an order already REJECTED
 * needs to know whether they rejected it or it expired — without that, the only
 * honest answer they could give a customer on the phone is "I don't know".
 * `actorId` is NOT included: which staff account acted is an internal identity,
 * and P3 has one merchant account per shop anyway.
 */
export function toMerchantOrderDetail(
  order: MerchantOrderSummaryRow & { customer_address: string; customer_note: string | null },
  items: TrackedOrderItem[],
  history: OrderHistoryRow[]
) {
  return {
    ...toMerchantOrderSummary(order),
    customerAddress: order.customer_address,
    customerNote: order.customer_note,
    items: items.map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
      options: Array.isArray(item.selected_options_snapshot) ? item.selected_options_snapshot : [],
      unitPrice: toAmount(item.unit_price_amount),
      lineTotal: toAmount(item.line_total_amount),
    })),
    history: history.map((h) => ({
      from: h.from_status,
      to: h.to_status,
      actor: h.actor_type,
      reason: h.reason,
      at: h.created_at,
    })),
  }
}
