import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { requireMerchant } from '@/lib/business/routeGuard'
import { ProductPublicIdSchema } from '@/lib/business/schema'
import { findMerchantOrder } from '@/lib/business/repositories/orders'
import { toMerchantOrderDetail } from '@/lib/business/views'

// GET /api/business/orders/[publicId] — one of the merchant's own orders.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Resource ownership, enforced in the repository: the lookup
//               carries BOTH `public_id` and `merchant_id`, so another
//               merchant's order matches zero rows.
//
// 🔑 KNOWING AN IDENTIFIER IS NOT AUTHORIZATION. An order's public id, its
// internal id, its tracking token, its hash, its product id — none of them is
// accepted here, and the one identifier that is (the public id) is only ever
// used together with the merchant from the session. A merchant holding another
// shop's public id gets the same 404 as one holding a made-up string.
//
// PII           The merchant's OWN customer's name, phone, address and note.
// ERRORS        401 · 403 · 404 not_found · 500

type Params = { params: { publicId: string } }

export async function GET(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    // The same ULID shape products use — one identifier format across Business.
    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.orderNotFound', 404)

    const found = await findMerchantOrder(gate.ctx, publicId.data)
    if (!found) return apiError(req, 'not_found', 'business.orderNotFound', 404)

    return NextResponse.json({
      order: toMerchantOrderDetail(found.order, found.items, found.history),
    })
  } catch (e) {
    logBusinessError('orders.detail', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
