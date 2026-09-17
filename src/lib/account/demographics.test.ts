import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildDemographicsUpdate,
  toDemographicsProfile,
  toPromptGender,
  getDemographics,
  DEMOGRAPHICS_COLUMNS,
  GENDER_VALUES,
  EMPTY_DEMOGRAPHICS,
  type DemographicsRow,
} from './demographics'
import type { SupabaseClient } from '@supabase/supabase-js'

const row = (o: Partial<DemographicsRow> = {}): DemographicsRow => ({
  gender: null, gender_self_describe: null, city: null, country: null,
  occupation: null, industry: null, education_level: null, ...o,
})

describe('the column list never selects *', () => {
  it('names its columns, because * expands to date_of_birth and is denied', () => {
    expect(DEMOGRAPHICS_COLUMNS).not.toContain('*')
    expect(DEMOGRAPHICS_COLUMNS).not.toContain('date_of_birth')
    expect(DEMOGRAPHICS_COLUMNS).not.toContain('dob_corrections')
  })
})

describe('the gender option set is not binary', () => {
  it('can represent someone who is neither, and someone who declines', () => {
    expect(GENDER_VALUES).toContain('other')
    expect(GENDER_VALUES).toContain('prefer_not_to_say')
  })

  it('maps only male/female to the prompt engine, and the rest to null', () => {
    expect(toPromptGender('male')).toBe('male')
    expect(toPromptGender('female')).toBe('female')
    // The same result these users got before, when only two values existed.
    expect(toPromptGender('other')).toBeNull()
    expect(toPromptGender('prefer_not_to_say')).toBeNull()
    expect(toPromptGender(null)).toBeNull()
  })
})

describe('toDemographicsProfile', () => {
  it('returns the empty profile for a missing row', () => {
    expect(toDemographicsProfile(null)).toBe(EMPTY_DEMOGRAPHICS)
    expect(toDemographicsProfile(undefined)).toBe(EMPTY_DEMOGRAPHICS)
  })

  it('drops a gender value outside the option set rather than passing it on', () => {
    expect(toDemographicsProfile(row({ gender: 'legacy_value' })).gender).toBeNull()
  })

  it('drops a self-description that contradicts the stored gender', () => {
    // The CHECK constraint forbids this pairing, so it can only be stale data.
    // Rendering both would show a description next to a contradicting label.
    const p = toDemographicsProfile(row({ gender: 'female', gender_self_describe: 'stale' }))
    expect(p.genderSelfDescribe).toBeNull()
  })

  it('keeps a self-description alongside `other`', () => {
    const p = toDemographicsProfile(row({ gender: 'other', gender_self_describe: 'non-binary' }))
    expect(p).toMatchObject({ gender: 'other', genderSelfDescribe: 'non-binary' })
  })
})

describe('buildDemographicsUpdate — absent is not the same as null', () => {
  it('returns null when the body names no demographic field', () => {
    // So the caller can skip the write entirely rather than issue an empty UPDATE.
    expect(buildDemographicsUpdate({})).toBeNull()
    expect(buildDemographicsUpdate({ full_name: 'X', language: 'en' })).toBeNull()
  })

  it('leaves unmentioned fields alone', () => {
    // A client sending only { city } must not wipe the user's occupation.
    const u = buildDemographicsUpdate({ city: 'Hanoi' })
    expect(u).toEqual({ city: 'Hanoi' })
    expect(u).not.toHaveProperty('occupation')
  })

  it('treats an explicit null as a clear (§30 — delete a field)', () => {
    expect(buildDemographicsUpdate({ occupation: null })).toEqual({ occupation: null })
  })

  it('treats an empty string as a clear, not as an empty value', () => {
    expect(buildDemographicsUpdate({ city: '   ' })).toEqual({ city: null })
  })

  it('trims and bounds free text at the same limits as the CHECK constraints', () => {
    const long = 'x'.repeat(500)
    const u = buildDemographicsUpdate({ occupation: `  ${long}  ` })!
    expect((u.occupation as string).length).toBe(80)
  })

  it('ignores an unrecognised gender rather than sending one the CHECK will reject', () => {
    // A 500 from a constraint teaches the caller less than the field not changing.
    expect(buildDemographicsUpdate({ gender: 'nonsense' })).toBeNull()
  })

  it('clears the self-description when gender changes away from `other`', () => {
    // Required: the CHECK forbids a description without `other`, so leaving the
    // old one behind would make the write fail.
    expect(buildDemographicsUpdate({ gender: 'male' })).toEqual({
      gender: 'male', gender_self_describe: null,
    })
  })

  it('clears the self-description when gender is cleared', () => {
    expect(buildDemographicsUpdate({ gender: null })).toEqual({
      gender: null, gender_self_describe: null,
    })
  })

  it('accepts a self-description only alongside `other` in the same request', () => {
    expect(buildDemographicsUpdate({ gender: 'other', genderSelfDescribe: 'agender' })).toEqual({
      gender: 'other', gender_self_describe: 'agender',
    })
    // Without gender in the body it is dropped, rather than risking a constraint
    // violation the user would see as a 500.
    expect(buildDemographicsUpdate({ genderSelfDescribe: 'agender' })).toBeNull()
  })

  it('always allows clearing the self-description on its own', () => {
    expect(buildDemographicsUpdate({ genderSelfDescribe: null })).toEqual({
      gender_self_describe: null,
    })
  })

  it('normalises country to ISO-3166-1 alpha-2 upper case', () => {
    expect(buildDemographicsUpdate({ country: 'vn' })).toEqual({ country: 'VN' })
    expect(buildDemographicsUpdate({ country: ' us ' })).toEqual({ country: 'US' })
  })

  it('ignores a country that is not two letters rather than storing it half-normalised', () => {
    expect(buildDemographicsUpdate({ country: 'VNM' })).toBeNull()
    expect(buildDemographicsUpdate({ country: '1' })).toBeNull()
  })

  it('clears country on null or empty', () => {
    expect(buildDemographicsUpdate({ country: null })).toEqual({ country: null })
    expect(buildDemographicsUpdate({ country: '' })).toEqual({ country: null })
  })

  it('never produces a date_of_birth key from any body', () => {
    // DOB has its own path (`set_user_date_of_birth`). It must never ride along
    // in a column update, which no role is granted anyway.
    const u = buildDemographicsUpdate({
      dateOfBirth: '1990-01-01', date_of_birth: '1990-01-01', city: 'Hue',
    })
    expect(Object.keys(u ?? {})).toEqual(['city'])
  })

  it('maps educationLevel to its snake_case column', () => {
    expect(buildDemographicsUpdate({ educationLevel: 'Bachelor' })).toEqual({
      education_level: 'Bachelor',
    })
  })
})

describe('getDemographics never breaks the profile surface', () => {
  afterEach(() => vi.restoreAllMocks())

  const client = (result: unknown) => {
    const maybeSingle = vi.fn().mockResolvedValue(result)
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    return { supabase: { from } as unknown as SupabaseClient, from, select, eq }
  }

  it('reads user_demographics by user_id with the named column list', async () => {
    const c = client({ data: null, error: null })
    await getDemographics(c.supabase, 'u1')
    expect(c.from).toHaveBeenCalledWith('user_demographics')
    expect(c.select).toHaveBeenCalledWith(DEMOGRAPHICS_COLUMNS)
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('returns the empty profile on a read error instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = client({ data: null, error: { message: 'boom', code: '42501' } })
    // A signed-in user must still see their name, avatar and settings when this
    // one table is unreachable. There is no access decision here to fail closed.
    expect(await getDemographics(c.supabase, 'u1')).toEqual(EMPTY_DEMOGRAPHICS)
  })
})
