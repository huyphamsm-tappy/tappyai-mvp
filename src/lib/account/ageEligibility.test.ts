import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  evaluateAgeEligibility,
  getAgeEligibility,
  setDateOfBirth,
  parseDateOfBirthInput,
  ageEligibilityCode,
  MINIMUM_AGE,
  MAX_SELF_CORRECTIONS,
  type AgeStatusRow,
} from './ageEligibility'
import type { SupabaseClient } from '@supabase/supabase-js'

const row = (o: Partial<AgeStatusRow>): AgeStatusRow => ({
  has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0, ...o,
})

describe('three states, never two', () => {
  it('no row at all is UNKNOWN — never eligible', () => {
    // The entire existing user base has no row. Reading that as eligible would
    // let every pre-existing account through ungated.
    expect(evaluateAgeEligibility(null).status).toBe('unknown')
    expect(evaluateAgeEligibility(undefined).status).toBe('unknown')
  })

  it('no date on file is UNKNOWN — never ineligible', () => {
    // Telling a user who has never been asked that they are under age is false,
    // and looks unrecoverable to them.
    const r = evaluateAgeEligibility(row({ has_dob: false, age_years: null, age_band: null }))
    expect(r.status).toBe('unknown')
    expect(r.age).toBeNull()
    expect(r.ageBand).toBeNull()
  })

  it('at or above the minimum age is eligible', () => {
    expect(evaluateAgeEligibility(row({ age_years: MINIMUM_AGE })).status).toBe('eligible')
    expect(evaluateAgeEligibility(row({ age_years: 45 })).status).toBe('eligible')
  })

  it('below the minimum age is ineligible', () => {
    expect(evaluateAgeEligibility(row({ age_years: MINIMUM_AGE - 1 })).status).toBe('ineligible')
    expect(evaluateAgeEligibility(row({ age_years: 0 })).status).toBe('ineligible')
  })

  it('is decided at the boundary by >=, so an 18th birthday admits', () => {
    const at = evaluateAgeEligibility(row({ age_years: 18 }))
    const below = evaluateAgeEligibility(row({ age_years: 17 }))
    expect([at.status, below.status]).toEqual(['eligible', 'ineligible'])
  })
})

describe('a malformed answer never admits anyone', () => {
  it('has_dob true with a missing age is UNKNOWN, not eligible', () => {
    // A defect in the function must not become a licence to enter.
    expect(evaluateAgeEligibility(row({ age_years: null })).status).toBe('unknown')
  })

  it('has_dob true with a non-finite age is UNKNOWN', () => {
    expect(evaluateAgeEligibility(row({ age_years: NaN })).status).toBe('unknown')
    expect(evaluateAgeEligibility(row({ age_years: Infinity })).status).toBe('unknown')
  })
})

describe('the single self-correction', () => {
  it('is available before any correction is spent', () => {
    expect(evaluateAgeEligibility(row({ corrections_used: 0 })).canSelfCorrect).toBe(true)
  })

  it('is gone once spent', () => {
    expect(
      evaluateAgeEligibility(row({ corrections_used: MAX_SELF_CORRECTIONS })).canSelfCorrect
    ).toBe(false)
  })

  it('treats a null counter as none spent', () => {
    expect(evaluateAgeEligibility(row({ corrections_used: null })).canSelfCorrect).toBe(true)
  })
})

describe('the query fails CLOSED, unlike accountStatus', () => {
  const client = (result: unknown) => {
    const rpc = vi.fn().mockResolvedValue(result)
    return { supabase: { rpc } as unknown as SupabaseClient, rpc }
  }

  afterEach(() => vi.restoreAllMocks())

  it('calls user_age_status with no arguments', async () => {
    const c = client({ data: [row({})], error: null })
    await getAgeEligibility(c.supabase)
    expect(c.rpc).toHaveBeenCalledWith('user_age_status')
    // No user id is passed — the function keys on auth.uid(), so one user
    // cannot ask this question about another.
    expect(c.rpc.mock.calls[0]).toHaveLength(1)
  })

  it('unwraps the array PostgREST returns for a RETURNS TABLE function', async () => {
    const c = client({ data: [row({ age_years: 40, age_band: '35_44' })], error: null })
    const r = await getAgeEligibility(c.supabase)
    expect(r.status).toBe('eligible')
    expect(r.ageBand).toBe('35_44')
  })

  it('withholds access on a read error — it does NOT admit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client({ data: null, error: { message: 'connection reset' } })
    const r = await getAgeEligibility(c.supabase)
    // A read failure treated as `eligible` would admit every under-age visitor
    // for the duration of the outage — the one outcome this gate prevents.
    expect(r.status).toBe('unknown')
  })

  it('does NOT brand anyone ineligible on a read error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client({ data: null, error: { message: 'boom' } })
    expect((await getAgeEligibility(c.supabase)).status).not.toBe('ineligible')
  })

  it('withholds access when the rpc throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rpc = vi.fn().mockRejectedValue(new Error('network'))
    const supabase = { rpc } as unknown as SupabaseClient
    expect((await getAgeEligibility(supabase)).status).toBe('unknown')
  })

  it('logs the failure loudly so the window is observable', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client({ data: null, error: { message: 'boom' } })
    await getAgeEligibility(c.supabase)
    expect(err).toHaveBeenCalled()
  })
})

describe('setDateOfBirth', () => {
  afterEach(() => vi.restoreAllMocks())

  const client = (result: unknown) => {
    const rpc = vi.fn().mockResolvedValue(result)
    return { supabase: { rpc } as unknown as SupabaseClient, rpc }
  }

  it('sends the date to the SECURITY DEFINER writer, never an UPDATE', async () => {
    const c = client({ data: 'recorded', error: null })
    await setDateOfBirth(c.supabase, '1990-01-01')
    expect(c.rpc).toHaveBeenCalledWith('set_user_date_of_birth', { p_dob: '1990-01-01' })
  })

  it('treats recorded / corrected / unchanged as success', async () => {
    for (const r of ['recorded', 'corrected', 'unchanged']) {
      const c = client({ data: r, error: null })
      expect((await setDateOfBirth(c.supabase, '1990-01-01')).ok, r).toBe(true)
    }
  })

  it('treats a spent correction as a failure the caller can branch on', async () => {
    const c = client({ data: 'correction_exhausted', error: null })
    const r = await setDateOfBirth(c.supabase, '1990-01-01')
    expect(r).toEqual({ ok: false, result: 'correction_exhausted' })
  })

  it('treats an UNRECOGNISED status as a failure, not a success', async () => {
    // A future status this build does not know about must never read as "written".
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client({ data: 'some_future_code', error: null })
    expect((await setDateOfBirth(c.supabase, '1990-01-01')).ok).toBe(false)
  })
})

describe('parseDateOfBirthInput', () => {
  it('accepts a plain calendar date', () => {
    expect(parseDateOfBirthInput('1990-01-01')).toBe('1990-01-01')
    expect(parseDateOfBirthInput('  1990-01-01  ')).toBe('1990-01-01')
  })

  it('rejects a full timestamp rather than truncating it', () => {
    // Truncation would depend on the server timezone, so the same instant could
    // store two different dates and band a boundary user differently on Web
    // than on Android.
    expect(parseDateOfBirthInput('1990-01-01T00:00:00Z')).toBeNull()
    expect(parseDateOfBirthInput('1990-01-01 00:00:00')).toBeNull()
  })

  it('rejects a date that does not exist rather than rolling it over', () => {
    // `new Date('2005-02-30')` silently becomes 2 March. That would band a user
    // by a date they never entered.
    expect(parseDateOfBirthInput('2005-02-30')).toBeNull()
    expect(parseDateOfBirthInput('2005-13-01')).toBeNull()
    expect(parseDateOfBirthInput('2005-04-31')).toBeNull()
  })

  it('handles leap years correctly', () => {
    expect(parseDateOfBirthInput('2000-02-29')).toBe('2000-02-29') // divisible by 400
    expect(parseDateOfBirthInput('1900-02-29')).toBeNull()         // divisible by 100, not 400
    expect(parseDateOfBirthInput('2004-02-29')).toBe('2004-02-29')
  })

  it('rejects a future date', () => {
    const next = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(parseDateOfBirthInput(next)).toBeNull()
  })

  it('accepts today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(parseDateOfBirthInput(today)).toBe(today)
  })

  it('rejects loose shapes and non-strings', () => {
    for (const v of ['1990-1-1', '90-01-01', '', 'yesterday', null, undefined, 19900101, {}]) {
      expect(parseDateOfBirthInput(v), String(v)).toBeNull()
    }
  })

  it('rejects a year before 1900', () => {
    expect(parseDateOfBirthInput('1899-12-31')).toBeNull()
  })
})

describe('error codes are distinct so clients route differently', () => {
  it('separates "we need to ask" from "you are refused"', () => {
    expect(ageEligibilityCode('unknown')).toBe('age_verification_required')
    expect(ageEligibilityCode('ineligible')).toBe('age_ineligible')
    expect(ageEligibilityCode('unknown')).not.toBe(ageEligibilityCode('ineligible'))
  })
})
