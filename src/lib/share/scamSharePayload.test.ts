import { describe, it, expect } from 'vitest'
import { buildScamSharePayload, publicUrlForm, scamShareSummary } from './scamSharePayload'
import { validateSharedResultPayload, findForbiddenKey } from './sharedResult'
import type { CheckResult } from '@/lib/scam-shield/types'

// The wedge artifact: a Scam Shield verdict as a public page. What must hold:
// the page is built ONLY from the deterministic check, never republishes a
// tracking/victim token from the checked URL, and passes the same validator
// every other public payload passes.

const result: CheckResult = {
  inputType: 'url',
  url: 'https://vietcombank-secure-login.xyz/verify?token=ABC123&uid=victim%40example.com',
  risk: { score: 92, confidence: 88, level: 'CRITICAL' },
  evidence: {
    items: [
      { source: 'Google Web Risk', category: 'reputation', finding: 'SOCIAL_ENGINEERING', severity: 'critical', summary: 'Flagged as social engineering', detail: 'raw provider payload…', dataPoints: { raw: { threat: 'x' } } },
      { source: 'Domain age', category: 'domain', finding: 'new_domain', severity: 'warning', summary: 'Registered 3 days ago', detail: 'whois dump', dataPoints: {} },
      { source: 'SSL', category: 'transport', finding: 'valid', severity: 'safe', summary: 'Certificate valid', detail: '', dataPoints: {} },
    ],
    summary: { criticalCount: 1, warningCount: 1, safeCount: 1, totalSources: 5, respondedSources: 4 },
  },
  officialMatch: { id: 'vcb', brand: 'Vietcombank', category: 'bank', domains: ['vietcombank.com.vn'], website: 'https://www.vietcombank.com.vn', hotline: '1900545413' },
  actions: [{ priority: 'primary', action: 'do_not_enter_credentials', label_vi: 'Không nhập thông tin', label_en: 'Do not enter details', icon: 'x' }],
  checkedAt: 1_757_700_000_000,
  cached: false,
} as unknown as CheckResult

describe('scam share payload', () => {
  const payload = buildScamSharePayload(result, 'vi', new Date('2026-09-18T00:00:00Z'))

  it('is a valid public payload of kind scam_check in the scam domain', () => {
    expect(validateSharedResultPayload(payload)).toBeNull()
    expect(payload.kind).toBe('scam_check')
    expect(payload.domain).toBe('scam')
    expect(findForbiddenKey(payload)).toBeNull()
  })

  it('never republishes the checked URL query — a tracking or victim token stays private', () => {
    const json = JSON.stringify(payload)
    expect(json).not.toContain('token=ABC123')
    expect(json).not.toContain('victim')
    expect(json).toContain('vietcombank-secure-login.xyz/verify')
    expect(publicUrlForm('https://a.b/c?x=1#f')).toEqual({ host: 'a.b', display: 'a.b/c' })
    expect(publicUrlForm('not a url')).toEqual({ host: 'link', display: 'link' })
  })

  it('carries the verdict, the source tally, and only critical/warning evidence summaries — never detail/raw', () => {
    expect(payload.title).toBe('Kiểm tra lừa đảo: vietcombank-secure-login.xyz/verify — Rất nguy hiểm')
    expect(payload.body).toContain('**Kết luận: Rất nguy hiểm** (điểm rủi ro 92/100, độ tin cậy 88%)')
    expect(payload.body).toContain('4/5 nguồn')
    expect(payload.body).toContain('Flagged as social engineering')
    expect(payload.body).toContain('Registered 3 days ago')
    expect(payload.body).not.toContain('Certificate valid') // safe items are tallied, not listed
    expect(payload.body).not.toContain('raw provider payload')
    expect(payload.body).not.toContain('whois dump')
  })

  it('links the official site as the one button when a brand match exists', () => {
    expect(payload.buttons).toEqual([{ label: '🌐 Trang chính thức Vietcombank', type: 'website', url: 'https://www.vietcombank.com.vn', primary: true }])
    expect(payload.body).toContain('Trang chính thức của **Vietcombank**')
  })

  it('renders English when asked, and is deterministic', () => {
    const en = buildScamSharePayload(result, 'en', new Date('2026-09-18T00:00:00Z'))
    expect(en.title).toBe('Scam check: vietcombank-secure-login.xyz/verify — Very dangerous')
    expect(en.suggestedQuestions[0]).toMatch(/signs of a scam/)
    expect(buildScamSharePayload(result, 'vi', new Date('2026-09-18T00:00:00Z'))).toEqual(payload)
  })

  it('has no images (nothing to fetch, nothing to host) and no model involvement', () => {
    expect(payload.images).toEqual([])
    expect(scamShareSummary(result)).toEqual({ host: 'vietcombank-secure-login.xyz', level: 'CRITICAL' })
  })

  it('handles a safe verdict without an official match', () => {
    const safe = buildScamSharePayload({ ...result, url: 'https://tiki.vn', risk: { score: 3, confidence: 95, level: 'SAFE' }, officialMatch: null, evidence: { items: [], summary: { criticalCount: 0, warningCount: 0, safeCount: 4, totalSources: 5, respondedSources: 4 } } }, 'vi')
    expect(validateSharedResultPayload(safe)).toBeNull()
    expect(safe.title).toBe('Kiểm tra lừa đảo: tiki.vn — An toàn')
    expect(safe.buttons).toEqual([])
    expect(safe.body).not.toContain('## Bằng chứng')
  })
})
