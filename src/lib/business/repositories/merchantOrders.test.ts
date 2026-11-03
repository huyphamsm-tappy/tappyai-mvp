import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { __resetBusinessDb, __setBusinessDb } from './client'
import { createFakeDb, callsFor, type FakeDb } from './__fixtures__/fakeDb'
import { findMerchantOrder, listMerchantOrders, transitionOrder } from './orders'
import type { MerchantContext } from '../authz'

// Tappy Business — merchant order management: the query shape.
//
// 🔑 THE PROPERTY UNDER TEST: every merchant order query carries `merchant_id`
// from the MerchantContext, and the transition passes the merchant and the
// actor the SERVER resolved — never anything from a request body.
//
// The transition's CORRECTNESS under concurrency is a database property and is
// proved in supabase/tests/tappy_business_p3_order_transitions.test.ts against a
// real PostgreSQL with two sessions. This file proves the call is built right.

const ALICE: MerchantContext = {
  merchantId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE',
}
const BOB: MerchantContext = {
  merchantId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  merchantPublicId: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
  controllerUserId: '22222222-2222-4222-8222-222222222222',
  status: 'ACTIVE',
}
const BOBS_ORDER = '01CRZ3NDEKTSV4RRFFQ69G5FAV'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb()
  __setBusinessDb(db.client as never)
})
afterEach(() => __resetBusinessDb())

describe('the inbox is merchant-scoped', () => {
  it('filters on the context merchant', async () => {
    db.queue('business_orders', { data: [] })
    await listMerchantOrders(ALICE, { limit: 20 })
    expect(callsFor(db, 'business_orders')[0].filters.merchant_id).toBe(ALICE.merchantId)
  })

  it('a different merchant produces a different filter', async () => {
    db.queue('business_orders', { data: [] })
    await listMerchantOrders(BOB, { limit: 20 })
    const filters = callsFor(db, 'business_orders')[0].filters
    expect(filters.merchant_id).toBe(BOB.merchantId)
    expect(filters.merchant_id).not.toBe(ALICE.merchantId)
  })

  it('narrows by status without dropping the merchant filter', async () => {
    db.queue('business_orders', { data: [] })
    await listMerchantOrders(ALICE, { limit: 20, status: 'PENDING' })
    const filters = callsFor(db, 'business_orders')[0].filters
    expect(filters).toEqual({ merchant_id: ALICE.merchantId, status: 'PENDING' })
  })

  it('🔑 never selects the tracking token hash', async () => {
    db.queue('business_orders', { data: [] })
    await listMerchantOrders(ALICE, { limit: 20 })
    const columns = callsFor(db, 'business_orders')[0].columns ?? ''
    // The token is the customer's credential, not the merchant's. Leaving it
    // out of the query means no view change can leak it.
    expect(columns).not.toContain('tracking_token')
    expect(columns).not.toContain('*')
  })
})

describe('detail is merchant-scoped', () => {
  it('🔑 carries BOTH public_id and merchant_id', async () => {
    db.queue('business_orders', { data: null })
    await findMerchantOrder(ALICE, BOBS_ORDER)

    // Bob's real order id, Alice's merchant. Matches nothing — which is the
    // same answer a made-up id gets.
    expect(callsFor(db, 'business_orders')[0].filters).toEqual({
      public_id: BOBS_ORDER,
      merchant_id: ALICE.merchantId,
    })
  })

  it('returns null for another merchant’s order, and reads no children', async () => {
    db.queue('business_orders', { data: null })
    expect(await findMerchantOrder(ALICE, BOBS_ORDER)).toBeNull()
    expect(callsFor(db, 'business_order_items')).toHaveLength(0)
    expect(callsFor(db, 'business_order_status_history')).toHaveLength(0)
  })
})

describe('the transition passes only server-derived values', () => {
  const outcome = [{ transitioned: true, status: 'ACCEPTED', updated_at: '2026-09-10T00:00:00Z' }]

  it('🔑 sends the merchant and the actor from the context', async () => {
    db.queue('fn_business_transition_order', { data: outcome })
    await transitionOrder(ALICE, '01DRZ3NDEKTSV4RRFFQ69G5FAV', 'ACCEPTED', 'MERCHANT_ACCEPTED')

    const payload = db.calls[0].payload as Record<string, unknown>
    expect(payload.p_merchant_id).toBe(ALICE.merchantId)
    // The history row's actor is the authenticated Controller identity.
    expect(payload.p_actor_id).toBe(ALICE.controllerUserId)
    expect(payload.p_to_status).toBe('ACCEPTED')
  })

  it('🔑 sends no status the caller chose, no timestamp and no totals', async () => {
    db.queue('fn_business_transition_order', { data: outcome })
    await transitionOrder(ALICE, '01DRZ3NDEKTSV4RRFFQ69G5FAV', 'REJECTED', 'MERCHANT_REJECTED:SPAM')

    const payload = db.calls[0].payload as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(
      ['p_actor_id', 'p_merchant_id', 'p_order_public_id', 'p_reason', 'p_to_status'].sort()
    )
    for (const absent of ['p_updated_at', 'p_created_at', 'p_total_amount', 'p_actor_type']) {
      expect(payload, absent).not.toHaveProperty(absent)
    }
  })

  it('goes through the atomic function, never a bare UPDATE', async () => {
    db.queue('fn_business_transition_order', { data: outcome })
    await transitionOrder(ALICE, '01DRZ3NDEKTSV4RRFFQ69G5FAV', 'ACCEPTED', 'MERCHANT_ACCEPTED')

    expect(db.calls.map((c) => c.op)).toEqual(['rpc'])
    expect(callsFor(db, 'business_orders')).toHaveLength(0)
    expect(callsFor(db, 'business_order_status_history')).toHaveLength(0)
  })

  it('reports not_found when the function matched no row', async () => {
    db.queue('fn_business_transition_order', { data: [] })
    expect(await transitionOrder(ALICE, BOBS_ORDER, 'ACCEPTED', 'MERCHANT_ACCEPTED')).toEqual({
      kind: 'not_found',
    })
  })

  it('reports already_terminal without inventing a transition', async () => {
    db.queue('fn_business_transition_order', {
      data: [{ transitioned: false, status: 'REJECTED', updated_at: '2026-09-10T00:00:00Z' }],
    })
    const result = await transitionOrder(ALICE, '01DRZ3NDEKTSV4RRFFQ69G5FAV', 'ACCEPTED', 'MERCHANT_ACCEPTED')
    expect(result).toEqual({
      kind: 'already_terminal',
      status: 'REJECTED',
      updatedAt: '2026-09-10T00:00:00Z',
    })
  })

  it('takes the context first — no parameter names a merchant', () => {
    expect(transitionOrder.length).toBe(4)
    expect(listMerchantOrders.length).toBe(2)
    expect(findMerchantOrder.length).toBe(2)
  })
})
