import { describe, it, expect } from 'vitest'
import {
  MerchantIsolationError,
  assertMerchantOwnership,
  merchantScope,
  resolveMerchantContext,
  type MerchantAuthDeps,
  type MerchantContext,
} from './authz'

// Tappy Business — merchant isolation.
//
// ⚠️ WHAT THIS FILE PROVES, AND WHAT IT DOES NOT.
//
// In MVP, `authz.ts` IS the isolation boundary: every Business table grants
// privileges to `service_role` alone with RLS enabled and no policies, so there
// is no RLS policy standing behind this code (see the migration's header). That
// makes these tests the proof, not a convenience.
//
// What is real here: `resolveMerchantContext` is executed, never mocked. What
// is substituted is the Controller session and the database read — the two
// things that would otherwise require a live Supabase — through the `deps` seam
// the module exposes for exactly this purpose.
//
// What this file CANNOT prove is that the grants and RLS are what the migration
// says: supabase/tests/tappy_business_p0_boundary.test.ts applies the SQL to a
// real PostgreSQL and does that.

const ALICE_USER = '11111111-1111-4111-8111-111111111111'
const BOB_USER = '22222222-2222-4222-8222-222222222222'
const ALICE_MERCHANT = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const BOB_MERCHANT = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const MERCHANTS: Record<string, { id: string; public_id: string; controller_user_id: string; status: string }> = {
  [ALICE_USER]: {
    id: ALICE_MERCHANT,
    public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    controller_user_id: ALICE_USER,
    status: 'ACTIVE',
  },
  [BOB_USER]: {
    id: BOB_MERCHANT,
    public_id: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
    controller_user_id: BOB_USER,
    status: 'ACTIVE',
  },
}

/** A fake Controller session plus the merchant table, wired through the seam. */
function deps(userId: string | null, overrides: Partial<MerchantAuthDeps> = {}): MerchantAuthDeps {
  return {
    getUser: async () => ({ user: userId ? { id: userId } : null }),
    loadMerchant: async (controllerUserId: string) => MERCHANTS[controllerUserId] ?? null,
    ...overrides,
  }
}

const req = () => new Request('https://tappyai.com/api/business/orders')

const aliceContext: MerchantContext = {
  merchantId: ALICE_MERCHANT,
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: ALICE_USER,
  status: 'ACTIVE',
}

describe('identity comes from the session and nowhere else', () => {
  it('resolves the merchant owned by the authenticated user', async () => {
    const result = await resolveMerchantContext(req(), deps(ALICE_USER))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.merchant.merchantId).toBe(ALICE_MERCHANT)
    expect(result.merchant.controllerUserId).toBe(ALICE_USER)
  })

  it('resolves a DIFFERENT merchant for a different session, from the same request', async () => {
    // The request object is identical in both calls. Only the session differs,
    // and the session is what decides — that is the whole invariant.
    const asAlice = await resolveMerchantContext(req(), deps(ALICE_USER))
    const asBob = await resolveMerchantContext(req(), deps(BOB_USER))

    expect(asAlice.ok && asAlice.merchant.merchantId).toBe(ALICE_MERCHANT)
    expect(asBob.ok && asBob.merchant.merchantId).toBe(BOB_MERCHANT)
  })

  it('ignores a merchant id supplied in the request body, query or path', async () => {
    // The IDOR attempt, written out. A caller naming Bob's merchant id in every
    // place a caller can name anything still resolves to their own merchant.
    const hostile = new Request(
      `https://tappyai.com/api/business/orders?merchant_id=${BOB_MERCHANT}`,
      {
        method: 'POST',
        body: JSON.stringify({ merchant_id: BOB_MERCHANT, merchantId: BOB_MERCHANT }),
        headers: { 'content-type': 'application/json', 'x-merchant-id': BOB_MERCHANT },
      }
    )

    const result = await resolveMerchantContext(hostile, deps(ALICE_USER))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.merchant.merchantId).toBe(ALICE_MERCHANT)
    expect(result.merchant.merchantId).not.toBe(BOB_MERCHANT)
  })

  it('has no parameter through which a caller could nominate a merchant', () => {
    // `resolveMerchantContext(req, deps)` — the second parameter is the test
    // seam and is not reachable from an HTTP request. If someone adds a third
    // parameter carrying an id, this fails and the review happens.
    expect(resolveMerchantContext.length).toBe(1)
  })
})

describe('failures are distinguishable', () => {
  it('reports UNAUTHENTICATED when there is no session', async () => {
    const result = await resolveMerchantContext(req(), deps(null))
    expect(result).toEqual({ ok: false, reason: 'UNAUTHENTICATED' })
  })

  it('reports NOT_A_MERCHANT for a signed-in user who has not onboarded', async () => {
    const result = await resolveMerchantContext(req(), deps('33333333-3333-4333-8333-333333333333'))
    expect(result).toEqual({ ok: false, reason: 'NOT_A_MERCHANT' })
  })

  it('reports MERCHANT_SUSPENDED rather than hiding it as NOT_A_MERCHANT', async () => {
    // The caller is genuinely the owner, so the reason is theirs to know. It
    // discloses nothing about anyone else.
    const result = await resolveMerchantContext(
      req(),
      deps(ALICE_USER, {
        loadMerchant: async () => ({ ...MERCHANTS[ALICE_USER], status: 'SUSPENDED' }),
      })
    )
    expect(result).toEqual({ ok: false, reason: 'MERCHANT_SUSPENDED' })
  })

  it('refuses a row whose owner does not match the session', async () => {
    // Simulates a query that lost its filter and returned somebody else's row.
    // Returning it would be the leak; the second check is what stops it.
    const result = await resolveMerchantContext(
      req(),
      deps(ALICE_USER, { loadMerchant: async () => MERCHANTS[BOB_USER] })
    )
    expect(result).toEqual({ ok: false, reason: 'NOT_A_MERCHANT' })
  })
})

describe('scoping primitives', () => {
  it('merchantScope produces the filter every query must carry', () => {
    expect(merchantScope(aliceContext)).toEqual({ merchant_id: ALICE_MERCHANT })
  })

  it('assertMerchantOwnership passes only for the acting merchant', () => {
    expect(() => assertMerchantOwnership(aliceContext, { merchant_id: ALICE_MERCHANT })).not.toThrow()
    expect(() => assertMerchantOwnership(aliceContext, { merchant_id: BOB_MERCHANT })).toThrow(
      MerchantIsolationError
    )
  })

  it('treats a missing, null or absent merchant_id as a failure, never as a pass', () => {
    // A row with no merchant_id is the shape a `select()` returns when the
    // column was forgotten. Defaulting to "allowed" there would make the guard
    // silently vacuous.
    expect(() => assertMerchantOwnership(aliceContext, {})).toThrow(MerchantIsolationError)
    expect(() => assertMerchantOwnership(aliceContext, { merchant_id: null })).toThrow(
      MerchantIsolationError
    )
    expect(() => assertMerchantOwnership(aliceContext, null)).toThrow(MerchantIsolationError)
    expect(() => assertMerchantOwnership(aliceContext, undefined)).toThrow(MerchantIsolationError)
  })

  it('does not disclose the row or the merchant in its message', () => {
    try {
      assertMerchantOwnership(aliceContext, { merchant_id: BOB_MERCHANT })
    } catch (e) {
      expect((e as Error).message).not.toContain(BOB_MERCHANT)
      expect((e as Error).message).not.toContain(ALICE_MERCHANT)
    }
  })
})
