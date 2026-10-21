import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requireMerchant } from '@/lib/business/routeGuard'
import { UpdateMerchantSchema } from '@/lib/business/schema'
import { findMerchantProfile, updateMerchant } from '@/lib/business/repositories/merchants'
import type { MerchantProfileRow } from '@/lib/business/repositories/merchants'

// GET   /api/business/me — the caller's own shop profile.
// PATCH /api/business/me — edit it.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Resource ownership. `merchant_id` comes from the session and is
//               never read from the body, query or path — there is no parameter
//               here through which another shop could be named.
// PII           The merchant's own shop details. No customer data.
// ERRORS        401 unauthorized · 403 merchant_required / merchant_suspended
//               · 404 not_found · 422 validation_error · 500 server_error
//
// 🚨 `status`, `legal_name` and `tax_or_identity_number` are not writable here.
// Suspension is a moderation action behind `commerce.merchants.suspend`; a
// merchant editing their shop name must not be able to lift it.

/** The profile shape the owning merchant sees. Built by allow-list, never spread. */
function serialize(row: MerchantProfileRow) {
  return {
    publicId: row.public_id,
    businessCategory: row.business_category,
    shopName: row.shop_name,
    address: row.address,
    phone: row.phone,
    status: row.status,
    // Present so the client can show "not provided" rather than guess. They
    // stay null through MVP — see PHASE_0 §F3.
    legalName: row.legal_name,
    hasTaxOrIdentityNumber: row.tax_or_identity_number !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// 🔑 A SHOP BELONGS TO A REAL ACCOUNT. A Supabase anonymous session is still a
// `user`, so `getRequestUser` returning one does not mean the caller has an
// account — `refuseAnonymousSocialWrite` is what draws that line. U02's
// whole-surface guard is what made this explicit rather than assumed.

export async function GET(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const profile = await findMerchantProfile(gate.ctx)
    if (!profile) return apiError(req, 'not_found', 'server.notFound', 404)

    return NextResponse.json({ merchant: serialize(profile) })
  } catch (e) {
    logBusinessError('me.read', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const parsed = UpdateMerchantSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)

    const profile = await updateMerchant(gate.ctx, parsed.data)
    if (!profile) return apiError(req, 'not_found', 'server.notFound', 404)

    return NextResponse.json({ merchant: serialize(profile) })
  } catch (e) {
    logBusinessError('me.update', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
