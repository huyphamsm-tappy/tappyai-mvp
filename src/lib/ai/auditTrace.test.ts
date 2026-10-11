// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { auditTrace, auditTraceOn, maskForTrace } from './auditTrace'

const AUDIT = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
const PROD = 'https://fwznnobrdctuskgrvuik.supabase.co'

describe('auditTrace gate', () => {
  it('on only with the flag AND the audit project', () => {
    expect(auditTraceOn({ TAPPY_AUDIT_TRACE: '1', NEXT_PUBLIC_SUPABASE_URL: AUDIT })).toBe(true)
    expect(auditTraceOn({ TAPPY_AUDIT_TRACE: '1', NEXT_PUBLIC_SUPABASE_URL: PROD })).toBe(false)
    expect(auditTraceOn({ TAPPY_AUDIT_TRACE: '1' })).toBe(false)
    expect(auditTraceOn({ NEXT_PUBLIC_SUPABASE_URL: AUDIT })).toBe(false)
    expect(auditTraceOn({ TAPPY_AUDIT_TRACE: '0', NEXT_PUBLIC_SUPABASE_URL: AUDIT })).toBe(false)
  })
})

describe('auditTrace output', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
  it('logs nothing when off', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    auditTrace('x', 'delta', { text: 'hi' })
    expect(log).not.toHaveBeenCalled()
  })
  it('logs a sequenced, masked line when on', () => {
    vi.stubEnv('TAPPY_AUDIT_TRACE', '1'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', AUDIT)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    auditTrace('model_step', 'snapshot', { round: 1, text: 'mail a.b@x.com gọi 0912 345 678 mã 12345678901234' })
    auditTrace('compose', 'compose', { composed: 'ok' })
    const [a, b] = log.mock.calls.map(c => JSON.parse(String(c[0])))
    expect(a.type).toBe('tappyai_audit_trace')
    expect(b.seq).toBe(a.seq + 1)
    expect(a.kind).toBe('snapshot')
    expect(a.text).not.toMatch(/a\.b@x\.com|0912 345 678|12345678901234/)
    expect(a.text_len).toBeGreaterThan(10)
    expect(typeof a.ts).toBe('string')
  })
  it('masks an email and a long number', () => {
    const m = maskForTrace('a@b.vn 98765432109 ok')
    expect(m).not.toMatch(/a@b\.vn|98765432109/)
    expect(m).toContain('ok')
  })
})
