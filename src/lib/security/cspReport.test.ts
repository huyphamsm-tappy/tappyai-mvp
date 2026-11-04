// Security audit 04/11 (W-05): Report-Only trial of a script policy without 'unsafe-inline', and the privacy-safe handling of its reports.
import { describe, it, expect } from 'vitest'
import { createDedupe, safePath, violationKey, violationsOf } from './cspReport'

describe('violationsOf', () => {
  it('reads the legacy report format and keeps only the directive, what was blocked and the paths', () => {
    const v = violationsOf({
      'csp-report': {
        'document-uri': 'https://www.tappyai.com/chat?token=SECRET#frag',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        'source-file': 'https://www.tappyai.com/_next/static/chunks/main.js?x=1',
        'script-sample': 'window.__secret = "do not log me"',
      },
    })
    expect(v).toEqual([{ directive: 'script-src-elem', blocked: 'inline', page: '/chat', source: 'www.tappyai.com/_next/static/chunks/main.js' }])
    expect(JSON.stringify(v)).not.toMatch(/SECRET|frag|do not log|x=1/)
  })

  it('reads the Reporting API format (an array) and reduces a blocked URL to its host', () => {
    const v = violationsOf([
      { type: 'csp-violation', body: { documentURL: 'https://www.tappyai.com/', effectiveDirective: 'script-src-elem', blockedURL: 'https://evil.example/a.js?k=1', sourceFile: '' } },
      { type: 'deprecation', body: {} },
    ])
    expect(v).toEqual([{ directive: 'script-src-elem', blocked: 'evil.example', page: '/', source: '' }])
  })

  it('names eval, data and blob by kind, and never throws on junk', () => {
    expect(violationsOf({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'eval', 'document-uri': 'https://x.test/a' } })[0].blocked).toBe('eval')
    expect(violationsOf({ 'csp-report': { 'blocked-uri': 'data:text/javascript,alert(1)' } })[0].blocked).toBe('data')
    expect(violationsOf({ 'csp-report': { 'blocked-uri': 'blob:https://x.test/uuid' } })[0].blocked).toBe('blob')
    for (const junk of [null, undefined, 5, 'x', [], [null, 3, 'a'], {}, { 'csp-report': 7 }]) expect(() => violationsOf(junk)).not.toThrow()
    expect(violationsOf('x')).toEqual([])
  })

  it('takes at most 20 violations from one request', () => {
    const many = Array.from({ length: 100 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'inline' } }))
    expect(violationsOf(many)).toHaveLength(20)
  })
})

describe('safePath and the dedupe', () => {
  it('safePath drops origin, query and fragment, and rejects non-URLs', () => {
    expect(safePath('https://a.test/p/q?x=1#y')).toBe('/p/q')
    expect(safePath('not a url')).toBe('')
    expect(safePath(undefined)).toBe('')
  })

  it('logs a violation once until the set is cleared', () => {
    const first = createDedupe(2)
    const k = violationKey({ directive: 'script-src', blocked: 'inline', page: '/', source: '' })
    expect(first(k)).toBe(true)
    expect(first(k)).toBe(false)
    first('b'); first('c') // reaching the cap clears the set
    expect(first(k)).toBe(true)
  })
})

describe('next.config.mjs headers', () => {
  it('enforces the existing policy unchanged and adds a report-only copy whose scripts have no unsafe-inline', async () => {
    const config = (await import('../../../next.config.mjs')).default as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> }
    const all = (await config.headers()).find(r => r.source === '/:path*')!.headers
    const enforced = all.find(h => h.key === 'Content-Security-Policy')!.value
    const reportOnly = all.find(h => h.key === 'Content-Security-Policy-Report-Only')!.value
    const script = (p: string) => p.split('; ').find(d => d.startsWith('script-src'))!
    expect(script(enforced)).toContain("'unsafe-inline'") // the real policy is NOT tightened here
    expect(script(reportOnly)).not.toContain("'unsafe-inline'")
    expect(script(reportOnly)).toContain("'self'")
    expect(reportOnly).toContain('report-uri /api/csp-report')
    expect(reportOnly).not.toContain('upgrade-insecure-requests')
    // every other directive of the real policy is carried over
    for (const d of enforced.split('; ').filter(d => !d.startsWith('script-src') && d !== 'upgrade-insecure-requests')) expect(reportOnly).toContain(d)
  })
})
