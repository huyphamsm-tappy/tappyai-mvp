import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { requireMerchant } from '@/lib/business/routeGuard'
import { ProductPublicIdSchema } from '@/lib/business/schema'
import { transitionOrder } from '@/lib/business/repositories/orders'

// POST /api/business/orders/[publicId]/accept — the merchant takes the order.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
//               A shop belongs to a real account, so anonymous sessions are
//               refused (U02).
// AUTHORIZATION Resource ownership. The merchant scope is inside the SQL
//               lookup, so another shop's order is a 404, not a 403.
// PII           None in the request or response.
// ERRORS        401 · 403 · 404 not_found · 409 order_not_pending · 500
//
// ============================================================================
// 🔑 NO REQUEST BODY. NONE.
// ============================================================================
// There is nothing a client could legitimately send. The target status is fixed
// by the endpoint, the actor is the authenticated Controller identity, the
// timestamp is `now()` in the database, and the merchant comes from the session.
// A body is not validated-then-ignored here — it is never read, which is one
// fewer thing to get wrong than a schema that strips fields.
//
// ============================================================================
// CONCURRENCY AND RETRIES
// ============================================================================
// The transition happens inside `fn_business_transition_order` under a row
// lock, so two concurrent accepts — or an accept racing a reject or the expiry
// job — serialise: exactly one transitions, and the others read the terminal
// state it wrote.
//
// 🔑 IDEMPOTENCY IS STATE-BASED, NOT KEY-BASED, and that is a deliberate
// finding rather than an omission. P2.1's idempotency store exists for guest
// order CREATION, where a retry would otherwise produce a second order; its
// record type carries a tracking token and order totals and does not describe a
// transition. A transition needs no key because the target state IS the token:
// re-accepting an order this merchant already accepted returns 200 with the
// current state and writes no second history row, because the function finds it
// is no longer PENDING. That holds even when the client loses its key, and it
// cannot be defeated by generating a new one.
//
// A CONFLICTING retry — accepting an order that is already REJECTED — is a 409
// carrying the state that won. It is not silently reinterpreted as success.

type Params = { params: { publicId: string } }

export async function POST(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const rl = await distributedRateLimit(`business:orders:accept:${gate.ctx.merchantId}`, 60, 60_000)
    if (!rl.ok) return apiError(req, 'rate_limited', 'rate.retryShortly', 429)

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.orderNotFound', 404)

    const outcome = await transitionOrder(gate.ctx, publicId.data, 'ACCEPTED', 'MERCHANT_ACCEPTED')

    if (outcome.kind === 'not_found') {
      return apiError(req, 'not_found', 'business.orderNotFound', 404)
    }
    if (outcome.kind === 'already_terminal') {
      // 200 when it is already where this request wanted it — a retry of a
      // request that succeeded. 409 when something else won, and the body says
      // what, because a merchant on the phone to a customer needs to know
      // whether they rejected it or it expired.
      const status = outcome.status === 'ACCEPTED' ? 200 : 409
      if (status === 200) {
        return NextResponse.json({
          order: { reference: publicId.data, status: outcome.status, updatedAt: outcome.updatedAt },
          alreadyApplied: true,
        })
      }
      return apiError(req, 'order_not_pending', 'business.orderNotPending', 409)
    }

    // No notification is emitted here. P0's non-goals exclude customer push and
    // the approved contract requires none for this transition — the customer
    // learns the outcome from the tracking page. Inventing one would be scope
    // this phase does not own.
    return NextResponse.json({
      order: { reference: publicId.data, status: outcome.status, updatedAt: outcome.updatedAt },
      alreadyApplied: false,
    })
  } catch (e) {
    logBusinessError('orders.accept', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
