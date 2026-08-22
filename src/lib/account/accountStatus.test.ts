import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateAccountStatus,
  getAccountRestriction,
  accountRestrictionCode,
  accountRestrictionMessage,
  ACCOUNT_STATUS_COLUMNS,
  type AccountStatusRow,
} from './accountStatus'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOW = new Date('2026-08-19T12:00:00Z')
const row = (o: Partial<AccountStatusRow>): AccountStatusRow => ({
  is_suspended: false, suspended_until: null, is_banned: false, ...o,
})

describe('absent row means ACTIVE', () => {
  it('treats null as active — there is no backfill and no signup trigger', () => {
    expect(evaluateAccountStatus(null, NOW)).toEqual({ blocked: false, reason: null, suspendedUntil: null })
    expect(evaluateAccountStatus(undefined, NOW).blocked).toBe(false)
  })

  it('treats an all-false row as active', () => {
    expect(evaluateAccountStatus(row({}), NOW).blocked).toBe(false)
  })
})

describe('suspension', () => {
  it('blocks an indefinite suspension', () => {
    const r = evaluateAccountStatus(row({ is_suspended: true }), NOW)
    expect(r).toEqual({ blocked: true, reason: 'suspended', suspendedUntil: null })
  })

  it('blocks while suspended_until is still in the future', () => {
    const r = evaluateAccountStatus(row({ is_suspended: true, suspended_until: '2026-08-20T00:00:00Z' }), NOW)
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('suspended')
    expect(r.suspendedUntil).toBe('2026-08-20T00:00:00Z')
  })

  it('RELEASES once suspended_until has passed, without waiting for the cron', () => {
    const r = evaluateAccountStatus(row({ is_suspended: true, suspended_until: '2026-08-19T11:59:59Z' }), NOW)
    expect(r.blocked).toBe(false)
    expect(r.reason).toBeNull()
  })

  it('is decided by the timestamp, not the boolean — the flag alone does not free anyone', () => {
    const future = evaluateAccountStatus(row({ is_suspended: true, suspended_until: '2026-08-19T12:00:01Z' }), NOW)
    const past = evaluateAccountStatus(row({ is_suspended: true, suspended_until: '2026-08-19T11:59:59Z' }), NOW)
    expect([future.blocked, past.blocked]).toEqual([true, false])
  })

  it('does NOT free a suspended account on an unparseable timestamp', () => {
    const r = evaluateAccountStatus(row({ is_suspended: true, suspended_until: 'not-a-date' }), NOW)
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('suspended')
  })
})

describe('ban', () => {
  it('blocks', () => {
    expect(evaluateAccountStatus(row({ is_banned: true }), NOW)).toEqual({
      blocked: true, reason: 'banned', suspendedUntil: null,
    })
  })

  it('outranks a suspension, including an EXPIRED one', () => {
    const r = evaluateAccountStatus(
      row({ is_banned: true, is_suspended: true, suspended_until: '2020-01-01T00:00:00Z' }), NOW
    )
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('banned')
  })
})

describe('the query', () => {
  const client = (result: unknown) => {
    const maybeSingle = vi.fn().mockResolvedValue(result)
    const eq = vi.fn((_col: string, _val: string) => ({ maybeSingle }))
    const select = vi.fn((_cols: string) => ({ eq }))
    const from = vi.fn((_table: string) => ({ select }))
    return { supabase: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle }
  }

  it('reads account_status by user_id, never profiles', async () => {
    const c = client({ data: null, error: null })
    await getAccountRestriction(c.supabase, 'u1', NOW)
    expect(c.from).toHaveBeenCalledWith('account_status')
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('selects only the granted columns — never * and never ban_reason', async () => {
    const c = client({ data: null, error: null })
    await getAccountRestriction(c.supabase, 'u1', NOW)
    const requested = c.select.mock.calls[0][0]
    expect(requested).toBe(ACCOUNT_STATUS_COLUMNS)
    expect(requested).not.toContain('*')
    expect(requested).not.toContain('ban_reason')
  })

  it('uses maybeSingle, so a missing row is not an error', async () => {
    const c = client({ data: null, error: null })
    const r = await getAccountRestriction(c.supabase, 'u1', NOW)
    expect(c.maybeSingle).toHaveBeenCalled()
    expect(r.blocked).toBe(false)
  })

  it('blocks when the row says so', async () => {
    const c = client({ data: row({ is_suspended: true }), error: null })
    expect((await getAccountRestriction(c.supabase, 'u1', NOW)).reason).toBe('suspended')
  })
})

describe('read failure is allowed through, loudly', () => {
  afterEach(() => vi.restoreAllMocks())

  it('allows and logs when the query errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }) }) }),
    } as unknown as SupabaseClient
    const r = await getAccountRestriction(supabase, 'u1', NOW)
    expect(r.blocked).toBe(false)
    expect(err).toHaveBeenCalled()
  })

  it('allows and logs when the query throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = { from: () => { throw new Error('network') } } as unknown as SupabaseClient
    const r = await getAccountRestriction(supabase, 'u1', NOW)
    expect(r.blocked).toBe(false)
    expect(err).toHaveBeenCalled()
  })
})

describe('client-facing payload', () => {
  it('gives a stable code per reason', () => {
    expect(accountRestrictionCode('suspended')).toBe('account_suspended')
    expect(accountRestrictionCode('banned')).toBe('account_banned')
  })

  it('says browsing still works for a suspension, and does not for a ban', () => {
    const susp = accountRestrictionMessage({ blocked: true, reason: 'suspended', suspendedUntil: null })
    const ban = accountRestrictionMessage({ blocked: true, reason: 'banned', suspendedUntil: null })
    expect(susp).toContain('xem nội dung')
    expect(ban).not.toContain('xem nội dung')
  })

  it('names the expiry date when the suspension is time-limited', () => {
    const m = accountRestrictionMessage({ blocked: true, reason: 'suspended', suspendedUntil: '2026-08-20T00:00:00Z' })
    expect(m).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('never leaks ban_reason — the guard has no access to it', () => {
    const src = readFileSync(join(__dirname, 'accountStatus.ts'), 'utf8')
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toContain('ban_reason')
  })
})

describe('the three surfaces named by 10 §4 are guarded', () => {
  const REPO = join(__dirname, '..', '..', '..')
  const SURFACES: Array<[string, string]> = [
    ['post content', 'src/app/api/reviews/route.ts'],
    ['comment', 'src/app/api/reviews/[id]/comments/route.ts'],
    ['use AI', 'src/app/api/chat/route.ts'],
  ]

  // `toContain('getAccountRestriction')` is NOT enough: the import statement
  // alone satisfies it, so deleting the call and hardcoding
  // `{ blocked: false }` would pass. Mutation testing found exactly that.
  // Assert the AWAITED CALL EXPRESSION, then that its result gates a 403.
  it.each(SURFACES)('%s — %s awaits the guard and gates a 403 on it', (_label, rel) => {
    const src = readFileSync(join(REPO, rel), 'utf8')

    expect(src, 'must await the real guard, not a stand-in')
      .toMatch(/await\s+getAccountRestriction\s*\(\s*supabase\s*,\s*user\.id\s*\)/)

    const gate = /if\s*\(\s*restriction\.blocked\s*\)\s*\{[\s\S]{0,400}?403/
    expect(src, 'the 403 must be gated on restriction.blocked').toMatch(gate)
  })
})
