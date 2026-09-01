/**
 * `isSafeHttpsUrl` — the cheap pre-filter, and only that.
 *
 * 🚨 SCOPE. This function reads a STRING. It cannot know that `https://looks-fine.example/`
 * resolves to `10.0.0.5`, so it is not the SSRF boundary and no amount of hostname cleverness
 * would make it one. The boundary is `safeFetch`, which pins the socket to an address it
 * validated (`../../scam-shield/__tests__/dnsPinning.test.ts` measures that). What this file locks
 * is the pre-filter's own job: schemes, credentials, and addresses written out literally.
 */
import { describe, it, expect } from 'vitest'
import { isSafeHttpsUrl } from '../urlGuard'

describe('scheme and credentials', () => {
  it('allows plain https', () => {
    expect(isSafeHttpsUrl('https://example.com/pay')).toBe(true)
  })

  for (const url of [
    'http://example.com/',
    'file:///etc/passwd',
    'ftp://example.com/',
    'gopher://example.com/',
    'data:text/html,<script>',
    'javascript:alert(1)',
    'not a url',
  ]) {
    it(`refuses ${url}`, () => expect(isSafeHttpsUrl(url)).toBe(false))
  }

  it('refuses embedded credentials', () => {
    expect(isSafeHttpsUrl('https://user:pass@example.com/')).toBe(false)
    expect(isSafeHttpsUrl('https://user@example.com/')).toBe(false)
  })
})

describe('internal names', () => {
  for (const url of [
    'https://localhost/',
    'https://api.localhost/',
    'https://printer.local/',
    'https://vault.internal/',
  ]) {
    it(`refuses ${url}`, () => expect(isSafeHttpsUrl(url)).toBe(false))
  }
})

describe('address literals, however they are spelled', () => {
  // 🔑 Node canonicalises the exotic notations while parsing the URL, so by the time the guard
  // sees a hostname the shorthand, hex, and integer forms are already dotted quads. Locked here
  // because that is load-bearing and invisible: without it, `https://2130706433/` reads as an
  // ordinary name and walks straight through.
  const REFUSED = [
    ['loopback', 'https://127.0.0.1/'],
    ['loopback, shorthand', 'https://127.1/'],
    ['🚨 loopback as hex', 'https://0x7f000001/'],
    ['🚨 loopback as an integer', 'https://2130706433/'],
    ['private 10/8, shorthand', 'https://10.1/'],
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['private 192.168/16', 'https://192.168.1.1/'],
    ['IPv6 loopback', 'https://[::1]/'],
    ['🚨 IPv4-mapped loopback in hex', 'https://[::ffff:7f00:1]/'],
    ['IPv6 unique-local', 'https://[fd00::1]/'],
  ] as const

  for (const [name, url] of REFUSED) {
    it(`refuses ${name} (${url})`, () => expect(isSafeHttpsUrl(url)).toBe(false))
  }

  it('allows a public IP literal', () => {
    expect(isSafeHttpsUrl('https://93.184.216.34/')).toBe(true)
    expect(isSafeHttpsUrl('https://[2606:4700:4700::1111]/')).toBe(true)
  })
})

describe('a hostname is not an address', () => {
  // 🚨 REGRESSION. The old inline check tested `h.startsWith('fc') || h.startsWith('fd') ||
  // h.startsWith('fe80')` against ANY hostname that was not a dotted quad — so real domains were
  // refused for beginning with the same two letters as a unique-local prefix. Nobody noticed
  // because nobody checks a football club through Scam Shield, but it was a live false positive
  // and it is the reason the address table now lives behind a "does this even look like an
  // address" question instead of a string prefix.
  for (const url of [
    'https://fcbarcelona.com/',
    'https://fdny.org/',
    'https://fe80s-diner.example/',
    'https://fdic.gov/',
  ]) {
    it(`allows ${url}`, () => expect(isSafeHttpsUrl(url)).toBe(true))
  }
})
