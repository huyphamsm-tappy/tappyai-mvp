import { describe, expect, it, vi } from 'vitest'
import { constantTimeEqual, extractOrderCode, parseSepayTransaction, sepayAuthorized, sepayBankConfig, sepayQrUrl, sepayTransferType,
  checkSepaySignature, sepayAuthMode, sepaySignature, sepaySourceAllowed, SEPAY_WEBHOOK_IPS } from './sepay'
import { paymentMailContent, sendPaymentMail } from './mail'

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv

describe('SePay helpers', () => {
  it('finds the order code in `code`, then in the content, case-insensitively', () => {
    expect(extractOrderCode({ code: 'TAPPYAB23CD' })).toBe('TAPPYAB23CD')
    expect(extractOrderCode({ code: null, content: 'MBVCB.123.tappyab23cd chuyen tien' })).toBe('TAPPYAB23CD')
    expect(extractOrderCode({ content: 'IBFT TAPPYAB23CD-thanh toan' })).toBe('TAPPYAB23CD')
    // look-alike characters are never part of a code
    expect(extractOrderCode({ content: 'TAPPY0O1I00' })).toBeNull()
    expect(extractOrderCode({ content: 'chuyen tien' })).toBeNull()
  })

  it('accepts only `Apikey <key>`, in constant time', () => {
    const e = env({ SEPAY_WEBHOOK_API_KEY: 'k-123' })
    expect(sepayAuthorized('Apikey k-123', e)).toBe(true)
    expect(sepayAuthorized('Apikey k-124', e)).toBe(false)
    expect(sepayAuthorized('Apikey k-1234', e)).toBe(false)
    expect(sepayAuthorized('k-123', e)).toBe(false)
    expect(sepayAuthorized(null, e)).toBe(false)
    expect(sepayAuthorized('Apikey ', env({}))).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })

  it('validates the webhook body', () => {
    expect(parseSepayTransaction({ id: 1, transferType: 'in', transferAmount: 25000, content: 'TAPPYAB23CD' }))
      .toMatchObject({ id: 1, transferAmount: 25000, code: 'TAPPYAB23CD' })
    expect(parseSepayTransaction({ id: '77', transferType: 'in', transferAmount: '1000' })).toMatchObject({ id: 77, transferAmount: 1000 })
    expect(parseSepayTransaction({ transferType: 'in', transferAmount: 1 })).toBeNull()
    expect(parseSepayTransaction({ id: 1, transferAmount: 1 })).toBeNull()
    expect(parseSepayTransaction('nope')).toBeNull()
  })

  it('needs the whole receiving account, and builds the SePay QR', () => {
    expect(sepayBankConfig(env({ SEPAY_BANK_ACCOUNT: '1', SEPAY_BANK_CODE: 'MBBank' }))).toBeNull()
    const bank = sepayBankConfig(env({ SEPAY_BANK_ACCOUNT: '0011', SEPAY_BANK_CODE: 'MBBank', SEPAY_ACCOUNT_NAME: 'A B' }))!
    expect(sepayQrUrl(bank, 25000, 'TAPPYAB23CD')).toBe('https://qr.sepay.vn/img?acc=0011&bank=MBBank&amount=25000&des=TAPPYAB23CD')
  })
})

describe('payment mail', () => {
  const m = { to: 'a@b.test', plan: 'momo' as const, amountVnd: 179000, code: 'TAPPYAB23CD', expiresAt: '2026-10-27T10:00:00Z' }

  it('is plain Vietnamese with the plan, amount and expiry', () => {
    const c = paymentMailContent(m)
    expect(c.subject).toContain('Momo')
    expect(c.text).toContain('179.000đ')
    expect(c.text).toContain('27/10/2026')
  })

  it('is skipped without Brevo settings, and never throws', async () => {
    const f = vi.fn()
    expect(await sendPaymentMail(m, env({}), f as unknown as typeof fetch)).toBe('skipped')
    expect(f).not.toHaveBeenCalled()
    const boom = vi.fn().mockRejectedValue(new Error('down'))
    expect(await sendPaymentMail(m, env({ BREVO_API_KEY: 'x', PAYMENTS_MAIL_FROM: 'no-reply@tappyai.com' }), boom as unknown as typeof fetch)).toBe('failed')
    const ok = vi.fn().mockResolvedValue({ ok: true })
    expect(await sendPaymentMail(m, env({ BREVO_API_KEY: 'x', PAYMENTS_MAIL_FROM: 'no-reply@tappyai.com' }), ok as unknown as typeof fetch)).toBe('sent')
    expect(ok.mock.calls[0][1].headers['api-key']).toBe('x')
  })
})

describe('sepayTransferType (P8-17: fail closed)', () => {
  it('only an incoming transfer to our configured account counts', () => {
    expect(sepayTransferType({ transferType: 'in', accountNumber: '0123' }, '0123')).toBe('in')
    expect(sepayTransferType({ transferType: 'in', accountNumber: '9999' }, '0123')).toBe('other_account')
    expect(sepayTransferType({ transferType: 'in', accountNumber: null }, '0123')).toBe('other_account')
    expect(sepayTransferType({ transferType: 'in', accountNumber: '0123' }, null)).toBe('other_account')
    expect(sepayTransferType({ transferType: 'out', accountNumber: '0123' }, '0123')).toBe('out')
  })
})

describe('SePay HMAC-SHA256 (default auth)', () => {
  const env = { SEPAY_WEBHOOK_HMAC_SECRET: 'test-secret-0123456789' } as unknown as NodeJS.ProcessEnv
  const now = 1_790_000_000_000
  const ts = String(now / 1000)
  const raw = '{"id":1,"transferType":"in","transferAmount":29000,"code":"TAPPYAB23CD"}'
  const sig = sepaySignature('test-secret-0123456789', ts, raw)

  it('signs "<timestamp>.<raw body>" as sha256=<hex>', () => {
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(checkSepaySignature(raw, sig, ts, env, now)).toBe('ok')
    expect(checkSepaySignature(raw, sig.toUpperCase().replace('SHA256=', 'sha256='), ts, env, now)).toBe('ok')
  })
  it('wrong signature, body changed by one byte, other timestamp → bad_signature', () => {
    expect(checkSepaySignature(raw, 'sha256=' + '0'.repeat(64), ts, env, now)).toBe('bad_signature')
    expect(checkSepaySignature(raw.replace('29000', '2900'), sig, ts, env, now)).toBe('bad_signature')
    expect(checkSepaySignature(raw + ' ', sig, ts, env, now)).toBe('bad_signature')
    expect(checkSepaySignature(raw, sig, String(Number(ts) + 1), env, now)).toBe('bad_signature')
  })
  it('timestamp more than 5 minutes old or ahead → stale', () => {
    expect(checkSepaySignature(raw, sig, ts, env, now + 301_000)).toBe('stale')
    expect(checkSepaySignature(raw, sig, ts, env, now - 301_000)).toBe('stale')
    expect(checkSepaySignature(raw, sig, ts, env, now + 299_000)).toBe('ok')
  })
  it('fails closed without a secret or headers', () => {
    expect(checkSepaySignature(raw, sig, ts, {} as NodeJS.ProcessEnv, now)).toBe('no_secret')
    expect(checkSepaySignature(raw, null, ts, env, now)).toBe('missing')
    expect(checkSepaySignature(raw, sig, null, env, now)).toBe('missing')
    expect(checkSepaySignature(raw, sig, '17900e5', env, now)).toBe('missing')
  })
  it('HMAC is the default; Apikey only when chosen', () => {
    expect(sepayAuthMode({} as NodeJS.ProcessEnv)).toBe('hmac')
    expect(sepayAuthMode({ SEPAY_WEBHOOK_AUTH_MODE: 'apikey' } as unknown as NodeJS.ProcessEnv)).toBe('apikey')
    expect(sepayAuthMode({ SEPAY_WEBHOOK_AUTH_MODE: 'none' } as unknown as NodeJS.ProcessEnv)).toBe('hmac')
  })
  it('optional source-IP allowlist uses the platform address, not X-Forwarded-For', () => {
    const h = (o: Record<string, string>) => new Headers(o)
    expect(sepaySourceAllowed(h({}), {} as NodeJS.ProcessEnv)).toBe(true) // off by default
    const on = { SEPAY_WEBHOOK_IP_ALLOWLIST: 'sepay' } as unknown as NodeJS.ProcessEnv
    expect(sepaySourceAllowed(h({ 'x-real-ip': SEPAY_WEBHOOK_IPS[0] }), on)).toBe(true)
    expect(sepaySourceAllowed(h({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': SEPAY_WEBHOOK_IPS[0] }), on)).toBe(false)
    expect(sepaySourceAllowed(h({}), on)).toBe(false)
  })
})
