import { describe, it, expect, vi, beforeEach } from 'vitest'

// The PRODUCTION membership repository's roster read (Owner Decision D6).
//
// `membershipRoster.test.ts` proves the service and the in-memory repository.
// This proves the one that actually runs: `listDepartmentRoster` does not
// re-filter what the repository returns — the port promises active-only and
// each implementation keeps that promise its own way. For the in-memory one
// that is an array filter; for this one it is a WHERE clause, and nothing else
// stands between a dropped `.eq('status', 'active')` and suspended memberships
// on the roster.

const h = vi.hoisted(() => ({
  captured: null as { table?: string; columns?: string; eq: Array<[string, string]>; order?: string } | null,
  result: { data: null as unknown[] | null, error: null as { code?: string } | null },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const state = { eq: [] as Array<[string, string]> } as NonNullable<typeof h.captured>
    h.captured = state
    const chain = {
      select(columns: string) { state.columns = columns; return chain },
      eq(column: string, value: string) { state.eq.push([column, value]); return chain },
      order(column: string) { state.order = column; return Promise.resolve(h.result) },
      maybeSingle() { return Promise.resolve(h.result) },
      then(res: (v: unknown) => unknown) { return Promise.resolve(h.result).then(res) },
    }
    return { from(table: string) { state.table = table; return chain } }
  },
}))

import { supabaseMembershipRepository } from '../server'

beforeEach(() => {
  h.captured = null
  h.result = { data: [], error: null }
})

describe('D6 · the production roster query', () => {
  it('reads department_membership filtered to active', async () => {
    await supabaseMembershipRepository().listAllActive()
    expect(h.captured?.table).toBe('department_membership')
    expect(h.captured?.eq).toContainEqual(['status', 'active'])
  })

  it('selects user_id — without it every row would be attributed to nobody', async () => {
    // Every other read in this repository is already scoped to one known user,
    // so `user_id` is not in their projection. The roster is the first read
    // that spans users, and the column it needs is the one none of them select.
    await supabaseMembershipRepository().listAllActive()
    expect(h.captured?.columns).toContain('user_id')
  })

  it('orders by department so the roster is stable between reads', async () => {
    await supabaseMembershipRepository().listAllActive()
    expect(h.captured?.order).toBe('department_id')
  })

  it('maps rows onto the membership shape, carrying the user id from the row', async () => {
    h.result = {
      data: [{ user_id: 'u-9', department_id: 'ai_data', org_role: 'DEPARTMENT_HEAD', scope: 'ai_data', status: 'active' }],
      error: null,
    }
    const rows = await supabaseMembershipRepository().listAllActive()
    expect(rows).toEqual([
      { userId: 'u-9', departmentId: 'ai_data', orgRole: 'DEPARTMENT_HEAD', scope: 'ai_data', status: 'active' },
    ])
  })

  it('throws on a read error rather than reporting an empty roster', async () => {
    // [] on error is indistinguishable from "no memberships exist" — a claim an
    // operator would act on. Same reasoning as every other read in this file.
    h.result = { data: null, error: { code: '42501' } }
    await expect(supabaseMembershipRepository().listAllActive()).rejects.toThrow(/42501/)
  })

  it('a null data set reads as no rows, not as a crash', async () => {
    h.result = { data: null, error: null }
    await expect(supabaseMembershipRepository().listAllActive()).resolves.toEqual([])
  })
})
