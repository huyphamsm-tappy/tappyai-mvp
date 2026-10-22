import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getUserById = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    auth: { admin: { getUserById } },
  }),
}))

const sendPaymentMail = vi.fn()
vi.mock('@/lib/payments/mail', () => ({
  sendPaymentMail: (...args: unknown[]) => sendPaymentMail(...args),
}))

import { POST } from './route'
import { fakeBank } from '@/lib/payments/providers'

const HMAC_SECRET = 'test_webhook_hmac_secret_1234567890'
const BANK_ACCOUNT = '0123456789'
const BANK_CODE = 'VCB'
const ACCOUNT_NAME = 'TAPPY TEST'

beforeEach(() => {
  vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
  vi.stubEnv('SEPAY_WEBHOOK_HMAC_SECRET', HMAC_SECRET)
  vi.stubEnv('SEPAY_BANK_ACCOUNT', BANK_ACCOUNT)
  vi.stubEnv('SEPAY_BANK_CODE', BANK_CODE)
  vi.stubEnv('SEPAY_ACCOUNT_NAME', ACCOUNT_NAME)
  vi.stubEnv('VERCEL_ENV', 'preview')
  rpc.mockReset()
  getUserById.mockReset()
  sendPaymentMail.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/payments/sepay — Webhook gate and authorization', () => {
  it('returns 404 when SUBSCRIPTIONS_ENABLED is off', async () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    const req = new Request('https://t.test/api/payments/sepay', { method: 'POST', body: '{}' })
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 401 when signature header is missing', async () => {
    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 12345 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'unauthorized', message: 'Invalid signature' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 401 when signature is invalid', async () => {
    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sepay-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-sepay-signature': 'sha256=invalidhexsignature0000000000000000000000000000000000000000000000',
      },
      body: JSON.stringify({ id: 12345 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 401 when timestamp is stale (more than 300 seconds skew)', async () => {
    const staleTime = Date.now() - 301 * 1000
    const bank = fakeBank(process.env)
    const { headers, rawBody } = bank.transfer('TAPPYABC123', 179000, {}, staleTime)

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 400 when body is malformed JSON or not a valid SePay payload', async () => {
    // Generate valid signature over non-json body
    const ts = String(Math.floor(Date.now() / 1000))
    const rawBody = 'this-is-not-json'
    const { sepaySignature } = await import('@/lib/payments/sepay')
    const sig = sepaySignature(HMAC_SECRET, ts, rawBody)

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sepay-timestamp': ts,
        'x-sepay-signature': sig,
      },
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_payload')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/sepay — Transaction handling and idempotency', () => {
  it('applies payment via p8_payments_apply_sepay and triggers confirmation email when paid', async () => {
    const bank = fakeBank(process.env)
    const { headers, rawBody } = bank.transfer('TAPPYAB23CD', 179000)

    rpc.mockResolvedValue({
      data: {
        result: 'paid',
        user_id: 'u-12345',
        plan: 'momo',
        code: 'TAPPYAB23CD',
        received_vnd: 179000,
        expires_at: '2026-11-21T00:00:00Z',
      },
      error: null,
    })
    getUserById.mockResolvedValue({
      data: { user: { email: 'subscriber@example.test' } },
      error: null,
    })
    sendPaymentMail.mockResolvedValue(undefined)

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(rpc).toHaveBeenCalledWith('p8_payments_apply_sepay', expect.objectContaining({
      p_code: 'TAPPYAB23CD',
      p_amount: 179000,
      p_transfer_type: 'in',
    }))
    expect(getUserById).toHaveBeenCalledWith('u-12345')
    expect(sendPaymentMail).toHaveBeenCalledWith({
      to: 'subscriber@example.test',
      plan: 'momo',
      amountVnd: 179000,
      code: 'TAPPYAB23CD',
      expiresAt: '2026-11-21T00:00:00Z',
    })
  })

  it('safely handles duplicate webhook replays without double-granting or re-emailing', async () => {
    const bank = fakeBank(process.env)
    const { headers, rawBody } = bank.transfer('TAPPYAB23CD', 179000)

    rpc.mockResolvedValue({
      data: { result: 'duplicate' },
      error: null,
    })

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(getUserById).not.toHaveBeenCalled()
    expect(sendPaymentMail).not.toHaveBeenCalled()
  })

  it('records short transfers as mismatch without granting plan or sending confirmation email', async () => {
    const bank = fakeBank(process.env)
    // Paid 100k instead of 179k
    const { headers, rawBody } = bank.transfer('TAPPYAB23CD', 100000)

    rpc.mockResolvedValue({
      data: { result: 'mismatch', user_id: 'u-12345', plan: 'momo', code: 'TAPPYAB23CD' },
      error: null,
    })

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(sendPaymentMail).not.toHaveBeenCalled()
  })

  it('returns 500 when database RPC fails so SePay retries', async () => {
    const bank = fakeBank(process.env)
    const { headers, rawBody } = bank.transfer('TAPPYAB23CD', 179000)

    rpc.mockResolvedValue({
      data: null,
      error: { code: '50000', message: 'connection timeout' },
    })

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('not_recorded')
    expect(body.message).toMatch(/Temporary failure, retry/)
  })

  it('best-effort email failure does not fail the webhook (status remains 200)', async () => {
    const bank = fakeBank(process.env)
    const { headers, rawBody } = bank.transfer('TAPPYMOMO01', 179000)

    rpc.mockResolvedValue({
      data: {
        result: 'paid',
        user_id: 'u-12345',
        plan: 'momo',
        code: 'TAPPYMOMO01',
        received_vnd: 179000,
        expires_at: '2026-11-21T00:00:00Z',
      },
      error: null,
    })
    getUserById.mockRejectedValue(new Error('Auth admin unreachable'))

    const req = new Request('https://t.test/api/payments/sepay', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
