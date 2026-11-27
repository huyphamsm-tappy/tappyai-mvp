import { describe, it, expect, vi, beforeEach } from 'vitest'

// The real 'scam.check' adapter: the SAME link check the web uses (lib/scam-shield checkUrl), turned into one allowlist-ready row.
// Public vocabulary only (familiar / suspicious / unrecognized); safe-looking levels become "unrecognized", which says in words that this is NOT "safe".

const h = vi.hoisted(() => ({ checkUrl: vi.fn() }))
vi.mock('@/lib/scam-shield', () => ({ checkUrl: h.checkUrl }))

import { realAdapters } from './defaultDeps'

const item = (severity: string, over: Record<string, unknown> = {}) => ({
  source: 'whois', category: 'domain_registration', finding: 'young', severity, summary: `summary ${severity}`, detail: 'd', dataPoints: {}, reason_vi: `lý do ${severity}`, reason_en: `reason ${severity}`, ...over,
})
const result = (level: string, over: Record<string, unknown> = {}) => ({
  inputType: 'url', url: 'https://vietcombank-secure.example/login?token=abc', risk: { score: 90, confidence: 0.9, level },
  evidence: { items: [item('safe'), item('info'), item('warning'), item('critical')], summary: { criticalCount: 1, warningCount: 1, safeCount: 1, totalSources: 4, respondedSources: 4 } },
  officialMatch: null, actions: [{ priority: 'primary', action: 'dont_enter_otp', label_vi: 'Không nhập OTP', label_en: "Don't enter an OTP", icon: 'x' }, { priority: 'secondary', action: 'open_official', label_vi: 'Tự mở website chính thức', label_en: 'Open the official site yourself', icon: 'y' }],
  checkedAt: 1, cached: false, ...over,
})
const call = (query: string, lang: 'vi' | 'en' = 'vi') => realAdapters({})['scam.check']!({ query, lang, limit: 1 })

beforeEach(() => h.checkUrl.mockReset())

describe("realAdapters()['scam.check']", () => {
  it('is wired (the engine is internal; no key of its own)', () => {
    expect(realAdapters({})['scam.check']).toBeTypeOf('function')
  })

  it('a HIGH link becomes "familiar" with the Vietnamese verdict text, only warning/critical signals (critical first), the actions as next steps, and the host only (no path, no query)', async () => {
    h.checkUrl.mockResolvedValue(result('HIGH'))
    const { rows } = await call('vietcombank-secure.example/login?token=abc')
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, any>
    expect(r.verdict).toBe('familiar')
    expect(r.target).toBe('vietcombank-secure.example')
    expect(r.verdict_title).toMatch(/link giả mạo/)
    expect(r.summary).toMatch(/không phải kết luận về một tổ chức/)
    expect(r.signals).toEqual(['lý do critical', 'lý do warning'])
    expect(r.next_steps).toEqual(['Không nhập OTP', 'Tự mở website chính thức'])
    expect(JSON.stringify(r)).not.toMatch(/token=abc|\/login/)
  })

  it('English text when asked', async () => {
    h.checkUrl.mockResolvedValue(result('MEDIUM'))
    const r = (await call('x.example', 'en')).rows[0] as Record<string, any>
    expect(r.verdict).toBe('suspicious')
    expect(r.signals).toEqual(['reason critical', 'reason warning'])
    expect(r.next_steps).toEqual(["Don't enter an OTP", 'Open the official site yourself'])
    expect(r.verdict_title).not.toMatch(/[ạăâêôơư]/)
  })

  it.each(['SAFE', 'LOW', 'INCONCLUSIVE'])('🚨 %s is never reported as safe: it is "unrecognized", and the text says that is NOT the same as safe', async level => {
    h.checkUrl.mockResolvedValue(result(level))
    const r = (await call('x.example')).rows[0] as Record<string, any>
    expect(r.verdict).toBe('unrecognized')
    expect(r.summary).toMatch(/KHÔNG có nghĩa là an toàn/)
  })

  it('a link that resembles an official brand carries the brand, its official site and hotline (and no claim about the link\'s owner)', async () => {
    h.checkUrl.mockResolvedValue(result('HIGH', { officialMatch: { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://www.vietcombank.com.vn', hotline: '1900 54 54 13' } }))
    const r = (await call('vietcombank-secure.example')).rows[0] as Record<string, any>
    expect(r).toMatchObject({ resembles_brand: 'Vietcombank', official_site: 'https://www.vietcombank.com.vn', official_hotline: '1900 54 54 13' })
  })

  it('a link the engine refuses (private/internal address) yields NO row; any other failure is thrown for the gateway to report', async () => {
    h.checkUrl.mockRejectedValueOnce(new Error('URL is not allowed (private/internal network)'))
    expect((await call('10.0.0.5')).rows).toEqual([])
    h.checkUrl.mockRejectedValueOnce(new TypeError('Invalid URL'))
    expect((await call('not a url')).rows).toEqual([])
    h.checkUrl.mockRejectedValueOnce(new Error('providers exploded'))
    await expect(call('x.example')).rejects.toThrow()
  })
})
