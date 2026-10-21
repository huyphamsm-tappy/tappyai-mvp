import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { requireMerchant } from '@/lib/business/routeGuard'
import { CreateProductSchema, isOwnedProductImageKey } from '@/lib/business/schema'
import { createProduct, listProducts } from '@/lib/business/repositories/products'
import { toMerchantProduct } from '@/lib/business/views'

// GET  /api/business/products — the caller's own catalogue.
// POST /api/business/products — create a product in the caller's own shop.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Resource ownership. The repository takes MerchantContext as its
//               first argument and derives `merchant_id` from it; nothing in
//               the request can name a shop.
// PII           None. Products carry no customer data.
// ERRORS        401 unauthorized · 403 merchant_required / merchant_suspended
//               · 422 validation_error · 400 invalid_image · 429 rate_limited
//               · 500 server_error

// 🔑 A SHOP BELONGS TO A REAL ACCOUNT. A Supabase anonymous session is still a
// `user`, so `getRequestUser` returning one does not mean the caller has an
// account — `refuseAnonymousSocialWrite` is what draws that line. U02's
// whole-surface guard is what made this explicit rather than assumed.

export async function GET(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const products = await listProducts(gate.ctx)
    return NextResponse.json({ products: products.map((p) => toMerchantProduct(p)) })
  } catch (e) {
    logBusinessError('products.list', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const rl = await distributedRateLimit(`business:products:create:${gate.ctx.merchantId}`, 60, 60_000)
    if (!rl.ok) return apiError(req, 'rate_limited', 'rate.retryShortly', 429)

    const parsed = CreateProductSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)

    // The media layer names every object `{prefix}/{ownerId}/{random}.{ext}`
    // and the upload endpoint passes this merchant's PUBLIC id as the owner, so
    // a key belonging to another shop — or pointing at `avatars/…`, which is
    // somebody's face — is refused here.
    if (
      parsed.data.imageAssetKey &&
      !isOwnedProductImageKey(parsed.data.imageAssetKey, gate.ctx.merchantPublicId)
    ) {
      return apiError(req, 'invalid_image', 'business.imageNotYours', 400)
    }

    const product = await createProduct(gate.ctx, parsed.data)
    return NextResponse.json(
      { product: toMerchantProduct(product, (parsed.data.options ?? []).map(toRow)) },
      { status: 201 }
    )
  } catch (e) {
    logBusinessError('products.create', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

/** The just-written options, shaped like a read so the response is consistent. */
function toRow(group: { name: string; isRequired: boolean; values: string[] }, index: number) {
  return { name: group.name, position: index, is_required: group.isRequired, values: group.values }
}
