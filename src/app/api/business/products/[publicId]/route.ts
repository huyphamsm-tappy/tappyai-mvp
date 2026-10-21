import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requireMerchant } from '@/lib/business/routeGuard'
import {
  ProductPublicIdSchema,
  UpdateProductSchema,
  isOwnedProductImageKey,
} from '@/lib/business/schema'
import {
  findProduct,
  listOptions,
  replaceOptions,
  softDeleteProduct,
  updateProduct,
} from '@/lib/business/repositories/products'
import { toMerchantProduct } from '@/lib/business/views'

// GET    /api/business/products/[publicId] — read one of the caller's products.
// PATCH  /api/business/products/[publicId] — edit it, options included.
// DELETE /api/business/products/[publicId] — retire it (tombstone, never a hard delete).
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Resource ownership, enforced in the repository: every query
//               carries BOTH `public_id` and `merchant_id`, so another
//               merchant's public id matches zero rows.
//
// 🔑 A PUBLIC ID IS AN ADDRESS, NOT A CREDENTIAL. Substituting one belonging to
// another shop returns 404 — the same answer as a product that does not exist,
// so the endpoint never confirms that somebody else's product is real.
//
// PII           None.
// ERRORS        401 unauthorized · 403 merchant_required / merchant_suspended
//               · 404 not_found · 422 validation_error · 400 invalid_image
//               · 500 server_error

type Params = { params: { publicId: string } }

// 🔑 A SHOP BELONGS TO A REAL ACCOUNT. A Supabase anonymous session is still a
// `user`, so `getRequestUser` returning one does not mean the caller has an
// account — `refuseAnonymousSocialWrite` is what draws that line. U02's
// whole-surface guard is what made this explicit rather than assumed.

export async function GET(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const product = await findProduct(gate.ctx, publicId.data)
    if (!product) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const options = await listOptions(gate.ctx, publicId.data)
    return NextResponse.json({ product: toMerchantProduct(product, options) })
  } catch (e) {
    logBusinessError('products.read', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const parsed = UpdateProductSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)

    if (
      parsed.data.imageAssetKey &&
      !isOwnedProductImageKey(parsed.data.imageAssetKey, gate.ctx.merchantPublicId)
    ) {
      return apiError(req, 'invalid_image', 'business.imageNotYours', 400)
    }

    const product = await updateProduct(gate.ctx, publicId.data, parsed.data)
    if (!product) return apiError(req, 'not_found', 'business.productNotFound', 404)

    const options = await listOptions(gate.ctx, publicId.data)
    return NextResponse.json({ product: toMerchantProduct(product, options) })
  } catch (e) {
    logBusinessError('products.update', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const publicId = ProductPublicIdSchema.safeParse(params.publicId)
    if (!publicId.success) return apiError(req, 'not_found', 'business.productNotFound', 404)

    // Retire, never remove: `service_role` holds no DELETE on this table, and
    // the public URL must keep resolving (P0 §11). Options are cleared with it
    // so a retired product cannot leave orphaned groups behind — historical
    // order items keep their own JSONB snapshot and are unaffected.
    const product = await softDeleteProduct(gate.ctx, publicId.data)
    if (!product) return apiError(req, 'not_found', 'business.productNotFound', 404)
    await replaceOptions(gate.ctx, publicId.data, [])

    return NextResponse.json({ product: toMerchantProduct(product) })
  } catch (e) {
    logBusinessError('products.delete', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
