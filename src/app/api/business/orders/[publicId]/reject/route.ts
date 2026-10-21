import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { requireMerchant } from '@/lib/business/routeGuard'
import { ProductPublicIdSchema, RejectOrderSchema } from '@/lib/business/schema'
import { transitionOrder } from '@/lib/business/repositories/orders'

// POST /api/business/orders/[publicId]/reject — the merchant declines the order.
//
// Same authorization, concurrency and idempotency model as `accept` — see the
// notes there; they are not repeated.
//
// ============================================================================
// THE ONE FIELD THIS ENDPOINT ACCEPTS
// ============================================================================
// An optional bounded `reason`, stored in `business_order_status_history.reason`
// — the column P0 already provides, so no schema change was needed.
//
// 🚨 IT IS NOT CUSTOMER-VISIBLE. The tracking view shows the status and its
// fixed copy and never the reason, because "hết hàng" and "khách hàng đáng ngờ"
// are not the same thing to say to a customer. It exists so the merchant's own
// order detail can tell them later why they declined, and so bulk spam handling
// has something to key on.
//
// Everything else is still derived: status, actor, timestamp, merchant. A body
// carrying `status`, `actor` or a timestamp has them stripped by zod.
//
// ERRORS 401 · 403 · 404 not_found · 409 order_not_pending · 422 validation_error · 500

type Params = { params: { publicId: string } }

export async function POST(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const rl = await distributedRateLimit(`business:orders:reject:${gate.ctx.merchantId}`, 60, 60_000)
    if (!rl.ok) return apiError(req, 'rate_limited', 'rate.retryShortly', 429)

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.orderNotFound', 404)

    // An absent body is a reject with reason OTHER — a merchant tapping
    // "decline" should not have to explain themselves to place the call.
    const parsed = RejectOrderSchema.safeParse((await req.json().catch(() => null)) ?? {})
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)

    const outcome = await transitionOrder(
      gate.ctx,
      publicId.data,
      'REJECTED',
      `MERCHANT_REJECTED:${parsed.data.reason}`
    )

    if (outcome.kind === 'not_found') {
      return apiError(req, 'not_found', 'business.orderNotFound', 404)
    }
    if (outcome.kind === 'already_terminal') {
      // Already REJECTED covers both "this is my retry" and "the expiry job got
      // there first". Either way the order is where this request wanted it, so
      // it is a 200 — but `alreadyApplied` says nothing new happened, and the
      // order detail's history says who did it.
      if (outcome.status === 'REJECTED') {
        return NextResponse.json({
          order: { reference: publicId.data, status: outcome.status, updatedAt: outcome.updatedAt },
          alreadyApplied: true,
        })
      }
      return apiError(req, 'order_not_pending', 'business.orderNotPending', 409)
    }

    return NextResponse.json({
      order: { reference: publicId.data, status: outcome.status, updatedAt: outcome.updatedAt },
      alreadyApplied: false,
    })
  } catch (e) {
    logBusinessError('orders.reject', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
