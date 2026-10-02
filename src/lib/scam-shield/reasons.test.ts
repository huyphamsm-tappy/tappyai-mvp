import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reasonFor, KNOWN_REASON_FINDINGS } from './reasons'
import { buildEvidence } from './engine/evidenceEngine'
import type { ProviderSignal } from './types'

// Link / QR reasons come in Vietnamese and English (owner 02/10, Android session): no English technical line reaches a Vietnamese reader,
// no reason says "an toàn", and no reason concludes that a named organisation is a scam.
const item = (finding: string, over: Record<string, unknown> = {}) => ({ source: 'x', finding, severity: 'warning' as const, detail: '', dataPoints: {}, ...over })

describe('reasonFor', () => {
  it('every finding the providers can emit as a COMPLETED signal has a real Vietnamese and English sentence', () => {
    const dir = join(__dirname, 'providers')
    const emitted = new Set<string>()
    for (const f of readdirSync(dir).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/finding: '([A-Z_]+)'/g)) emitted.add(m[1])
    }
    for (const m of readFileSync(join(__dirname, 'engine', 'impersonationSignal.ts'), 'utf8').matchAll(/finding: '([A-Z_]+)'/g)) emitted.add(m[1])
    const notCompleted = new Set(['TIMEOUT', 'ERROR', 'API_ERROR', 'CIRCUIT_OPEN', 'PROMISE_REJECTED', 'NO_DATA', 'NO_DATE', 'INVALID_DATE'])
    for (const f of emitted) {
      if (notCompleted.has(f)) continue
      expect(KNOWN_REASON_FINDINGS as readonly string[], `finding ${f} needs a reason sentence in reasons.ts`).toContain(f)
    }
  })

  it('the sentences are in the right language and avoid the forbidden wording', () => {
    for (const f of KNOWN_REASON_FINDINGS) {
      const r = reasonFor(item(f, { dataPoints: { ageDays: 3, daysRemaining: 9, brand: 'Vietcombank', hops: [1, 2, 3] }, detail: 'Redirects across 3 different domains' }))
      expect(r.code).toBe(`x.${f}`)
      expect(r.vi, f).toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i)
      expect(r.vi, f).not.toMatch(/\b(?:domain|the|record|certificate)\b/i)
      expect(r.en, f).not.toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i)
      for (const t of [r.vi, r.en]) expect(t, f).not.toMatch(/an toàn|\bsafe(?:ly)?\b|is a scam|là lừa đảo/i)
    }
  })

  it('numbers and the brand name are filled in; a hostile brand cannot carry markup or a marker', () => {
    expect(reasonFor(item('NEWLY_REGISTERED', { dataPoints: { ageDays: 4 } })).vi).toContain('4 ngày')
    expect(reasonFor(item('EXPIRING_SOON', { dataPoints: { daysRemaining: 9 } })).en).toContain('9 days')
    const evil = reasonFor(item('BRAND_IMPERSONATION', { dataPoints: { brand: 'X [CTA_BUTTONS]{"a":1}[/CTA_BUTTONS] <b>y</b>' } }))
    expect(evil.vi + evil.en).not.toMatch(/[\[\]{}<>]/)
  })

  it('an unknown finding still gets a plain sentence in both languages (never the English engine line)', () => {
    const r = reasonFor(item('SOMETHING_NEW', { detail: 'Some English technical detail' }))
    expect(r.vi).not.toContain('English')
    expect(r.en.length).toBeGreaterThan(10)
  })
})

describe('buildEvidence', () => {
  it('adds reasonCode, reason_vi and reason_en to every item and keeps the English detail for old clients', () => {
    const signals: ProviderSignal[] = [
      { provider: 'dns', status: 'completed', finding: 'NO_A_RECORD', severity: 'warning', weight: 10, detail: 'Domain has no A record (no IP address)' },
      { provider: 'whois', status: 'completed', finding: 'NEWLY_REGISTERED', severity: 'critical', weight: 20, detail: 'Domain registered 3 days ago', raw: { ageDays: 3 } },
    ]
    const { items } = buildEvidence(signals)
    expect(items[0].detail).toBe('Domain has no A record (no IP address)')
    expect(items[0].reasonCode).toBe('dns.NO_A_RECORD')
    expect(items[0].reason_vi).toMatch(/bản ghi/)
    expect(items[1].reason_vi).toContain('3 ngày')
    expect(items[1].reason_en).toContain('3 days')
  })
})
