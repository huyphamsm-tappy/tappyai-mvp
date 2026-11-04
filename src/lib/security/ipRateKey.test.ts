// Security audit 04/11 (W-02/W-03): the limiters that guard spend key an IPv6 caller by its /64 prefix, not by the full address.
import { describe, it, expect } from 'vitest'
import { ipRateKey, clientIpKey } from './rateLimit'

describe('ipRateKey', () => {
  it('IPv4, unknown and IPv4-mapped addresses are left as they are', () => {
    expect(ipRateKey('203.0.113.7')).toBe('203.0.113.7')
    expect(ipRateKey('unknown')).toBe('unknown')
    expect(ipRateKey('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7')
  })

  it('two addresses of one /64 share a key, however they are written', () => {
    const a = ipRateKey('2001:db8:abcd:12::1')
    expect(a).toBe('2001:db8:abcd:12::/64')
    expect(ipRateKey('2001:0db8:abcd:0012:ffff:ffff:ffff:ffff')).toBe(a)
    expect(ipRateKey('2001:DB8:ABCD:12:1:2:3:4')).toBe(a)
  })

  it('different /64 prefixes keep different keys', () => {
    expect(ipRateKey('2001:db8:abcd:12::1')).not.toBe(ipRateKey('2001:db8:abcd:13::1'))
  })

  it('compressed forms expand correctly', () => {
    expect(ipRateKey('::1')).toBe('0:0:0:0::/64')
    expect(ipRateKey('2001:db8::')).toBe('2001:db8:0:0::/64')
    expect(ipRateKey('fe80::1ff:fe23:4567:890a')).toBe('fe80:0:0:0::/64')
  })

  it('anything that is not a well-formed address is returned unchanged (never throws)', () => {
    expect(ipRateKey('1:2:3')).toBe('1:2:3')
    expect(ipRateKey('zzzz::1')).toBe('zzzz::1')
  })
})

describe('clientIpKey', () => {
  it('is the platform-set address collapsed to its /64', () => {
    const req = { headers: { get: (n: string) => (n === 'x-vercel-forwarded-for' ? '2001:db8:1:2:aaaa:bbbb:cccc:dddd' : null) } }
    expect(clientIpKey(req)).toBe('2001:db8:1:2::/64')
  })
})
