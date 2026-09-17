import { describe, it, expect } from 'vitest'
import {
  classifyField,
  disallowedKeys,
  forbiddenKeysPresent,
  stripForbiddenKeys,
  USER_FIELD_CLASS,
  PUBLIC_PROFILE_FIELDS,
  OWNER_PROFILE_FIELDS,
  AI_CONTEXT_FIELDS,
  ANALYTICS_FORBIDDEN_KEYS,
  LOG_FORBIDDEN_KEYS,
} from './userDataClassification'

describe('silence is the strictest answer', () => {
  it('classifies an unknown field as HIGHLY_SENSITIVE', () => {
    // A field nobody has decided about must not inherit the most permissive
    // answer. This is what makes "add a column and forget" fail safe.
    expect(classifyField('some_new_column_nobody_classified')).toBe('HIGHLY_SENSITIVE')
    expect(classifyField('')).toBe('HIGHLY_SENSITIVE')
  })

  it('classifies date of birth as HIGHLY_SENSITIVE under every spelling used in this codebase', () => {
    for (const k of ['date_of_birth', 'dateOfBirth', 'dob']) {
      expect(classifyField(k), k).toBe('HIGHLY_SENSITIVE')
    }
  })

  it('classifies the derived demographic fields as PERSONAL_PROFILE, not public', () => {
    for (const k of ['age', 'age_band', 'gender', 'city', 'country', 'occupation']) {
      expect(classifyField(k), k).toBe('PERSONAL_PROFILE')
    }
  })
})

describe('the public profile boundary (§22)', () => {
  it('contains no demographic or professional field', () => {
    // Private by default. No product decision has been taken to publish any of
    // it, so none of it may appear on a surface other users can read.
    const leaked = PUBLIC_PROFILE_FIELDS.filter(
      (f) => classifyField(f) !== 'PUBLIC_PROFILE'
    )
    expect(leaked).toEqual([])
  })

  it('contains no highly sensitive field', () => {
    for (const f of PUBLIC_PROFILE_FIELDS) {
      expect(classifyField(f), f).not.toBe('HIGHLY_SENSITIVE')
    }
  })

  it('is exactly the columns the existing public routes already returned', () => {
    // This foundation adds NOTHING to the public surface. If a future change
    // widens it, that must be a deliberate edit here, not a side effect.
    expect([...PUBLIC_PROFILE_FIELDS].sort()).toEqual(
      ['avatar_url', 'follower_count', 'following_count', 'full_name', 'id', 'review_count']
    )
  })
})

describe('the owner profile contract', () => {
  it('never exposes a raw date of birth', () => {
    for (const k of ['date_of_birth', 'dateOfBirth', 'dob', 'dob_corrections', 'age_declared_at']) {
      expect(OWNER_PROFILE_FIELDS, k).not.toContain(k)
    }
  })

  it('does expose the derived values the profile UI needs instead', () => {
    for (const k of ['age', 'ageBand', 'ageStatus', 'canCorrectAge']) {
      expect(OWNER_PROFILE_FIELDS).toContain(k)
    }
  })
})

describe('the AI context boundary (§21)', () => {
  it('admits no highly sensitive field', () => {
    for (const f of AI_CONTEXT_FIELDS) {
      expect(classifyField(f), f).not.toBe('HIGHLY_SENSITIVE')
    }
  })

  it('excludes email, phone, auth identifiers and date of birth by name', () => {
    for (const k of [
      'email', 'phone', 'date_of_birth', 'dateOfBirth', 'dob',
      'access_token', 'refresh_token', 'stripe_customer_id', 'id', 'user_id',
    ]) {
      expect(AI_CONTEXT_FIELDS, k).not.toContain(k)
    }
  })

  it('permits both age representations — precision is decided per request, not here', () => {
    // Membership makes a key PERMISSIBLE. Which one is actually sent is
    // `resolveAgeFields`' decision, and it defaults to the band. Asserting
    // `not.toContain('age')` here would pin the wrong rule: it would forbid the
    // representation outright rather than requiring it to be justified.
    expect(AI_CONTEXT_FIELDS).toContain('ageBand')
    expect(AI_CONTEXT_FIELDS).toContain('age')
  })

  it('still admits no date of birth, under any spelling', () => {
    // The escape hatch is about PRECISION of a derived value. It never reaches
    // back to the source, which no database role can read anyway.
    for (const k of ['date_of_birth', 'dateOfBirth', 'dob']) {
      expect(AI_CONTEXT_FIELDS, k).not.toContain(k)
    }
  })

  it('carries a preferred name — the gap this foundation closes', () => {
    expect(AI_CONTEXT_FIELDS).toContain('preferredName')
  })
})

describe('disallowedKeys finds nested leaks, which is the only kind that happens', () => {
  it('returns nothing for an object built entirely from the allowlist', () => {
    expect(disallowedKeys({ city: 'HCMC', ageBand: '25_34' }, AI_CONTEXT_FIELDS)).toEqual([])
  })

  it('catches a whole row spread into a NESTED property', () => {
    // A shallow check reads `profile` as one unknown key and misses the payload.
    // This is the realistic leak: nobody writes a top-level `email` by accident.
    const leaked = disallowedKeys(
      { city: 'HCMC', profile: { email: 'a@b.com', date_of_birth: '1990-01-01' } },
      AI_CONTEXT_FIELDS
    )
    expect(leaked).toContain('email')
    expect(leaked).toContain('date_of_birth')
  })

  it('descends through arrays', () => {
    const leaked = disallowedKeys({ items: [{ dob: 'x' }] }, AI_CONTEXT_FIELDS)
    expect(leaked).toContain('dob')
  })

  it('terminates on a deeply nested structure rather than recursing forever', () => {
    let deep: Record<string, unknown> = { email: 'a@b.com' }
    for (let i = 0; i < 50; i++) deep = { nested: deep }
    expect(() => disallowedKeys(deep, AI_CONTEXT_FIELDS)).not.toThrow()
  })

  it('handles primitives and null without throwing', () => {
    for (const v of [null, undefined, 1, 'x', true]) {
      expect(disallowedKeys(v, AI_CONTEXT_FIELDS)).toEqual([])
    }
  })
})

describe('the analytics boundary — the KEY check the value check cannot do', () => {
  it('sensitive values the ingestion PII pattern cannot see are caught by key', () => {
    // The ingestion route's value check (PII_RE) matches things shaped like an
    // email or a phone number. Measured against it:
    //
    //   { date_of_birth: '1990-01-01' } → MATCHES, incidentally — an ISO date
    //     has the digit-and-dash shape of a phone number. It is caught, but by
    //     accident, and the cost is that the WHOLE event is dropped.
    //   { dob: 19900101 } and { age: 31 } → do NOT match. Nothing about a bare
    //     integer looks like a phone number.
    //
    // So the value check cannot be relied on for this class of field, and where
    // it does fire it fires bluntly. The key check is what actually knows.
    const PII_RE = /[\w.+-]+@[\w-]+\.[\w-]{2,}|\+?\d[\d\s().-]{7,}\d/

    expect(PII_RE.test(JSON.stringify({ dob: 19900101 }))).toBe(false)
    expect(PII_RE.test(JSON.stringify({ age: 31 }))).toBe(false)

    expect(forbiddenKeysPresent({ dob: 19900101 }, ANALYTICS_FORBIDDEN_KEYS)).toEqual(['dob'])
    expect(forbiddenKeysPresent({ date_of_birth: '1990-01-01' }, ANALYTICS_FORBIDDEN_KEYS))
      .toEqual(['date_of_birth'])
  })

  it('forbids date of birth, email, phone, tokens and precise coordinates', () => {
    for (const k of [
      'date_of_birth', 'dateOfBirth', 'dob', 'email', 'phone',
      'access_token', 'refresh_token', 'stripe_customer_id', 'latitude', 'longitude',
    ]) {
      expect(ANALYTICS_FORBIDDEN_KEYS, k).toContain(k)
    }
  })

  it('strips a forbidden key at any depth and reports what it removed', () => {
    const { value, removed } = stripForbiddenKeys({
      place: 'Cafe',
      user: { email: 'a@b.com', city: 'HCMC' },
      list: [{ dob: '1990-01-01', ok: 1 }],
    })
    expect(removed.sort()).toEqual(['dob', 'email'])
    expect(value).toEqual({ place: 'Cafe', user: { city: 'HCMC' }, list: [{ ok: 1 }] })
  })

  it('leaves a clean payload byte-identical in shape', () => {
    const payload = { place: 'Cafe', tags: ['a', 'b'], nested: { n: 1 } }
    const { value, removed } = stripForbiddenKeys(payload)
    expect(removed).toEqual([])
    expect(value).toEqual(payload)
  })

  it('does not throw on a payload it cannot walk', () => {
    for (const v of [null, undefined, 'string', 42]) {
      expect(() => stripForbiddenKeys(v)).not.toThrow()
    }
  })
})

describe('the logging boundary', () => {
  it('forbids everything analytics forbids, plus the derived age', () => {
    for (const k of ANALYTICS_FORBIDDEN_KEYS) expect(LOG_FORBIDDEN_KEYS).toContain(k)
    // An exact age beside a user id in a log with no retention policy and no
    // access control is a demographic record in the wrong place.
    expect(LOG_FORBIDDEN_KEYS).toContain('age')
  })
})

describe('the classification table stays honest', () => {
  it('every PUBLIC_PROFILE field is explicitly classified, never defaulted', () => {
    for (const f of PUBLIC_PROFILE_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(USER_FIELD_CLASS, f), f).toBe(true)
    }
  })

  it('is frozen, so a consumer cannot widen it at runtime', () => {
    expect(Object.isFrozen(USER_FIELD_CLASS)).toBe(true)
    expect(Object.isFrozen(PUBLIC_PROFILE_FIELDS)).toBe(true)
    expect(Object.isFrozen(AI_CONTEXT_FIELDS)).toBe(true)
  })
})
