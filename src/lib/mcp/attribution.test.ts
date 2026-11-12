import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { ATTRIBUTION_HOSTS, attributionConfig, buildTrackedLink, channelOf, destinationAllowed, signToken, verifyToken, type LinkPayload } from './attribution'

const SECRET = 'test-secret-test-secret-test-secret-0123456789'
const NOW = new Date('2026-11-12T03:00:00Z')
const BASE = 'https://tappy.example'
const mk = (o: Partial<LinkPayload> = {}): LinkPayload => ({ v: 1, ch: 'claude_mcp', tool: 'search_hotels', ref: 'abcdef123456', dest: 'https://www.agoda.com/hotel/x', iat: Math.floor(NOW.getTime() / 1000), ...o })
const DAY = 86_400_000

describe('destination allowlist (no open redirect)', () => {
  it('accepts https URLs on an allowlisted host or its subdomain, and returns the normalised URL', () => {
    expect(destinationAllowed('https://www.agoda.com/hotel/x?a=1')).toBe('https://www.agoda.com/hotel/x?a=1')
    expect(destinationAllowed('https://agoda.com/x')).toBe('https://agoda.com/x')
    expect(ATTRIBUTION_HOSTS.length).toBeGreaterThan(0)
  })
  it('refuses http, other hosts, look-alike hosts, credentials, protocol-relative, javascript: and junk', () => {
    for (const bad of ['http://www.agoda.com/x', 'https://evil.example/x', 'https://agoda.com.evil.example/x', 'https://notagoda.com/x', 'https://user:pw@agoda.com/x', '//agoda.com/x', 'javascript:alert(1)', 'data:text/html,x', '', 'agoda.com', 42 as never, null as never, 'https://agoda.com:8443/x']) expect(destinationAllowed(bad), String(bad)).toBeNull()
  })
})

describe('signed tracking token', () => {
  it('round-trips and carries only source/channel attribution: no person, account or location field exists', () => {
    const t = signToken(mk(), SECRET)
    const p = verifyToken(t, SECRET, NOW)!
    expect(p).toEqual(mk())
    expect(Object.keys(p).sort()).toEqual(['ch', 'dest', 'iat', 'ref', 'tool', 'v'])
    expect(JSON.stringify(p)).not.toMatch(/user|principal|account|email|lat|lng|install/i)
  })
  it('a tampered payload, a wrong secret, a truncated or malformed token, or a swapped signature is refused', () => {
    const t = signToken(mk(), SECRET); const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify(mk({ dest: 'https://www.agoda.com/other' }))).toString('base64url')
    for (const bad of [`${forged}.${sig}`, signToken(mk(), 'another-secret-another-secret-another-0123456'), body, `${body}.`, '', 'a.b.c', `${body}.${sig.slice(0, -2)}AA`]) expect(verifyToken(bad, SECRET, NOW), bad.slice(0, 20)).toBeNull()
  })
  it('expires after the validity window and refuses an issue time in the future', () => {
    const t = signToken(mk(), SECRET)
    expect(verifyToken(t, SECRET, new Date(NOW.getTime() + 89 * DAY))).not.toBeNull()
    expect(verifyToken(t, SECRET, new Date(NOW.getTime() + 91 * DAY))).toBeNull()
    expect(verifyToken(t, SECRET, new Date(NOW.getTime() - 2 * DAY))).toBeNull()
  })
  it('a signed token whose destination is off the allowlist is refused at verification too (an allowlist change takes effect on old links)', () => {
    const t = signToken(mk({ dest: 'https://evil.example/x' }), SECRET)
    expect(verifyToken(t, SECRET, NOW)).toBeNull()
  })
  it('extra or missing payload fields and a wrong version are refused', () => {
    const sign = (o: Record<string, unknown>) => { const body = Buffer.from(JSON.stringify(o)).toString('base64url'); return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}` }
    expect(verifyToken(sign({ ...mk(), user: 'u1' }), SECRET, NOW)).toBeNull()
    expect(verifyToken(sign({ ...mk(), v: 2 }), SECRET, NOW)).toBeNull()
    const { ref: _r, ...noRef } = mk(); expect(verifyToken(sign(noRef), SECRET, NOW)).toBeNull()
    expect(verifyToken(sign({ ...mk(), ch: 'whatever' }), SECRET, NOW)).toBeNull()
  })
})

describe('building links', () => {
  it('builds /go/m/<token> on the configured base; the Host channel comes from the verified Host, not from input', () => {
    const l = buildTrackedLink({ baseUrl: BASE, secret: SECRET, host: 'chatgpt', tool: 'search_hotels', ref: 'r1', dest: 'https://www.agoda.com/hotel/x', now: NOW })!
    expect(l.startsWith(`${BASE}/go/m/`)).toBe(true)
    expect(verifyToken(l.slice(`${BASE}/go/m/`.length), SECRET, NOW)).toMatchObject({ ch: 'chatgpt_mcp', tool: 'search_hotels', dest: 'https://www.agoda.com/hotel/x' })
    expect([channelOf('claude'), channelOf('chatgpt'), channelOf('gemini')]).toEqual(['claude_mcp', 'chatgpt_mcp', 'gemini_mcp'])
  })
  it('no link without a secret, without a base, or for a destination that is not allowed (the original URL stays the only link)', () => {
    const base = { baseUrl: BASE, secret: SECRET, host: 'claude' as const, tool: 'search_hotels', ref: 'r1', dest: 'https://www.agoda.com/x', now: NOW }
    expect(buildTrackedLink({ ...base, secret: '' })).toBeNull(); expect(buildTrackedLink({ ...base, baseUrl: '' })).toBeNull()
    expect(buildTrackedLink({ ...base, dest: 'https://evil.example/x' })).toBeNull()
  })
  it('configuration needs a long secret and an https base; otherwise null (fail closed: no links, no redirects)', () => {
    expect(attributionConfig({})).toBeNull()
    expect(attributionConfig({ MCP_ATTRIBUTION_SECRET: 'short', MCP_RESOURCE_URL: 'https://mcp.example/api/mcp' })).toBeNull()
    expect(attributionConfig({ MCP_ATTRIBUTION_SECRET: SECRET, MCP_RESOURCE_URL: 'http://mcp.example/api/mcp' })).toBeNull()
    expect(attributionConfig({ MCP_ATTRIBUTION_SECRET: SECRET, MCP_RESOURCE_URL: 'https://mcp.example/api/mcp' })).toEqual({ secret: SECRET, baseUrl: 'https://mcp.example' })
  })
})

describe('source attribution is not transaction identity (ADR-CONN-021)', () => {
  it('User A creates a link, User B opens it: the link resolves identically for anyone and carries nothing about A, so a transaction cannot be assigned to A through it', () => {
    const link = buildTrackedLink({ baseUrl: BASE, secret: SECRET, host: 'claude', tool: 'search_hotels', ref: 'r1', dest: 'https://www.agoda.com/hotel/x', now: NOW })!
    const token = link.slice(`${BASE}/go/m/`.length)
    const asB = verifyToken(token, SECRET, NOW)!
    expect(asB).toEqual(verifyToken(token, SECRET, NOW))
    expect(Object.keys(asB)).not.toContain('user'); expect(JSON.stringify(asB)).not.toMatch(/u:|a:[0-9a-f]{8}/)
  })
})
