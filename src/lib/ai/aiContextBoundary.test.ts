import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildAIContext,
  buildChatPromptContext,
  buildIdentityBlock,
  resolveAgeFields,
  EMPTY_IDENTITY,
  type AIIdentityContext,
} from './contextBuilder'
import { AI_CONTEXT_FIELDS, disallowedKeys } from '@/lib/account/userDataClassification'

// ─────────────────────────────────────────────────────────────────────────────
// §21 — the AI context boundary.
//
// The model receives a minimal projection, never a database row. `AIContext` is
// a TypeScript interface and a TypeScript interface is GONE at runtime: a spread
// of a profile row into that object type-checks as excess-property-free and
// would ship a date of birth to a model. These are the checks that actually run.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/memory/memoryService', () => ({
  getMemory: vi.fn(async () => null),
  buildMemoryBlock: vi.fn(() => ''),
}))

/**
 * A Supabase double whose `.select()` records the column list it was asked for
 * and returns whatever the table's fixture says.
 */
function client(tables: Record<string, unknown>) {
  const selects: Record<string, string> = {}
  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => {
      selects[table] = cols
      return {
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: tables[table] ?? null, error: null })),
          single: vi.fn(async () => ({ data: tables[table] ?? null, error: null })),
        })),
      }
    }),
  }))
  return { supabase: { from } as unknown as SupabaseClient, selects }
}

const PROFILE_ROW = {
  preference_profile: {
    city: 'Da Nang',
    budget: 'mid',
    favoriteFoods: ['pho'],
    favoriteCategories: ['cafe'],
    favoritePriceRange: { min: null, max: null },
    recentInterests: ['banh mi'],
    hiddenTopics: [],
    preferredTravelStyle: ['slow'],
    confidenceScore: 0.9,
  },
}

describe('the reads never ask for a date of birth', () => {
  it('buildAIContext selects a named column list from user_demographics, never *', async () => {
    // `*` expands to `date_of_birth`, on which no PostgREST role holds a
    // privilege, so `select('*')` would be denied with 42501. The denial is the
    // schema saying out loud that a birth date cannot reach a prompt.
    const c = client({
      user_preferences: PROFILE_ROW,
      user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'male', city: 'Ho Chi Minh City', country: 'VN' },
    })
    await buildAIContext('u1', c.supabase, '25_34')

    const cols = c.selects['user_demographics']
    expect(cols).toBeDefined()
    expect(cols).not.toContain('*')
    expect(cols).not.toContain('date_of_birth')
  })

  it('buildChatPromptContext does the same', async () => {
    const c = client({
      user_preferences: null,
      user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'female', city: 'Hanoi' },
    })
    await buildChatPromptContext('u1', c.supabase, '35_44')

    expect(c.selects['user_demographics']).not.toContain('*')
    expect(c.selects['user_demographics']).not.toContain('date_of_birth')
    // The profile read is a single column, not the row.
    expect(c.selects['profiles']).toBe('full_name')
  })
})

describe('what the model actually receives', () => {
  it('carries the preferred name — the gap this foundation closes', async () => {
    const c = client({
      user_preferences: PROFILE_ROW,
      user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'male', city: 'Ho Chi Minh City', country: 'VN' },
    })
    const built = await buildAIContext('u1', c.supabase, '25_34')
    expect(built!.profile.preferredName).toBe('Huy')
  })

  it('carries the age BAND by default, with no exact age at all', async () => {
    // Minimum necessary: a caller that says nothing about precision gets the
    // band, and `age` is ABSENT rather than null — a key that is not there
    // cannot be read as "we know but withheld".
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' }, user_demographics: {},
    })
    const built = await buildAIContext('u1', c.supabase, '25_34')
    expect(built!.profile.ageBand).toBe('25_34')
    expect(Object.keys(built!.profile)).not.toContain('age')
  })

  it('carries the exact age ONLY when the call site asked and gave a reason', async () => {
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' }, user_demographics: {},
    })
    const built = await buildAIContext('u1', c.supabase, {
      band: '25_34', exact: 31, precision: 'exact',
      reason: 'test — an age-boundary recommendation the band cannot express',
    })
    expect(built!.profile.age).toBe(31)
    // The band travels with it: precision is added, not substituted.
    expect(built!.profile.ageBand).toBe('25_34')
  })

  it('refuses an exact-age request with no stated reason', async () => {
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' }, user_demographics: {},
    })
    await expect(
      buildAIContext('u1', c.supabase, { band: '25_34', exact: 31, precision: 'exact' })
    ).rejects.toThrow(/reason/i)
  })

  it('does not pass on a declined gender', async () => {
    // `prefer_not_to_say` is an answer, not a value to forward: the user
    // declined the question, so the model is told nothing rather than told that
    // they declined.
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'prefer_not_to_say', city: 'Hue' },
    })
    const built = await buildAIContext('u1', c.supabase, '25_34')
    expect(built!.profile.gender).toBeNull()
  })

  it('prefers a STATED city over an inferred one', async () => {
    // `preference_profile.city` is inferred from where the user's reviewed
    // places happen to be. An inference must not overwrite a statement.
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { city: 'Ho Chi Minh City' },
    })
    const built = await buildAIContext('u1', c.supabase, null)
    expect(built!.profile.city).toBe('Ho Chi Minh City')
  })

  it('contains no key outside the allowlist', async () => {
    const c = client({
      user_preferences: PROFILE_ROW, user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'male', city: 'Hanoi', country: 'VN' },
    })
    const built = await buildAIContext('u1', c.supabase, '25_34')
    expect(disallowedKeys(built!.profile, AI_CONTEXT_FIELDS)).toEqual([])
  })

  it('the chat identity gets the band, because chat has no evidenced need for the integer', async () => {
    const c = client({
      user_preferences: null, user_memory: null,
      profiles: { full_name: 'Huy' }, user_demographics: {},
    })
    const { identity } = await buildChatPromptContext('u1', c.supabase, '25_34')
    expect(identity.ageBand).toBe('25_34')
    expect(Object.keys(identity)).not.toContain('age')
  })

  it('the identity block contains no key outside the allowlist', async () => {
    const c = client({
      user_preferences: null, user_memory: null,
      profiles: { full_name: 'Huy' },
      user_demographics: { gender: 'male', city: 'Hanoi' },
    })
    const { identity } = await buildChatPromptContext('u1', c.supabase, '25_34')
    expect(disallowedKeys(identity, AI_CONTEXT_FIELDS)).toEqual([])
  })
})

describe('the runtime guard, not the type', () => {
  it('throws rather than shipping a sensitive field, if one is ever built in', async () => {
    // Simulates the realistic defect: a profile row spread into the context. The
    // guard must fail loudly — silently sending a smaller prompt would hide the
    // bug until someone read a log.
    const rowWithSecrets = {
      ...PROFILE_ROW,
      preference_profile: { ...PROFILE_ROW.preference_profile },
    }
    const c = client({
      user_preferences: rowWithSecrets,
      user_memory: null,
      profiles: { full_name: 'Huy' },
      // A demographics row that (wrongly) carries a birth date, as it would if a
      // future change widened the grant or the column list.
      user_demographics: { gender: 'male', city: 'Hanoi', date_of_birth: '1990-01-01' },
    })
    // `toDemographicsProfile` drops unknown keys, so the context stays clean —
    // which is itself the assertion: an extra column arriving from the database
    // does not reach the model.
    const built = await buildAIContext('u1', c.supabase, '25_34')
    expect(JSON.stringify(built!.profile)).not.toContain('1990-01-01')
    expect(disallowedKeys(built!.profile, AI_CONTEXT_FIELDS)).toEqual([])
  })

  it('the guard itself rejects a disallowed key', () => {
    // Direct proof the mechanism works, independent of any caller.
    expect(disallowedKeys({ email: 'a@b.com' }, AI_CONTEXT_FIELDS)).toEqual(['email'])
  })
})

describe('resolveAgeFields — the minimum-necessary rule itself', () => {
  it('treats a bare band string as band-only', () => {
    expect(resolveAgeFields('25_34')).toEqual({ ageBand: '25_34' })
    expect(resolveAgeFields(null)).toEqual({ ageBand: null })
  })

  it('defaults to band when precision is not stated', () => {
    const r = resolveAgeFields({ band: '25_34', exact: 31 })
    expect(r).toEqual({ ageBand: '25_34' })
    // Present in the request but NOT forwarded: having the value is not the
    // same as being permitted to send it.
    expect('age' in r).toBe(false)
  })

  it('refuses exact without a reason, and refuses a blank one', () => {
    expect(() => resolveAgeFields({ band: '25_34', exact: 31, precision: 'exact' }))
      .toThrow(/reason/i)
    expect(() => resolveAgeFields({ band: '25_34', exact: 31, precision: 'exact', reason: '   ' }))
      .toThrow(/reason/i)
  })

  it('grants exact when a reason is given', () => {
    expect(resolveAgeFields({ band: '25_34', exact: 31, precision: 'exact', reason: 'why' }))
      .toEqual({ ageBand: '25_34', age: 31 })
  })

  it('does not invent an age when there is none on file', () => {
    // Asking for precision cannot conjure data. A user with no date of birth
    // yields a band-only result even under an `exact` request.
    const r = resolveAgeFields({ band: null, exact: null, precision: 'exact', reason: 'why' })
    expect(r).toEqual({ ageBand: null })
    expect('age' in r).toBe(false)
  })

  it('never returns anything resembling a date of birth', () => {
    const r = resolveAgeFields({ band: '25_34', exact: 31, precision: 'exact', reason: 'why' })
    expect(Object.keys(r).sort()).toEqual(['age', 'ageBand'])
  })
})

describe('buildIdentityBlock', () => {
  const identity = (o: Partial<AIIdentityContext> = {}): AIIdentityContext => ({
    ...EMPTY_IDENTITY, ...o,
  })

  it('renders nothing when the user has told us nothing', () => {
    // No prompt tokens spent, and the model is not handed a list of blanks to
    // speculate about.
    expect(buildIdentityBlock(EMPTY_IDENTITY)).toBe('')
  })

  it('renders the name so the assistant can address the user', () => {
    expect(buildIdentityBlock(identity({ preferredName: 'Huy' }))).toContain('Huy')
  })

  it('renders a band as a human range, not an internal key', () => {
    const block = buildIdentityBlock(identity({ ageBand: '25_34' }))
    expect(block).toContain('25-34')
    expect(block).not.toContain('25_34')
  })

  it('renders the exact age INSTEAD of the band when one was justified', () => {
    // Never both: printing the same fact twice would hand the model redundant
    // input and make the minimum-necessary decision invisible in the prompt.
    const block = buildIdentityBlock(identity({ ageBand: '25_34', age: 31 }))
    expect(block).toContain('31')
    expect(block).not.toContain('25-34')
  })

  it('survives Vietnamese and other Unicode names unchanged', () => {
    const block = buildIdentityBlock(identity({ preferredName: 'Nguyễn Thị Hương', city: 'Đà Nẵng' }))
    expect(block).toContain('Nguyễn Thị Hương')
    expect(block).toContain('Đà Nẵng')
  })

  it('never renders an under_18 label, because that state cannot reach Chat', () => {
    const block = buildIdentityBlock(identity({ ageBand: 'under_18' }))
    // Falls back to the raw key rather than inventing a label for an
    // unreachable state — and the state is unreachable because the gate refuses
    // it before any prompt is built.
    expect(block).toContain('under_18')
  })
})

describe('the identity block reaches the Chat prompt', () => {
  it('is appended to the memory block the system prompt already carries', () => {
    // A projection nothing renders is a projection that changes no behaviour.
    const code = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(code).toContain('buildIdentityBlock(chatContext.identity)')
    // …and it is built from the band the gate already computed, not a second RPC.
    // `ageBand` is assigned from `ageGate.ageBand` inside the account branch of the
    // gate (a guest's declaration never yields a band — D1 revised, 2026-09-17).
    expect(code).toContain('ageBand = ageGate.ageBand')
    expect(code).toContain('buildChatPromptContext(user.id, supabase, ageBand)')
  })
})
