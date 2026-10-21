import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tappy Business — how an authorization failure reaches the client.
//
// The gate is the only place that maps a `MerchantAuthFailure` onto a status
// and a message, so this is where the disclosure decisions live: what a
// stranger learns, what a suspended merchant learns, and what neither learns
// about the other.
//
// `resolveMerchantContext` is substituted because it is the seam the gate
// consumes, not the thing under test — authz.test.ts drives the real one.

const h = vi.hoisted(() => ({
  resolve: vi.fn(),
}))

vi.mock('./authz', () => ({
  resolveMerchantContext: h.resolve,
}))

const { requireMerchant } = await import('./routeGuard')

const req = () => new Request('https://tappyai.com/api/business/products')

const MERCHANT = {
  merchantId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  merchantPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  controllerUserId: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE' as const,
}

beforeEach(() => h.resolve.mockReset())

describe('a resolved merchant passes through', () => {
  it('hands the context to the route', async () => {
    h.resolve.mockResolvedValue({ ok: true, merchant: MERCHANT, user: { id: MERCHANT.controllerUserId, is_anonymous: false } })
    const gate = await requireMerchant(req())

    expect(gate.ok).toBe(true)
    expect(gate.ok && gate.ctx.merchantId).toBe(MERCHANT.merchantId)
  })

  it('takes only the request — nothing can nominate a merchant', () => {
    expect(requireMerchant.length).toBe(1)
  })
})

describe('each failure gets its own answer', () => {
  const cases = [
    ['UNAUTHENTICATED', 401, 'unauthorized'],
    ['NOT_A_MERCHANT', 403, 'merchant_required'],
    ['MERCHANT_SUSPENDED', 403, 'merchant_suspended'],
  ] as const

  it.each(cases)('%s → %i %s', async (reason, status, code) => {
    h.resolve.mockResolvedValue({ ok: false, reason })
    const gate = await requireMerchant(req())

    expect(gate.ok).toBe(false)
    if (gate.ok) return
    expect(gate.response.status).toBe(status)
    expect(await gate.response.json()).toMatchObject({ error: code })
  })

  it('🔑 tells a suspended merchant why, because the shop is theirs', async () => {
    // Hiding it behind NOT_A_MERCHANT would leave an owner unable to act on
    // their own situation, and it discloses nothing about anyone else.
    h.resolve.mockResolvedValue({ ok: false, reason: 'MERCHANT_SUSPENDED' })
    const gate = await requireMerchant(req())

    expect(gate.ok).toBe(false)
    if (gate.ok) return
    const body = await gate.response.json()
    expect(body.error).toBe('merchant_suspended')
    expect(body.message).toMatch(/tạm ngưng|suspended/i)
  })

  it('the message names no table, column, id or internal state', async () => {
    for (const [reason] of cases) {
      h.resolve.mockResolvedValue({ ok: false, reason })
      const gate = await requireMerchant(req())
      if (gate.ok) throw new Error('expected a failure')
      const body = await gate.response.json()
      for (const leak of ['business_', 'merchant_id', 'controller_user_id', 'supabase', 'postgres']) {
        expect(String(body.message).toLowerCase(), `${reason}/${leak}`).not.toContain(leak)
      }
    }
  })
})
