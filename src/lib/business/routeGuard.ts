import type { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import {
  resolveMerchantContext,
  type MerchantAuthFailure,
  type MerchantAuthUser,
  type MerchantContext,
} from './authz'

// Tappy Business — the merchant gate every authenticated route passes through.
//
// One place that turns "who is asking" into either a MerchantContext or the
// right HTTP response, so no route re-derives the mapping and none of them can
// quietly disagree about what a suspended merchant should see.
//
// 🚨 Note what the signature does NOT offer: there is no parameter through which
// a caller could nominate a merchant. Identity comes from the Controller
// session, resolved by authz.ts, and from nothing in the request.

/** How each authorization failure reaches the client. */
const FAILURES: Record<MerchantAuthFailure, { status: number; code: string; key: 'auth.required' | 'business.merchantRequired' | 'business.merchantSuspended' }> = {
  UNAUTHENTICATED: { status: 401, code: 'unauthorized', key: 'auth.required' },
  NOT_A_MERCHANT: { status: 403, code: 'merchant_required', key: 'business.merchantRequired' },
  // 403, not 404: the caller genuinely owns this shop, so the reason is theirs
  // to know. It discloses nothing about anyone else.
  MERCHANT_SUSPENDED: { status: 403, code: 'merchant_suspended', key: 'business.merchantSuspended' },
}

export type MerchantGate =
  | { readonly ok: true; readonly ctx: MerchantContext; readonly user: MerchantAuthUser }
  | { readonly ok: false; readonly response: NextResponse }

/**
 * Resolve the acting merchant, or produce the response to return.
 *
 * Returns rather than throws so a handler reads as a straight line:
 *
 *     const gate = await requireMerchant(req)
 *     if (!gate.ok) return gate.response
 */
export async function requireMerchant(req: Request): Promise<MerchantGate> {
  const result = await resolveMerchantContext(req)
  if (result.ok) return { ok: true, ctx: result.merchant, user: result.user }

  const f = FAILURES[result.reason]
  return { ok: false, response: apiError(req, f.code, f.key, f.status) }
}
