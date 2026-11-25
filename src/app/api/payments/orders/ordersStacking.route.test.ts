// POST /api/payments/orders while a plan runs (owner 20/11: buying again adds the days). Same kind of web plan: an order is created. Anything else: 409 already_active with the reason in the message, no order.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/payments/authGuard', () => ({
  requirePayer: async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row }) }) }) }) },
  }),
}))

import { POST } from './route'

const post = (plan: string) => POST(new Request('https://t.test/api/payments/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'accept-language': 'vi' }, body: JSON.stringify({ plan }) }))
const running = (plan: string, source: string) => ({ plan, status: 'active', current_period_end: new Date(Date.now() + 10 * 86_400_000).toISOString(), source })
const created = (plan: string) => ({ data: { status: 'created', order: { id: 'o1', plan, amount_vnd: 1, code: 'TAPPYABC234', status: 'pending', expires_at: '2099-01-01T00:00:00Z', paid_at: null } }, error: null })

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  vi.stubEnv('SEPAY_BANK_ACCOUNT', '0123456789')
  vi.stubEnv('SEPAY_BANK_CODE', 'VCB')
  vi.stubEnv('SEPAY_ACCOUNT_NAME', 'TAPPY TEST')
  rpc.mockReset()
  h.row = null
})
afterEach(() => { vi.unstubAllEnvs() })

describe('buying while a web plan is running', () => {
  it('the same kind of plan creates an order (its days will be added to the end date)', async () => {
    h.row = running('coco', 'web_sepay')
    rpc.mockResolvedValue(created('coco'))
    const res = await post('coco')
    expect(res.status).toBe(201)
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc.mockResolvedValue(created('momo'))
    expect((await post('momo')).status).toBe(201)
    h.row = running('promax1m', 'web_sepay')
    rpc.mockResolvedValue(created('promax3m'))
    expect((await post('promax3m')).status).toBe(201)
  })
  // owner 20/11 (second ruling): an upgrade (Coco -> Tappy) creates an order; the days left are added to the end date and the account moves to the higher plan
  it('an upgrade creates an order', async () => {
    h.row = running('coco', 'web_sepay')
    rpc.mockResolvedValue(created('promax1m'))
    expect((await post('promax1m')).status).toBe(201)
    rpc.mockResolvedValue(created('promax3m'))
    expect((await post('promax3m')).status).toBe(201)
  })
  it('a downgrade, the trial on top of a plan, or a store plan is refused with 409 already_active and no order', async () => {
    h.row = running('promax1m', 'web_sepay')
    for (const plan of ['coco', 'momo', 'pip']) {
      const res = await post(plan)
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('already_active')
    }
    h.row = running('coco', 'web_sepay')
    expect((await post('pip')).status).toBe(409)
    h.row = running('coco', 'google_play')
    const store = await post('coco')
    expect(store.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('the refusal of a downgrade says what can be bought: the same kind of plan, or an upgrade', async () => {
    h.row = running('promax1m', 'web_sepay')
    const body = await (await post('coco')).json() as { message: string }
    expect(body.message).toContain('cùng loại')
    expect(body.message).toContain('nâng cấp')
  })
})
