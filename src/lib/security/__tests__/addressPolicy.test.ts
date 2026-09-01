/**
 * The destination policy — one address in, one verdict out.
 *
 * This is the table every other layer defers to, so it is worth pinning precisely. The cases that
 * matter are not `10.0.0.1` (everyone remembers that one) but the spellings that slip past a guard
 * written with string prefixes:
 *
 *   · `::ffff:7f00:1`  — 127.0.0.1 written in hex, matches no `startsWith('127.')`
 *   · `0:0:0:0:0:0:0:1` — loopback with nothing to match `'::1'`
 *   · `fe80::1%eth0`   — a scope id glued to the address
 *   · `2130706433`     — 127.0.0.1 as an integer, which is not an address to us and must be refused
 *                        rather than waved through as "not a private range"
 *
 * 🔑 The default is REFUSAL. Anything that does not parse as an address is not a destination we
 * can reason about, so it does not get one.
 */
import { describe, it, expect } from 'vitest'
import { isAllowedDestinationAddress } from '../addressPolicy'

describe('addresses we will connect to', () => {
  const ALLOWED = [
    ['ordinary public IPv4', '93.184.216.34'],
    ['another public IPv4', '8.8.8.8'],
    ['TEST-NET-1 (shaped public)', '192.0.2.1'],
    ['just outside 172.16/12, below', '172.15.255.255'],
    ['just outside 172.16/12, above', '172.32.0.1'],
    ['just outside CGNAT, below', '100.63.255.255'],
    ['just outside CGNAT, above', '100.128.0.1'],
    ['just below multicast', '223.255.255.255'],
    ['public IPv6', '2606:4700:4700::1111'],
    ['public IPv6, expanded', '2001:0db8:0000:0000:0000:0000:0000:0001'],
    ['IPv4-mapped IPv6 of a PUBLIC address', '::ffff:93.184.216.34'],
  ] as const

  for (const [name, addr] of ALLOWED) {
    it(`allows ${name} (${addr})`, () => {
      expect(isAllowedDestinationAddress(addr)).toBe(true)
    })
  }
})

describe('addresses we refuse', () => {
  const REFUSED = [
    ['loopback', '127.0.0.1'],
    ['loopback, elsewhere in 127/8', '127.255.255.254'],
    ['this-network', '0.0.0.0'],
    ['private 10/8', '10.255.255.255'],
    ['private 172.16/12 low edge', '172.16.0.0'],
    ['private 172.16/12 high edge', '172.31.255.255'],
    ['private 192.168/16', '192.168.0.1'],
    ['link-local', '169.254.0.1'],
    ['🚨 cloud metadata', '169.254.169.254'],
    ['CGNAT low edge', '100.64.0.0'],
    ['CGNAT high edge', '100.127.255.255'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],

    ['IPv6 loopback', '::1'],
    ['🚨 IPv6 loopback, fully written out', '0:0:0:0:0:0:0:1'],
    ['IPv6 unspecified', '::'],
    ['IPv6 unique-local fc00::/7', 'fc00::1'],
    ['IPv6 unique-local fd00::/8', 'fd12:3456::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['🚨 IPv6 link-local with a scope id', 'fe80::1%eth0'],
    ['IPv6 multicast', 'ff02::1'],

    ['🚨 IPv4-mapped metadata, dotted', '::ffff:169.254.169.254'],
    ['🚨 IPv4-mapped loopback, hex', '::ffff:7f00:1'],
    ['🚨 IPv4-mapped private, hex', '::ffff:0a00:0005'],
    ['🚨 NAT64-mapped metadata', '64:ff9b::169.254.169.254'],

    // Not addresses at all. A guard that answers "true, it is not in a private range" for these
    // is answering the wrong question.
    ['🚨 loopback as a bare integer', '2130706433'],
    ['🚨 octal-looking octets', '010.0.0.1'],
    ['a hostname', 'example.com'],
    ['a URL', 'https://example.com/'],
    ['empty', ''],
    ['whitespace', '   '],
    ['short-form IPv4', '10.1'],
    ['out-of-range octet', '999.1.1.1'],
  ] as const

  for (const [name, addr] of REFUSED) {
    it(`refuses ${name} (${JSON.stringify(addr)})`, () => {
      expect(isAllowedDestinationAddress(addr)).toBe(false)
    })
  }

  it('refuses a non-string', () => {
    expect(isAllowedDestinationAddress(null as unknown as string)).toBe(false)
    expect(isAllowedDestinationAddress(undefined as unknown as string)).toBe(false)
  })

  it('bracketed IPv6 is unwrapped before judging, not refused for its brackets', () => {
    // `[::1]` must be refused because it IS loopback — not because the brackets confused the
    // parser. The public case proves the unwrapping happens rather than everything failing shut.
    expect(isAllowedDestinationAddress('[::1]')).toBe(false)
    expect(isAllowedDestinationAddress('[2606:4700:4700::1111]')).toBe(true)
  })
})
