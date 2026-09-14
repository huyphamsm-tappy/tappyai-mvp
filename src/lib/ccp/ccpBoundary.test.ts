import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PROVIDER_REGISTRY } from './registry'

// ── CCP boundary guard ───────────────────────────────────────────────────────
// Mirrors the architecture-check rules from inside vitest so the required-suite
// gate sees them too. Three invariants:
//   1. affiliate credentials are read ONLY in src/lib/ccp/tracking/*
//   2. src/lib/ccp imports nothing from the AI, ads, messaging or contacts
//      layers (CCP is a capability the AI layer calls, never the reverse)
//   3. src/lib/ccp performs no network I/O in MVP (link generation is not a click)

const ROOT = process.cwd()
const CCP = join(ROOT, 'src', 'lib', 'ccp')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(CCP).map(p => ({ rel: relative(ROOT, p).split(sep).join('/'), src: readFileSync(p, 'utf8') }))

describe('CCP module boundary', () => {
  it('reads affiliate credentials only inside src/lib/ccp/tracking/', () => {
    const offenders = files
      .filter(f => !f.rel.startsWith('src/lib/ccp/tracking/') && !f.rel.endsWith('.test.ts'))
      .filter(f => /ACCESSTRADE_(API_KEY|PUBLISHER_ID)|CJ_ACCESS_TOKEN|AGODA_API_KEY/.test(f.src))
      .map(f => f.rel)
    expect(offenders).toEqual([])
  })

  it('does not import the AI, ads, messaging or contacts layers', () => {
    const offenders = files
      .filter(f => /from\s+['"]@\/lib\/(ai|ads|messaging|contacts)\//.test(f.src))
      .map(f => f.rel)
    expect(offenders).toEqual([])
  })

  it('performs no network I/O in MVP (no fetch/http/https/net in non-test code)', () => {
    const offenders = files
      .filter(f => !f.rel.endsWith('.test.ts'))
      .filter(f => /\bfetch\s*\(|from\s+['"]node:(http|https|net|dns)['"]|require\(\s*['"](http|https|net|dns)['"]\)/.test(f.src))
      .map(f => f.rel)
    expect(offenders).toEqual([])
  })

  it('every merchant host in CCP belongs to a registry allow-list', () => {
    const hosts = new Set<string>()
    for (const f of files) {
      if (!f.rel.includes('/adapters/') || f.rel.endsWith('.test.ts')) continue
      for (const m of f.src.matchAll(/https:\/\/([a-z0-9.-]+)\//g)) hosts.add(m[1])
    }
    // The registry allow-lists are the authority; the literal set below is the reviewed transcription
    // (four MVP merchants + three shopping marketplaces + the seven Completion Pass providers, 14 Sep 2026).
    const allowed = new Set(['www.dienmayxanh.com', 'vn.trip.com', 'www.cgv.vn', 'www.klook.com', 'shopee.vn', 'shop.tiktok.com', 'www.tiktok.com', 'www.lazada.vn',
      'www.booking.com', 'www.agoda.com', 'www.traveloka.com', 'vexere.com', 'www.vietnamairlines.com', 'www.vietjetair.com', 'ticketbox.vn'])
    expect([...hosts].filter(h => !allowed.has(h))).toEqual([])
    const registryHosts = new Set(PROVIDER_REGISTRY.flatMap(e => [...e.allowedHosts]))
    expect([...hosts].filter(h => !registryHosts.has(h))).toEqual([])
  })
})
