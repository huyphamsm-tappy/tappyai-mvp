// POST /api/payments/orders — the RPC contract and the honesty of its failure answer.
// UAT 2026-10-06: "Thanh toán" showed "Chưa tạo được đơn" because the audit database has none of the payment
// migrations (no payment_orders table, no p8_payments_create_order). That is an ENVIRONMENT blocker, so the route
// must say "payments unavailable" (503) for a missing function, and keep 500 for a genuine failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/payments/authGuard', () => ({
  requirePayer: async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  }),
}))

import { POST } from './route'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'

const post = (plan: string) => POST(new Request('https://t.test/api/payments/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) }))

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  vi.stubEnv('SEPAY_BANK_ACCOUNT', '0123456789')
  vi.stubEnv('SEPAY_BANK_CODE', 'VCB')
  vi.stubEnv('SEPAY_ACCOUNT_NAME', 'TAPPY TEST')
  rpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('create order', () => {
  it('calls p8_payments_create_order with exactly the arguments the migration declares (Pip = 29.000 VND / 7 days)', async () => {
    rpc.mockResolvedValue({ data: { status: 'created', order: { id: 'o1', plan: 'pip', amount_vnd: 29000, code: 'TAPPYABC234', status: 'pending', expires_at: '2099-01-01T00:00:00Z', paid_at: null } }, error: null })
    const res = await post('pip')
    expect(res.status).toBe(201)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('p8_payments_create_order')
    // 20261016_p7_pip_one_time.sql: (p_user uuid, p_plan text, p_amount bigint, p_days int, p_ttl_seconds int, p_max_pending int)
    expect(Object.keys(args).sort()).toEqual(['p_amount', 'p_days', 'p_max_pending', 'p_plan', 'p_ttl_seconds', 'p_user'])
    expect(args).toMatchObject({ p_plan: 'pip', p_amount: 29000, p_days: 7 })
    expect(PLAN_CONFIG.pip.priceVnd).toBe(29000)
    expect(PLAN_CONFIG.pip.durationDays).toBe(7)
  })

  it('a missing payments function (migrations not applied) answers 503 "payments unavailable", not a retry-able order failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.p8_payments_create_order(...) in the schema cache' } })
    const res = await post('pip')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('payments_unavailable')
    expect(body.message).not.toMatch(/Chưa tạo được đơn/)
  })

  it('Postgres undefined_function (42883) is treated the same way', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } })
    expect((await post('momo')).status).toBe(503)
  })

  it('any other database error stays a 500 order_failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'check constraint violated' } })
    const res = await post('momo')
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('order_failed')
  })

  it('a Pip already used is refused by the database result (409), never granted twice', async () => {
    rpc.mockResolvedValue({ data: { status: 'pip_used' }, error: null })
    expect((await post('pip')).status).toBe(409)
  })
})
