import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { clientIp } from '@/lib/security/rateLimit'
import { ProductPublicIdSchema } from '@/lib/business/schema'
import {
  findPublicMerchant,
  findPublicOptions,
  findPublicProduct,
} from '@/lib/business/repositories/products'
import { toPublicProduct } from '@/lib/business/views'

// GET /api/public/business/products/[publicId] — the customer-facing product read.
//
// AUTH          None. This is the link a merchant shares to Facebook and Zalo.
// AUTHORIZATION None to apply — possession of the public id is the whole of the
//               access model, which is why the id is a 26-character ULID with
//               80 random bits rather than anything enumerable.
// PII           None whatsoever. The response carries the product, the shop's
//               display NAME, and nothing else: no internal UUID, no merchant
//               address or phone, no audit timestamps, no terms record, no
//               customer data, no storage key. `views.ts` builds it by
//               allow-list and `publicProductBoundary.test.ts` drives a
//               poisoned row through it.
// READ-ONLY     There is no mutating verb on this path.
// ERRORS        404 not_found · 429 rate_limited · 500 server_error
//
// A retired or unpublished product still RESOLVES rather than 404ing (P0 §11):
// a link a merchant posted outlives the product, and "Sản phẩm ngừng bán" is a
// better answer than a dead end. `status: 'RETIRED'` and `isOrderable: false`
// carry that, and a genuinely unknown id is still a 404.

type Params = { params: { publicId: string } }

export async function GET(req: Request, { params }: Params) {
  try {
    // Unauthenticated and world-reachable, so the limit is per IP. A 26-char
    // ULID is not searchable, but a miss-rate spike is still worth throttling.
    const ip = clientIp(req)
    const rl = await distributedRateLimit(`business:public:product:${ip}`, 120, 60_000)
    if (!rl.ok) return apiError(req, 'rate_limited', 'rate.retryShortly', 429)

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    // A malformed id gets the same 404 as an unknown one — the shape of the
    // identifier is not something the endpoint needs to teach a prober.
    if (!publicId.success) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const product = await findPublicProduct(publicId.data)
    if (!product) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const [shop, options] = await Promise.all([
      findPublicMerchant(product.merchant_id),
      findPublicOptions(publicId.data),
    ])

    return NextResponse.json({ product: toPublicProduct(product, shop, options) })
  } catch (e) {
    logBusinessError('public.product', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
