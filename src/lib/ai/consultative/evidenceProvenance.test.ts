import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyEvidence,
  mayStateAsFact,
  isUserConstraint,
  provenancedClaim,
  renderEvidencePolicyBlock,
  UNKNOWN,
  type EvidenceType,
} from './evidenceProvenance'
import { buildSystem } from '../promptBuilder'

// A5.1 — a dynamic value reaches the model already CLASSIFIED. The guards remove
// what traces to no evidence; this grades what survives so a snippet can never
// read as an authoritative FACT.

describe('classifyEvidence — the frozen policy matrix (Invariants A–D)', () => {
  const CASES: Array<[Parameters<typeof classifyEvidence>[0], EvidenceType]> = [
    ['structured_provider', 'FACT'],
    ['review', 'REVIEW_SUPPORTED'],
    ['search_snippet', 'REVIEW_SUPPORTED'],
    ['user', 'INFERRED'],
    ['system', 'INFERRED'],
    ['none', 'UNKNOWN'],
  ]
  it.each(CASES)('%s → %s', (source, type) => expect(classifyEvidence(source)).toBe(type))

  it('Invariant C — a search snippet is NEVER FACT', () => {
    expect(classifyEvidence('search_snippet')).not.toBe('FACT')
    expect(mayStateAsFact({ evidence_type: classifyEvidence('search_snippet') })).toBe(false)
  })

  it('Invariant B — a user number is a constraint, never a merchant price', () => {
    expect(isUserConstraint('user')).toBe(true)
    expect(classifyEvidence('user')).not.toBe('FACT')
    expect(isUserConstraint('search_snippet')).toBe(false)
  })

  it('only FACT may be stated plainly', () => {
    expect(mayStateAsFact({ evidence_type: 'FACT' })).toBe(true)
    for (const t of ['REVIEW_SUPPORTED', 'INFERRED', 'UNKNOWN'] as EvidenceType[]) {
      expect(mayStateAsFact({ evidence_type: t })).toBe(false)
    }
  })
})

describe('provenancedClaim — value + grade travel together, absence is UNKNOWN', () => {
  it('a structured value becomes a FACT claim', () => {
    expect(provenancedClaim(387000, 'structured_provider')).toEqual({ value: 387000, evidence_type: 'FACT', source_type: 'structured_provider' })
  })
  it('a snippet value is REVIEW_SUPPORTED, never FACT', () => {
    const c = provenancedClaim(50000, 'search_snippet')
    expect(c.evidence_type).toBe('REVIEW_SUPPORTED')
    expect(mayStateAsFact(c)).toBe(false)
  })
  it('Invariant D — a null/absent value is UNKNOWN, never reconstructed', () => {
    const c = provenancedClaim(null, 'search_snippet')
    expect(c.value).toBe(UNKNOWN)
    expect(c.evidence_type).toBe('UNKNOWN')
    expect(provenancedClaim(undefined, 'structured_provider').evidence_type).toBe('UNKNOWN')
  })
  it('reuses the ONE existing UNKNOWN sentinel (no second absence model)', () => {
    expect(UNKNOWN).toBe('KHONG CO DU LIEU')
  })
})

describe('the policy block reaches the model (advisory layer)', () => {
  it('renderEvidencePolicyBlock names all four levels and forbids weak-as-FACT', () => {
    const b = renderEvidencePolicyBlock()
    for (const lvl of ['FACT', 'REVIEW_SUPPORTED', 'INFERRED', 'UNKNOWN']) expect(b).toContain(lvl)
    expect(b).toMatch(/KHONG duoc trinh bay nhu FACT/)
    expect(b).not.toMatch(/\$\{/) // no interpolation — stays in the cached shared prompt
  })

  it('is included in the SHARED (cached) system prompt', () => {
    const shared = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false).shared
    expect(shared).toMatch(/DANH GIA BANG CHUNG \(evidence provenance\)/)
    expect(shared).toContain('REVIEW_SUPPORTED')
  })
})

describe('food.ts grades its snippet prices (integration)', () => {
  const FOOD = readFileSync(join(__dirname, '..', 'tools', 'food.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  it('attaches price_evidence with a snippet classification alongside price_search_results', () => {
    expect(FOOD).toMatch(/price_search_results\s*=\s*priceResults/)
    expect(FOOD).toMatch(/price_evidence\s*=\s*\{[\s\S]*classifyEvidence\('search_snippet'\)/)
  })
})
