import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError, logBusinessEvent } from '@/lib/business/logging'
import { clientIp } from '@/lib/security/rateLimit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { verifyTurnstile } from '@/lib/security/turnstile'
import { emitNotification } from '@/lib/notifications/emit'
import { CreateOrderSchema, resolveSelectedOptions } from '@/lib/business/schema'
import { assertAmount, formatAmount, lineTotal } from '@/lib/business/money'
import { newPublicId } from '@/lib/business/ids'
import { businessSecretConfigured } from '@/lib/business/secrets'
import { hashTrackingToken, newTrackingToken, phoneRateLimitKey, trackingUrl } from '@/lib/business/tracking'
import { lookup, remember, requestFingerprint } from '@/lib/business/idempotency'
import { createOrder, findOrderableProduct } from '@/lib/business/repositories/orders'
import { findPublicOptions } from '@/lib/business/repositories/products'

// POST /api/public/business/orders — a guest places an order.
//
// ============================================================================
// AUTH / AUTHORIZATION
// ============================================================================
// None, by design: the customer has no Tappy account and is not asked for one.
// This is therefore a PUBLIC WRITE ENDPOINT THAT STORES PII, and every control
// below exists because of that sentence.
//
// 🔑 Merchant ownership is derived from the PRODUCT the customer opened, never
// from the request. There is no `merchantId` in the schema, and the composite
// foreign keys on `business_order_items` would reject a mismatch even if there
// were.
//
// ============================================================================
// WHAT THE SERVER COMPUTES, AND THE CLIENT CANNOT INFLUENCE
// ============================================================================
//   unit price      read from the product row
//   product name    snapshotted from the product row
//   currency        VND, from the product row and re-asserted by the schema
//   line total      unit price × quantity, integer arithmetic
//   total_amount    computed in fn_business_create_order and re-checked at COMMIT
//   total_items     same
//   status          always PENDING
//   merchant        resolved from the product
//   expires_at      created_at + 72h
//   tracking token  256 bits of CSPRNG
//
// The request body carries none of them. A client that sends `price` or
// `totalAmount` has them stripped by zod and ignored.
//
// ORDER OF CONTROLS: secret → idempotency key → body → IP limit → Turnstile →
// product and phone limits → idempotency lookup → product resolution → write.
// Cheap rejections come first so a flood is refused before it costs a database
// round-trip.
//
// ERRORS 400 bad_request · 404 product_not_found · 409 product_unavailable ·
//        422 validation_error / idempotency_conflict · 429 rate_limited ·
//        503 service_unavailable · 500 server_error

const EXPIRY_HOURS = 72

/** The line a customer reads beside the total. Tappy never states a final price. */
const TOTAL_NOTICE = 'Tạm tính — chưa gồm phí vận chuyển. Shop sẽ xác nhận tổng tiền cuối cùng.'

export async function POST(req: Request) {
  try {
    // The phone rate-limit key and the idempotency record are both keyed from
    // this secret. Without it neither control works, and running the endpoint
    // without them would mean an unlimited public write that can duplicate
    // orders — so it fails closed rather than degrading.
    if (!businessSecretConfigured()) {
      // The variable NAME, never its value — and there is no value to log
      // here anyway, because the branch is taken when it is absent.
      logBusinessEvent('orders.misconfigured', { outcome: 'business_secret_missing' })
      return apiError(req, 'service_unavailable', 'server.error', 503)
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return apiError(req, 'bad_request', 'validation.badBody', 400)
    }

    const parsed = CreateOrderSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)
    const input = parsed.data

    const ip = clientIp(req)
    const turnstile = await verifyTurnstile(req.headers.get('x-turnstile-token'), ip)
    if (turnstile.outcome === 'failed') {
      // Cloudflare actively rejected the token: a positive signal of automation,
      // unlike a missing token or an unreachable verifier.
      return apiError(req, 'rate_limited', 'rate.retryShortly', 429)
    }
    // `degraded` means the challenge could not be evaluated — an in-app browser,
    // or Cloudflare being slow. The order still proceeds, under tighter limits.
    const strict = turnstile.outcome === 'degraded'

    const limits = await Promise.all([
      distributedRateLimit(`tb:order:ip:${ip}`, strict ? 5 : 20, 60_000),
      distributedRateLimit(`tb:order:product:${input.productPublicId}`, strict ? 30 : 60, 60_000),
      // 🔑 Keyed HMAC, not the phone number. §16 forbids any mechanism that
      // enumerates orders by phone, and this counts without ever reading
      // `business_orders.customer_phone` — which carries no index either.
      distributedRateLimit(`tb:order:phone:${phoneRateLimitKey(input.customer.phone)}`, strict ? 3 : 5, 600_000),
    ])
    const blocked = limits.find((l) => !l.ok)
    if (blocked) {
      return apiError(req, 'rate_limited', 'rate.retryShortly', 429)
    }

    const fingerprint = requestFingerprint({
      productPublicId: input.productPublicId,
      quantity: input.quantity,
      selectedOptions: input.selectedOptions,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerAddress: input.customer.address,
      customerNote: input.customer.note ?? null,
    })

    const existing = await lookup(idempotencyKey, fingerprint)
    if (existing.state === 'unavailable') {
      // Proceeding here would mean a public write with no duplicate protection.
      return apiError(req, 'service_unavailable', 'server.error', 503)
    }
    if (existing.state === 'conflict') {
      // Same key, different request. Honouring it would return an order the
      // caller did not ask for.
      return apiError(req, 'idempotency_conflict', 'validation.invalid', 422)
    }
    if (existing.state === 'replay') {
      return NextResponse.json(orderResponse(existing.result), { status: 200 })
    }

    const product = await findOrderableProduct(input.productPublicId)
    if (!product) return apiError(req, 'not_found', 'business.productNotFound', 404)

    // A retired product, an unpublished one, a paused one, or a suspended shop.
    // The customer is told the product cannot be ordered, never which of the
    // four it was — that distinction is the merchant's business.
    if (product.status !== 'ACTIVE' || !product.isAvailable || product.merchantStatus !== 'ACTIVE') {
      return apiError(req, 'product_unavailable', 'business.productUnavailable', 409)
    }

    const groups = await findPublicOptions(input.productPublicId)
    const selectedOptions = resolveSelectedOptions(input.selectedOptions, groups)
    if (selectedOptions === null) {
      return apiError(req, 'validation_error', 'business.invalidOptions', 422)
    }

    // Price comes from the product row, re-validated as an integer. BIGINT
    // crosses the client as a string once it could exceed a JS number's exact
    // range, so a malformed value fails here rather than reaching a total.
    const unitPrice = assertAmount(
      typeof product.priceAmount === 'string' ? Number(product.priceAmount) : product.priceAmount,
      'unit price'
    )
    const total = lineTotal(unitPrice, input.quantity)

    const token = newTrackingToken()
    const created = await createOrder({
      orderPublicId: newPublicId(),
      merchantId: product.merchantId,
      trackingTokenHash: hashTrackingToken(token),
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      customerAddress: input.customer.address,
      customerNote: input.customer.note ?? null,
      source: input.source,
      sourceContentPublicId: input.sourceContentPublicId ?? null,
      expiresAt: new Date(Date.now() + EXPIRY_HOURS * 3_600_000).toISOString(),
      productId: product.productId,
      productPublicId: product.productPublicId,
      productNameSnapshot: product.name,
      unitPriceAmount: unitPrice,
      quantity: input.quantity,
      selectedOptionsSnapshot: selectedOptions,
    })

    const result = {
      orderPublicId: created.order_public_id,
      trackingToken: token,
      status: created.status,
      totalAmount: assertAmount(Number(created.total_amount), 'total'),
      totalItems: created.total_items,
      currency: 'VND',
      expiresAt: created.expires_at,
    }
    // Best effort: the order exists either way. Losing the record costs a replay,
    // never the order.
    await remember(idempotencyKey, fingerprint, result)

    notifyMerchant(product, created.order_public_id, total)

    return NextResponse.json(orderResponse(result), { status: 201 })
  } catch (e) {
    logBusinessError('orders.create', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

/** The response body. Built by allow-list; the order's internal id never appears. */
function orderResponse(result: {
  trackingToken: string
  status: string
  totalAmount: number
  totalItems: number
  currency: string
}) {
  return {
    order: {
      status: result.status,
      totalAmount: result.totalAmount,
      totalItems: result.totalItems,
      currency: result.currency,
      totalFormatted: formatAmount(result.totalAmount, result.currency),
      notice: TOTAL_NOTICE,
    },
    // The raw token appears here and nowhere else — not in PostgreSQL, not in a
    // log. The customer's URL bar is its only durable home.
    trackingUrl: trackingUrl(result.trackingToken),
  }
}

/**
 * Tell the merchant, through the platform's existing notification system.
 *
 * Fire-and-forget: a notification failure must never fail an order that is
 * already written. The merchant would rather have the order and miss the ping
 * than lose the sale.
 *
 * 🚨 The body carries NO customer PII — no name, no phone, no address. A push
 * notification lands on a lock screen; the details belong behind the merchant's
 * authenticated dashboard, not on it.
 */
function notifyMerchant(
  product: { merchantOwnerUserId: string; name: string },
  orderPublicId: string,
  totalAmount: number
): void {
  void emitNotification({
    userId: product.merchantOwnerUserId,
    type: 'business_order',
    // Transactional, not marketing: a merchant who misses this loses a sale, so
    // it is exempt from frequency caps and opt-out by definition.
    category: 'system',
    title: 'Đơn hàng mới',
    body: `${product.name} — ${formatAmount(totalAmount)}`,
    entityUrl: `/business/orders/${orderPublicId}`,
    data: { kind: 'normal', orderPublicId },
  }).catch((e) => logBusinessError('orders.notification', e))
}
