import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  evaluateAgeEligibility, recordAgeDeclaration, AGE_TERMS_VERSION, type AgeStatusRow,
} from './ageEligibility'
import { evaluateGuestAge } from './guestAgeDeclaration'
import type { SupabaseClient } from '@supabase/supabase-js'

const row = (o: Partial<AgeStatusRow>): AgeStatusRow => ({
  has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: null, ...o,
})

afterEach(() => vi.restoreAllMocks())

describe('the one-button declaration in the eligibility decision', () => {
  it('no date of birth + an adult declaration is eligible', () => {
    const r = evaluateAgeEligibility(row({ declaration: 'adult' }))
    expect(r.status).toBe('eligible')
    expect(r.declaration).toBe('adult')
    expect(r.age).toBeNull()
    expect(r.ageBand).toBeNull()
  })

  it('no date of birth and no declaration stays UNKNOWN (fail closed) — also what a database without the migration returns', () => {
    expect(evaluateAgeEligibility(row({})).status).toBe('unknown')
    const legacy = { has_dob: false, age_years: null, age_band: null, corrections_used: 0 } as AgeStatusRow
    expect(evaluateAgeEligibility(legacy).status).toBe('unknown')
  })

  it('a minor declaration is ineligible, cannot self-correct, and beats an adult date of birth', () => {
    const r = evaluateAgeEligibility(row({ declaration: 'minor' }))
    expect(r.status).toBe('ineligible')
    expect(r.canSelfCorrect).toBe(false)
    expect(evaluateAgeEligibility(row({ declaration: 'minor', has_dob: true, age_years: 40, age_band: '35_44' })).status).toBe('ineligible')
  })

  it('an adult declaration never overrides a date of birth that says under 18', () => {
    const r = evaluateAgeEligibility(row({ declaration: 'adult', has_dob: true, age_years: 15, age_band: 'under_18' }))
    expect(r.status).toBe('ineligible')
  })

  it('a date of birth that says adult is eligible exactly as before, with its band', () => {
    const r = evaluateAgeEligibility(row({ has_dob: true, age_years: 30, age_band: '25_34' }))
    expect(r.status).toBe('eligible')
    expect(r.ageBand).toBe('25_34')
  })

  it('an unrecognised declaration value admits nobody', () => {
    expect(evaluateAgeEligibility(row({ declaration: 'yes' })).status).toBe('unknown')
  })
})

describe('recordAgeDeclaration', () => {
  const client = (rpc: unknown) => ({ rpc }) as unknown as SupabaseClient

  it('calls record_age_declaration with the flag and the Terms version', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'recorded', error: null })
    const r = await recordAgeDeclaration(client(rpc), true)
    expect(rpc).toHaveBeenCalledWith('record_age_declaration', { p_adult: true, p_terms_version: AGE_TERMS_VERSION })
    expect(r).toEqual({ ok: true, result: 'recorded' })
  })

  it('"unchanged" is success; the database refusals are not', async () => {
    expect((await recordAgeDeclaration(client(vi.fn().mockResolvedValue({ data: 'unchanged', error: null })), true)).ok).toBe(true)
    for (const refusal of ['dob_under_18', 'minor_declared', 'anonymous_not_eligible']) {
      const r = await recordAgeDeclaration(client(vi.fn().mockResolvedValue({ data: refusal, error: null })), true)
      expect(r.ok).toBe(false)
      expect(r.result).toBe(refusal)
    }
  })

  it('FAILS CLOSED: an error (e.g. the function does not exist because the migration is not applied), a throw or an unknown status is "failed"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await recordAgeDeclaration(client(vi.fn().mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } })), true))
      .toEqual({ ok: false, result: 'failed' })
    expect(await recordAgeDeclaration(client(vi.fn().mockRejectedValue(new Error('boom'))), false))
      .toEqual({ ok: false, result: 'failed' })
    expect(await recordAgeDeclaration(client(vi.fn().mockResolvedValue({ data: 'something_new', error: null })), true))
      .toEqual({ ok: false, result: 'failed' })
  })
})

describe('the device declaration', () => {
  it('"under18" is remembered as a refusal', () => {
    expect(evaluateGuestAge('under18')).toEqual({ status: 'ineligible', value: 'under18' })
  })
})

describe('the migration file (static checks; it is NOT applied anywhere)', () => {
  const sql = readFileSync('supabase/migrations/20261202_age_adult_declaration.sql', 'utf8')
  const code = sql.replace(/--[^\n]*/g, '')

  it('adds the three columns and grants none of them to a client role', () => {
    for (const c of ['adult_declared_at', 'adult_terms_version', 'minor_declared_at']) expect(code).toContain(c)
    expect(code).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE)[^;]*(adult_declared_at|adult_terms_version|minor_declared_at)/i)
    expect(code).toMatch(/REVOKE ALL \(adult_declared_at, adult_terms_version, minor_declared_at\)/)
  })

  it('the writer is SECURITY DEFINER, keyed on auth.uid() with no user-id argument, and executable by authenticated only', () => {
    expect(code).toMatch(/record_age_declaration\(p_adult BOOLEAN, p_terms_version TEXT\)/)
    expect(code).toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(/v_uid\s+UUID := auth\.uid\(\)/)
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.record_age_declaration\(BOOLEAN, TEXT\) FROM PUBLIC, anon, authenticated/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_age_declaration\(BOOLEAN, TEXT\) TO authenticated, service_role/)
  })

  it('refuses anonymous callers, an under-18 date, and a flip from minor to adult', () => {
    expect(code).toContain("'anonymous_not_eligible'")
    expect(code).toContain("'dob_under_18'")
    expect(code).toContain("'minor_declared'")
  })

  it('user_age_status keeps its grants and gains the declaration column', () => {
    expect(code).toMatch(/declaration\s+TEXT/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.user_age_status\(\) TO authenticated, service_role/)
  })

  it('is listed in the migration order', () => {
    expect(readFileSync('supabase/MIGRATION_ORDER.txt', 'utf8')).toContain('supabase/migrations/20261202_age_adult_declaration.sql')
  })
})
