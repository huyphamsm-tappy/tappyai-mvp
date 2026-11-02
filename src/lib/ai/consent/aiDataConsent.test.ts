import { describe, it, expect, vi } from 'vitest'
import { AI_DATA_CONSENT_VERSION, allowedIds, consentState, isAllowed, loadAllowedUserIds, type ConsentRow } from '@/lib/ai/consent/aiDataConsent'

// Server-side AI data consent (App Review 5.1.1(i) / 5.1.2(i)). Two questions, kept apart:
//   1. Has this account used the iOS app? If not (web-only), nothing iOS-originated is involved and the existing behaviour
//      stands. If yes, its personal data may go to the AI provider in a background task only while it has agreed to the
//      current disclosure. A missing record for an iOS account is "not asked", never "agreed".
//   2. The decision itself: unasked, agreed, refused, withdrawn, or agreed to an older disclosure (stale).
const V = AI_DATA_CONSENT_VERSION

describe('consentState — the six states an account can be in', () => {
  it('web-only: no row, or a row that records no iOS use (status quo, allowed)', () => {
    expect(consentState(undefined)).toBe('web_only')
    expect(consentState(null)).toBe('web_only')
    expect(consentState({ user_id: 'a', ios_used: false, granted: null, decision: null, version: null })).toBe('web_only')
    expect(isAllowed(consentState(undefined))).toBe(true)
  })

  it('iOS, not yet asked/answered: used iOS, granted is null → blocked (never assumed agreed)', () => {
    const row: ConsentRow = { user_id: 'a', ios_used: true, granted: null, decision: null, version: null }
    expect(consentState(row)).toBe('ios_unasked')
    expect(isAllowed(consentState(row))).toBe(false)
  })

  it('iOS, agreed to the current disclosure → allowed', () => {
    const row: ConsentRow = { user_id: 'a', ios_used: true, granted: true, decision: 'agreed', version: V }
    expect(consentState(row)).toBe('agreed')
    expect(isAllowed(consentState(row))).toBe(true)
  })

  it('iOS, refused → blocked', () => {
    const row: ConsentRow = { user_id: 'a', ios_used: true, granted: false, decision: 'refused', version: V }
    expect(consentState(row)).toBe('refused')
    expect(isAllowed(consentState(row))).toBe(false)
  })

  it('iOS, withdrawn → blocked', () => {
    const row: ConsentRow = { user_id: 'a', ios_used: true, granted: false, decision: 'withdrawn', version: V }
    expect(consentState(row)).toBe('withdrawn')
    expect(isAllowed(consentState(row))).toBe(false)
  })

  it('iOS, agreed to an OLDER disclosure → stale and blocked (asked again)', () => {
    const row: ConsentRow = { user_id: 'a', ios_used: true, granted: true, decision: 'agreed', version: V - 1 }
    expect(consentState(row)).toBe('stale')
    expect(isAllowed(consentState(row))).toBe(false)
  })

  it('a non-boolean granted value is never an agreement', () => {
    const row = { user_id: 'a', ios_used: true, granted: 'true', decision: null, version: V } as unknown as ConsentRow
    expect(isAllowed(consentState(row))).toBe(false)
  })
})

describe('allowedIds — the set a background task may use', () => {
  it('web-only accounts are allowed; undecided, refused, withdrawn and stale iOS accounts are not', () => {
    const rows: ConsentRow[] = [
      { user_id: 'undecided', ios_used: true, granted: null, decision: null, version: null },
      { user_id: 'refused', ios_used: true, granted: false, decision: 'refused', version: V },
      { user_id: 'withdrawn', ios_used: true, granted: false, decision: 'withdrawn', version: V },
      { user_id: 'stale', ios_used: true, granted: true, decision: 'agreed', version: V - 1 },
      { user_id: 'agreed', ios_used: true, granted: true, decision: 'agreed', version: V },
    ]
    const ids = ['web', 'undecided', 'refused', 'withdrawn', 'stale', 'agreed']
    expect([...allowedIds(ids, rows)].sort()).toEqual(['agreed', 'web'])
  })

  it('a cross-platform account is governed by its iOS state: a web session does not cover an iOS refusal', () => {
    // The same account used iOS and refused. Web activity does not create an agreement, so the account stays blocked.
    const rows: ConsentRow[] = [{ user_id: 'both', ios_used: true, granted: false, decision: 'refused', version: V }]
    expect(allowedIds(['both'], rows).has('both')).toBe(false)
  })

  it('a withdrawal blocks an account that had agreed before', () => {
    const rows: ConsentRow[] = [{ user_id: 'x', ios_used: true, granted: false, decision: 'withdrawn', version: V }]
    expect(allowedIds(['x'], rows).has('x')).toBe(false)
  })

  it('no rows at all: every account is web-only and allowed (existing behaviour kept)', () => {
    expect([...allowedIds(['a', 'b'], [])].sort()).toEqual(['a', 'b'])
    expect([...allowedIds(['a', 'b'], null)].sort()).toEqual(['a', 'b'])
  })
})

/** A stand-in for the Supabase admin client: `from(table).select().in(col, ids)` resolves to `{ data, error }`. */
function fakeAdmin(response: { data: unknown; error: unknown } | 'throw') {
  const calls: { table: string; ids?: string[] }[] = []
  const from = (table: string) => {
    const call: { table: string; ids?: string[] } = { table }
    calls.push(call)
    const builder = {
      select() { return builder },
      in(_col: string, ids: string[]) { call.ids = ids; return builder },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        if (response === 'throw') return Promise.reject(new Error('boom')).then(resolve, reject)
        return Promise.resolve(response).then(resolve, reject)
      },
    }
    return builder
  }
  return { admin: { from } as never, calls }
}

describe('loadAllowedUserIds — fails closed on a read error', () => {
  it('returns the allowed subset from the table', async () => {
    const { admin } = fakeAdmin({
      data: [{ user_id: 'b', ios_used: true, granted: null, decision: null, version: null }],
      error: null,
    })
    expect([...(await loadAllowedUserIds(admin, ['a', 'b']))].sort()).toEqual(['a'])
  })

  it('a read error means nobody is allowed (the generic version is sent instead)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = fakeAdmin({ data: null, error: { message: 'db down' } })
    expect((await loadAllowedUserIds(admin, ['a'])).size).toBe(0)
    spy.mockRestore()
  })

  it('a table missing from the schema cache (PGRST205) is the same as an unapplied migration: web-only, allowed', async () => {
    const { admin } = fakeAdmin({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.ai_data_consent'" } })
    expect([...(await loadAllowedUserIds(admin, ['a', 'b']))].sort()).toEqual(['a', 'b'])
  })

  it('an undefined_table error (42P01) is the same as an unapplied migration: web-only, allowed', async () => {
    const { admin } = fakeAdmin({ data: null, error: { code: '42P01', message: 'relation "ai_data_consent" does not exist' } })
    expect([...(await loadAllowedUserIds(admin, ['a']))]).toEqual(['a'])
  })

  it('another PostgREST error (not a missing table) still fails closed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = fakeAdmin({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
    expect((await loadAllowedUserIds(admin, ['a'])).size).toBe(0)
    spy.mockRestore()
  })

  it('a thrown read means nobody is allowed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = fakeAdmin('throw')
    expect((await loadAllowedUserIds(admin, ['a'])).size).toBe(0)
    spy.mockRestore()
  })

  it('no users means no query at all', async () => {
    const { admin, calls } = fakeAdmin({ data: [], error: null })
    expect((await loadAllowedUserIds(admin, [])).size).toBe(0)
    expect(calls.length).toBe(0)
  })
})
