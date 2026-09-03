import { describe, it, expect } from 'vitest'
import { clientIp, rateLimit } from '@/lib/security/rateLimit'
import { normalizeIpAddress } from '@/lib/security/addressPolicy'

// ── P3-F1: request identity may not be chosen by the caller ──────────────────
//
// `clientIp()` is the key for twelve public rate limiters AND the value written
// to `audit_log.ip_address`. Both uses are only as sound as the header it reads.
//
// The old implementation returned the LEFTMOST entry of `x-forwarded-for`. On a
// Vercel deployment the request reaches the function through Vercel's proxy, and
// the proxy APPENDS to any XFF the client already sent — so the leftmost entry
// is the one hop nobody verified: the caller's own text. That made every
// IP-keyed quota a function of a string the attacker controls, and made the
// recorded IP of an audited AI write a value the attacker chooses.
//
// The property proven here is not "we parse XFF better". It is:
//
//   NOTHING A CLIENT CAN PUT IN A HEADER CHANGES THE IDENTITY WE DERIVE,
//   and whatever we derive is a syntactically valid IP or nothing at all.
//
// The second half matters as much as the first: `audit_log.ip_address` is INET,
// so a non-IP value makes the INSERT fail. Since `writeAuditLogAwaited` swallows
// that failure, one malformed header used to delete the attacker's own audit row
// — turning a spoofing bug into an audit-evasion bug.

const req = (headers: Record<string, string>) => new Request('https://tappy.ai/api/chat', { headers })

/** What Vercel's proxy actually sets. The client cannot overwrite these. */
const PLATFORM_IP = '203.0.113.7'
const platform = (extra: Record<string, string> = {}) =>
  req({ 'x-vercel-forwarded-for': PLATFORM_IP, 'x-real-ip': PLATFORM_IP, ...extra })

describe('P3-F1 · clientIp cannot be steered by the caller', () => {
  it('uses the platform-set header, not a client-supplied x-forwarded-for', () => {
    expect(clientIp(platform({ 'x-forwarded-for': '1.2.3.4' }))).toBe(PLATFORM_IP)
  })

  it('ignores a spoofed leftmost hop and keeps the entry the proxy appended', () => {
    // No platform header (a non-Vercel/edge path): the RIGHTMOST entry is the one
    // our own trusted proxy wrote; everything to its left is caller-authored.
    const r = req({ 'x-forwarded-for': `9.9.9.9, 8.8.8.8, ${PLATFORM_IP}` })
    expect(clientIp(r)).toBe(PLATFORM_IP)
  })

  it.each([
    ['a bare word', 'not-an-ip'],
    ['SQL-ish text', "1.2.3.4'; DROP TABLE audit_log;--"],
    ['an INET-breaking value', '999.999.999.999'],
    ['an escaped newline injection', '1.2.3.4%0ax-admin:true'],
    ['an ambiguous octal-looking quad', '010.1.1.1'],
    ['a short quad', '1.2.3'],
    ['an empty header', ''],
    ['only commas', ',,,'],
  ])('rejects %s rather than passing it through to an INET column', (_label, value) => {
    const ip = clientIp(req({ 'x-forwarded-for': value }))
    expect(ip).toBe('unknown')
  })

  // A RAW CR/LF never gets as far as clientIp: the runtime's own Headers
  // validation refuses to construct the request. Recorded because it is the
  // reason header-splitting is not in the list above — not because it is safe by
  // our doing.
  it('raw CRLF is refused by the runtime before we ever see it', () => {
    expect(() => req({ 'x-forwarded-for': '1.2.3.4\nx-admin: true' })).toThrow()
  })

  it('accepts a genuine IPv6 address from the platform header', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
  })

  it('returns "unknown" when no trusted header is present at all', () => {
    expect(clientIp(req({}))).toBe('unknown')
  })

  // ── The consequence the finding is actually about ──────────────────────────
  //
  // Not "the parser is wrong" but "the quota is bypassable". Two requests from
  // one caller carrying different forged XFFs must land in the SAME bucket.
  it('a caller rotating x-forwarded-for cannot mint fresh rate-limit buckets', () => {
    const key = `p3f1-bypass-${Math.random()}`
    const LIMIT = 3
    let allowed = 0

    for (let i = 0; i < 20; i++) {
      const forged = req({
        'x-vercel-forwarded-for': PLATFORM_IP,
        'x-forwarded-for': `10.0.0.${i}`, // a different lie every time
      })
      if (rateLimit(`${key}:${clientIp(forged)}`, LIMIT, 60_000).ok) allowed++
    }

    expect(allowed).toBe(LIMIT)
  })

  // ── The property, rather than a list of cases ──────────────────────────────
  //
  // `audit_log.ip_address` is INET. Every value this function can return must be
  // storable there, or the INSERT fails and — because `writeAuditLogAwaited`
  // swallows the failure — the row simply disappears. So the invariant is total:
  // for ANY header content, the output is a valid address or the sentinel that
  // `audit.ts` maps to NULL.
  it('for any header content the result is a valid IP or the NULL sentinel', () => {
    const HOSTILE = [
      '1.2.3.4, , 5.6.7.8', '::ffff:127.0.0.1', '[2001:db8::1]:443', '0:0:0:0:0:ffff:7f00:1',
      '1.2.3.4:8080', 'localhost', '..', '1.2.3.4.5', '-1.-1.-1.-1', '1e2.1.1.1',
      '%00', 'null', 'undefined', '${jndi:ldap://x}', '../../etc/passwd', 'x'.repeat(5000),
      '1.2.3.4;rm -rf /', '<script>alert(1)</script>', '1.2.3.4\tx', '0x7f000001',
      // Non-ASCII is absent on purpose: a header is a ByteString, so the runtime
      // refuses to send one and it can never reach this function.
    ]
    for (const value of HOSTILE) {
      const ip = clientIp(req({ 'x-forwarded-for': value }))
      const storable = ip === 'unknown' || normalizeIpAddress(ip) !== null
      expect(storable, `clientIp returned ${JSON.stringify(ip)} for ${JSON.stringify(value)}`).toBe(true)
    }
  })

  it('two genuinely different callers still get their own bucket', () => {
    const key = `p3f1-distinct-${Math.random()}`
    const a = rateLimit(`${key}:${clientIp(req({ 'x-vercel-forwarded-for': '198.51.100.1' }))}`, 1, 60_000)
    const b = rateLimit(`${key}:${clientIp(req({ 'x-vercel-forwarded-for': '198.51.100.2' }))}`, 1, 60_000)
    expect([a.ok, b.ok]).toEqual([true, true])
  })

  it('unidentifiable callers share one bucket rather than each getting a free one', () => {
    // Fail CLOSED: if we cannot tell who this is, they queue together.
    const key = `p3f1-unknown-${Math.random()}`
    const first = rateLimit(`${key}:${clientIp(req({ 'x-forwarded-for': 'garbage' }))}`, 1, 60_000)
    const second = rateLimit(`${key}:${clientIp(req({ 'x-forwarded-for': 'other-garbage' }))}`, 1, 60_000)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
  })
})
