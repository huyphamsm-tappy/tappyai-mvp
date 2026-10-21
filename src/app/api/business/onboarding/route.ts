import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { CreateMerchantSchema, MERCHANT_TERMS_VERSION } from '@/lib/business/schema'
import {
  createMerchant,
  findMerchantByControllerUser,
  recordTermsAcceptance,
} from '@/lib/business/repositories/merchants'

// POST /api/business/onboarding — become a merchant.
//
// The one Business route that does NOT take a MerchantContext, because it is
// what creates one. Everything after this point goes through `requireMerchant`.
//
// AUTH          Controller session (cookie or Bearer), via getRequestUser.
// AUTHORIZATION Any authenticated non-anonymous user may open a shop. The
//               merchant is bound to `auth.uid()` and nothing in the request
//               names a merchant.
// PII           Writes the merchant's own shop name, address and phone. No
//               customer data is involved. `legal_name` and
//               `tax_or_identity_number` are NOT collected — see schema.ts.
// ERRORS        401 unauthorized · 409 merchant_exists · 422 validation_error
//               · 429 rate_limited · 500 server_error

export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) return apiError(req, 'unauthorized', 'auth.required', 401)

    // 🔑 THE REAL CONTROL. Onboarding is the only way a merchant row comes into
    // existence, so refusing anonymous callers here is what keeps every later
    // Business route out of an anonymous session's reach. The refusals on the
    // other routes are defence in depth behind this one.
    const anonRefusal = refuseAnonymousSocialWrite(req, user)
    if (anonRefusal) return anonRefusal

    // Opening a shop is a once-per-account action; a burst is either a retry
    // storm or someone probing. The limit is per user, not per IP, because the
    // route is authenticated.
    const rl = await distributedRateLimit(`business:onboarding:${user.id}`, 10, 60_000)
    if (!rl.ok) {
      return apiError(req, 'rate_limited', 'rate.retryShortly', 429)
    }

    const parsed = CreateMerchantSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      // The message is the generic catalogue string; the machine code is what a
      // client branches on. Zod's own text is not echoed — it names fields.
      return apiError(req, 'validation_error', 'validation.invalid', 422)
    }
    if (parsed.data.acceptedTermsVersion !== MERCHANT_TERMS_VERSION) {
      return apiError(req, 'terms_outdated', 'business.termsOutdated', 409)
    }

    const existing = await findMerchantByControllerUser(user.id)
    if (existing) {
      // Idempotent completion of a half-finished onboarding: P0's schema writes
      // the merchant and the acceptance as two statements, so a failure between
      // them leaves a merchant with no acceptance record. Re-running onboarding
      // repairs that instead of reporting a conflict the user cannot act on.
      // The insert is a no-op when the acceptance already exists.
      await recordTermsAcceptance(existing.id, MERCHANT_TERMS_VERSION, clientIp(req))
      return apiError(req, 'merchant_exists', 'business.merchantExists', 409)
    }

    const merchant = await createMerchant(user.id, {
      businessCategory: parsed.data.businessCategory,
      shopName: parsed.data.shopName,
      address: parsed.data.address,
      phone: parsed.data.phone,
      termsVersion: MERCHANT_TERMS_VERSION,
      acceptedIp: clientIp(req),
    })

    // Only the public id goes back. The internal UUID never leaves the server.
    return NextResponse.json(
      { merchant: { publicId: merchant.public_id, status: merchant.status } },
      { status: 201 }
    )
  } catch (e) {
    logBusinessError('onboarding.failed', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}

/**
 * The caller's IP for the terms-acceptance record, or null when the platform
 * does not supply one. Recorded because an acceptance without a time and a
 * source is weak evidence; nothing else reads it.
 */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim() || null
  return req.headers.get('x-real-ip')
}
