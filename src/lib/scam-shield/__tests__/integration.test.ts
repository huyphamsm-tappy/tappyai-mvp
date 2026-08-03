import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../cache/redisCache', () => ({
  getCachedSignals: vi.fn().mockResolvedValue(new Map()),
  setCachedSignal: vi.fn().mockResolvedValue(undefined),
  getCachedDirectory: vi.fn().mockResolvedValue(null),
  setCachedDirectory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../providers/webRisk', () => ({
  webRiskProvider: {
    id: 'webRisk',
    name: 'Google Web Risk (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'webRisk', status: 'completed',
      finding: 'CLEAN', severity: 'safe', weight: 0,
      detail: 'No threats detected',
    }),
  },
}))

vi.mock('../providers/whois', () => ({
  whoisProvider: {
    id: 'whois',
    name: 'WHOIS (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'whois', status: 'completed',
      finding: 'ESTABLISHED', severity: 'safe', weight: 0,
      detail: 'Domain registered 3000 days ago',
      raw: { ageDays: 3000, registrar: 'MockRegistrar' },
    }),
  },
}))

vi.mock('../providers/dns', () => ({
  dnsProvider: {
    id: 'dns',
    name: 'DNS (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'dns', status: 'completed',
      finding: 'HAS_RECORDS', severity: 'safe', weight: 0,
      detail: 'DNS records found',
    }),
  },
}))

vi.mock('../providers/ssl', () => ({
  sslProvider: {
    id: 'ssl',
    name: 'SSL (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'ssl', status: 'completed',
      finding: 'VALID', severity: 'safe', weight: 0,
      detail: 'Valid SSL certificate',
    }),
  },
}))

vi.mock('../providers/redirect', () => ({
  redirectProvider: {
    id: 'redirect',
    name: 'Redirect (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'redirect', status: 'completed',
      finding: 'NO_REDIRECTS', severity: 'safe', weight: 0,
      detail: 'No redirects',
    }),
  },
}))

vi.mock('../providers/blocklist', () => ({
  blocklistProvider: {
    id: 'blocklist',
    name: 'Blocklist (mock)',
    isConfigured: () => true,
    check: vi.fn().mockResolvedValue({
      provider: 'blocklist', status: 'completed',
      finding: 'NOT_LISTED', severity: 'safe', weight: 0,
      detail: 'Not on blocklist',
    }),
  },
}))

import { checkUrl } from '../index'
import { webRiskProvider } from '../providers/webRisk'

describe('checkUrl integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns SAFE for a clean URL', async () => {
    const result = await checkUrl('https://example.com')
    expect(result.inputType).toBe('url')
    expect(result.url).toBe('https://example.com/')
    expect(result.risk.level).toBe('SAFE')
    expect(result.risk.score).toBe(0)
    expect(result.risk.confidence).toBe(100)
    expect(result.evidence.items.length).toBeGreaterThan(0)
    expect(result.actions[0].action).toBe('LIKELY_SAFE')
    expect(result.checkedAt).toBeGreaterThan(0)
  })

  it('auto-prefixes https for bare domains', async () => {
    const result = await checkUrl('example.com')
    expect(result.url).toBe('https://example.com/')
  })

  it('returns HIGH/CRITICAL when webRisk flags a threat', async () => {
    vi.mocked(webRiskProvider.check).mockResolvedValueOnce({
      provider: 'webRisk', status: 'completed',
      finding: 'SOCIAL_ENGINEERING', severity: 'critical',
      weight: 40, detail: 'Flagged by Google Web Risk',
    })
    const result = await checkUrl('https://phishing-site.com')
    expect(result.risk.score).toBe(40)
    expect(result.risk.level).toBe('MEDIUM')
    expect(result.actions[0].action).toBe('PROCEED_WITH_CAUTION')
  })

  it('rejects private/internal URLs', async () => {
    await expect(checkUrl('https://192.168.1.1')).rejects.toThrow('private')
  })

  it('rejects loopback URLs', async () => {
    await expect(checkUrl('https://127.0.0.1')).rejects.toThrow()
  })

  it('upgrades http to https', async () => {
    const result = await checkUrl('http://example.com')
    expect(result.url).toContain('https://')
  })

  it('includes officialMatch for directory entries', async () => {
    const result = await checkUrl('https://vietcombank.com.vn')
    expect(result.officialMatch).not.toBeNull()
    expect(result.officialMatch?.brand).toBe('Vietcombank')
  })

  it('returns null officialMatch for unknown domains', async () => {
    const result = await checkUrl('https://random-site.xyz')
    expect(result.officialMatch).toBeNull()
  })
})
