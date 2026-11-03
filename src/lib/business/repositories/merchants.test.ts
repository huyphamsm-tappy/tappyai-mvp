import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { __resetBusinessDb, __setBusinessDb } from './client'
import { createFakeDb, callsFor, type FakeDb } from './__fixtures__/fakeDb'
import {
  createMerchant,
  findMerchantByControllerUser,
  findMerchantProfile,
  hasAcceptedTerms,
  recordTermsAcceptance,
  updateMerchant,
} from './merchants'
import { PUBLIC_ID_PATTERN } from '../ids'
import type { MerchantContext } from '../authz'

const ALICE: MerchantContext = {
  merchantId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE',
}
const BOB_MERCHANT = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

let db: FakeDb

beforeEach(() => {
  db = createFakeDb()
  __setBusinessDb(db.client as never)
})
afterEach(() => __resetBusinessDb())

const merchantRow = {
  id: ALICE.merchantId,
  public_id: ALICE.merchantPublicId,
  controller_user_id: ALICE.controllerUserId,
  status: 'ACTIVE',
}

describe('the bootstrap lookup', () => {
  it('filters on the Controller identity and nothing else', async () => {
    db.queue('business_merchants', { data: merchantRow })
    await findMerchantByControllerUser(ALICE.controllerUserId)

    expect(callsFor(db, 'business_merchants')[0].filters).toEqual({
      controller_user_id: ALICE.controllerUserId,
    })
  })

  it('returns null for an identity with no shop, rather than throwing', async () => {
    db.queue('business_merchants', { data: null })
    expect(await findMerchantByControllerUser('someone-else')).toBeNull()
  })
})

describe('onboarding', () => {
  it('binds the shop to the Controller identity and mints a ULID public id', async () => {
    db.queue('business_merchants', { data: merchantRow })
    await createMerchant(ALICE.controllerUserId, {
      businessCategory: 'CAFE',
      shopName: 'Lan Shop',
      address: '128 Nguyễn Văn Cừ, Q5',
      phone: '0901234567',
      termsVersion: '2026-09-08',
      acceptedIp: '203.0.113.7',
    })

    const payload = callsFor(db, 'business_merchants')[0].payload as Record<string, unknown>
    expect(payload.controller_user_id).toBe(ALICE.controllerUserId)
    expect(PUBLIC_ID_PATTERN.test(String(payload.public_id))).toBe(true)
  })

  it('🔑 never writes the legal identity fields', async () => {
    db.queue('business_merchants', { data: merchantRow })
    await createMerchant(ALICE.controllerUserId, {
      businessCategory: 'CAFE',
      shopName: 'Lan Shop',
      address: 'x',
      phone: '1',
      termsVersion: '2026-09-08',
      acceptedIp: null,
    })

    const payload = callsFor(db, 'business_merchants')[0].payload as Record<string, unknown>
    // PHASE_0 §F3: this codebase has no encryption capability, so an identity
    // number is not collected. The columns exist so enabling collection later
    // does not mean re-contacting every merchant.
    expect(payload).not.toHaveProperty('legal_name')
    expect(payload).not.toHaveProperty('tax_or_identity_number')
    expect(payload).not.toHaveProperty('status')
  })

  it('records the terms acceptance with its version and source', async () => {
    db.queue('business_merchants', { data: merchantRow })
    await createMerchant(ALICE.controllerUserId, {
      businessCategory: 'CAFE',
      shopName: 'Lan Shop',
      address: 'x',
      phone: '1',
      termsVersion: '2026-09-08',
      acceptedIp: '203.0.113.7',
    })

    const acceptance = callsFor(db, 'business_merchant_terms_acceptances')[0]
    expect(acceptance.op).toBe('insert')
    const payload = acceptance.payload as Record<string, unknown>
    expect(payload.merchant_id).toBe(ALICE.merchantId)
    expect(payload.terms_version).toBe('2026-09-08')
    // An acceptance without a time and a source is weak evidence; `accepted_at`
    // is the column default.
    expect(payload.accepted_ip).toBe('203.0.113.7')
  })

  it('writes the merchant BEFORE the acceptance, so a half-write is repairable', async () => {
    db.queue('business_merchants', { data: merchantRow })
    await createMerchant(ALICE.controllerUserId, {
      businessCategory: 'CAFE',
      shopName: 'x',
      address: 'x',
      phone: '1',
      termsVersion: '2026-09-08',
      acceptedIp: null,
    })

    // The two writes are not one transaction. This order leaves a merchant with
    // no acceptance, which onboarding detects and completes; the reverse would
    // leave an acceptance pointing at no merchant, which nothing ever fixes.
    expect(db.calls.map((c) => c.table)).toEqual([
      'business_merchants',
      'business_merchant_terms_acceptances',
    ])
  })
})

describe('terms acceptance is append-only and idempotent', () => {
  it('treats a duplicate as success — the record it wanted already exists', async () => {
    db.queue('business_merchant_terms_acceptances', { error: { code: '23505' } })
    await expect(recordTermsAcceptance(ALICE.merchantId, '2026-09-08', null)).resolves.toBeUndefined()
  })

  it('still surfaces a real failure', async () => {
    db.queue('business_merchant_terms_acceptances', { error: { code: '42501' } })
    await expect(recordTermsAcceptance(ALICE.merchantId, '2026-09-08', null)).rejects.toBeTruthy()
  })

  it('never updates or deletes — the table grants neither', async () => {
    db.queue('business_merchant_terms_acceptances', { data: null })
    await recordTermsAcceptance(ALICE.merchantId, '2026-09-08', null)
    expect(db.calls.every((c) => c.op === 'insert')).toBe(true)
  })

  it('checks acceptance scoped to the context merchant', async () => {
    db.queue('business_merchant_terms_acceptances', { data: { id: 'x' } })
    expect(await hasAcceptedTerms(ALICE, '2026-09-08')).toBe(true)

    expect(callsFor(db, 'business_merchant_terms_acceptances')[0].filters).toEqual({
      merchant_id: ALICE.merchantId,
      terms_version: '2026-09-08',
    })
  })
})

describe('profile reads and writes are context-scoped', () => {
  it('reads only the caller’s own row', async () => {
    db.queue('business_merchants', { data: null })
    await findMerchantProfile(ALICE)
    expect(callsFor(db, 'business_merchants')[0].filters).toEqual({ id: ALICE.merchantId })
  })

  it('🔑 updates only the caller’s own row, never one named in the patch', async () => {
    db.queue('business_merchants', { data: null })
    await updateMerchant(ALICE, {
      shopName: 'Renamed',
      id: BOB_MERCHANT,
      merchantId: BOB_MERCHANT,
    } as unknown as Parameters<typeof updateMerchant>[1])

    const [call] = callsFor(db, 'business_merchants')
    expect(call.filters).toEqual({ id: ALICE.merchantId })
    expect(call.payload).toEqual({ shop_name: 'Renamed' })
  })

  it('🔑 refuses to write status or the legal fields even when asked', async () => {
    db.queue('business_merchants', { data: null })
    await updateMerchant(ALICE, {
      shopName: 'x',
      status: 'ACTIVE',
      legal_name: 'Injected Co',
      tax_or_identity_number: '0123456789',
    } as unknown as Parameters<typeof updateMerchant>[1])

    const payload = callsFor(db, 'business_merchants')[0].payload as Record<string, unknown>
    // A merchant lifting their own suspension by editing their shop name is the
    // specific escalation this excludes.
    expect(payload).toEqual({ shop_name: 'x' })
  })

  it('an empty patch reads instead of writing', async () => {
    db.queue('business_merchants', { data: null })
    await updateMerchant(ALICE, {})
    expect(db.calls.every((c) => c.op === 'select')).toBe(true)
  })
})
