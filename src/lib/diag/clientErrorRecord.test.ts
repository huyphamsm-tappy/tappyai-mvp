import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildRecord, redact, DIAG_KEY, DIAG_MAX } from './clientErrorRecord'

// Guards on the TEMPORARY diagnostic. Its whole justification is that it is safe and passive:
// it must never leak a credential, never change behaviour, and never itself become a bug.
// These do not claim the P0 is fixed — the diagnostic only observes it.

const src = (f: string) => readFileSync(f, 'utf8')
/** Source with comments stripped, so a comment *describing* a forbidden call cannot trip a check
 *  (the same convention `consultative/architectureLock.test.ts` uses). */
const code = (f: string) => src(f)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('redaction — a captured stack must never carry a credential', () => {
  it('redacts the Zalo access token from the finish-page fragment', () => {
    // The real shape: /auth/zalo-finish#at=<token>&next=/
    const out = redact('at https://www.tappyai.com/auth/zalo-finish#at=AbCdEf123456789&next=/')
    expect(out).not.toContain('AbCdEf123456789')
    expect(out).toContain('at=[REDACTED]')
  })

  it('redacts the magic-link token_hash from the confirm URL', () => {
    const out = redact('/auth/confirm?token_hash=pkce_9f8e7d6c5b4a3210&type=magiclink')
    expect(out).not.toContain('pkce_9f8e7d6c5b4a3210')
    expect(out).toContain('token_hash=[REDACTED]')
  })

  it('redacts a bare JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'
    const out = redact(`Error: bad session ${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('[REDACTED_JWT]')
  })

  it('redacts long opaque runs that could be tokens', () => {
    const blob = 'A'.repeat(64)
    expect(redact(`x ${blob} y`)).not.toContain(blob)
  })

  it('leaves ordinary stack text readable — the diagnostic must stay useful', () => {
    const stack = "TypeError: Cannot read properties of undefined (reading 'id')\n    at HomeView (/_next/static/chunks/app/page-3f2a.js:1:2345)"
    const out = redact(stack)
    expect(out).toContain("Cannot read properties of undefined (reading 'id')")
    expect(out).toContain('HomeView')
  })

  it('never throws on odd input', () => {
    expect(() => redact(undefined as unknown as string)).not.toThrow()
    expect(() => redact('')).not.toThrow()
  })
})

describe('the record has a closed shape — no free-form payload', () => {
  it('captures only the declared fields', () => {
    const rec = buildRecord({
      kind: 'error', name: 'TypeError', message: 'boom', stack: 'at X',
      pathname: '/chat', visibility: 'visible', authed: true, at: '2026-08-28T00:00:00.000Z',
    })
    expect(Object.keys(rec).sort()).toEqual(
      ['at', 'authed', 'kind', 'message', 'name', 'pathname', 'stack', 'visibility'].sort(),
    )
  })

  it('drops the query string — a user question in ?q= must never be recorded', () => {
    const rec = buildRecord({ kind: 'error', pathname: '/chat?q=quán hủ tiếu Phú Nhuận&category=food' })
    expect(rec.pathname).toBe('/chat')
    expect(rec.pathname).not.toContain('hủ tiếu')
  })

  it('authed is a boolean, never an identity', () => {
    expect(buildRecord({ kind: 'error', authed: true }).authed).toBe(true)
    expect(buildRecord({ kind: 'error' }).authed).toBe(false)
    expect(typeof buildRecord({ kind: 'error', authed: true }).authed).toBe('boolean')
  })

  it('coerces missing fields instead of throwing', () => {
    expect(() => buildRecord({ kind: 'unhandledrejection' })).not.toThrow()
  })
})

describe('the diagnostic is passive and self-contained', () => {
  const comp = code('src/components/ClientErrorDiag.tsx')
  const page = code('src/app/diag/page.tsx')

  it('never suppresses the error — no preventDefault, no ErrorBoundary', () => {
    expect(comp).not.toContain('preventDefault')
    expect(comp).not.toContain('componentDidCatch')
    expect(comp).not.toContain('ErrorBoundary')
    expect(comp).not.toMatch(/\bwindow\.onerror\s*=/)
  })

  it('sends nothing anywhere — no network of any kind', () => {
    for (const s of [comp, page]) {
      expect(s).not.toContain('fetch(')
      expect(s).not.toContain('XMLHttpRequest')
      expect(s).not.toContain('sendBeacon')
      expect(s).not.toContain('WebSocket')
    }
  })

  it('records no secret-bearing values', () => {
    // It may READ document.cookie to derive a boolean, but must never store the cookie itself.
    expect(comp).not.toMatch(/message:\s*document\.cookie|stack:\s*document\.cookie/)
    expect(comp).not.toContain('localStorage')
    expect(comp).toContain('authed()')
  })

  it('removes its listeners on unmount', () => {
    expect(comp).toContain("removeEventListener('error'")
    expect(comp).toContain("removeEventListener('unhandledrejection'")
  })

  it('renders nothing, so it cannot affect layout or hydration', () => {
    expect(comp).toContain('return null')
  })

  it('every storage write is guarded, so the diagnostic cannot become a second bug', () => {
    expect(comp).toMatch(/catch\s*\{/)
  })

  it('is bounded, so it cannot fill storage', () => {
    expect(DIAG_MAX).toBeLessThanOrEqual(50)
    expect(comp).toContain('DIAG_MAX')
    expect(DIAG_KEY).toBe('tappy_diag_v1')
  })
})

describe('removable in one commit', () => {
  it('lives entirely in files whose names mark it as diagnostic', () => {
    // The whole feature is: two diag files + one component + one route + this test. Deleting
    // them and the single <ClientErrorDiag /> line in the layout removes it completely.
    const layout = src('src/app/layout.tsx')
    const mounts = layout.split('\n').filter(l => l.includes('ClientErrorDiag'))
    expect(mounts.length).toBe(2) // the import and the single mount
  })
})
