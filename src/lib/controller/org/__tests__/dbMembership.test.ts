import { describe, it, expect } from 'vitest'
import { dbMembershipResolver, supabaseMembershipStore, type MembershipRow, type MembershipStore } from '../dbMembership'

// FOUNDATION-06 — the DB resolver's validation/mapping and the supabase store's
// fail-closed behaviour, with fakes (the real schema is proven in
// supabase/tests/controller_org_foundation.test.ts).

const store = (rows: MembershipRow[]): MembershipStore => ({ async fetchMemberships() { return rows } })
const row = (over: Partial<MembershipRow> = {}): MembershipRow =>
  ({ department_id: 'marketing', org_role: 'EMPLOYEE', scope: 'marketing', status: 'active', ...over })

describe('dbMembershipResolver — validate + map, fail-closed', () => {
  it('maps a valid active row and stamps the userId', async () => {
    const ms = await dbMembershipResolver(store([row()])).resolve('u1')
    expect(ms).toEqual([{ userId: 'u1', departmentId: 'marketing', orgRole: 'EMPLOYEE', scope: 'marketing', status: 'active' }])
  })
  it('drops rows for an unknown department', async () => {
    expect(await dbMembershipResolver(store([row({ department_id: 'nope' })])).resolve('u1')).toEqual([])
  })
  it('drops rows claiming an ULTIMATE_OWNER org role (owner never comes from a membership)', async () => {
    expect(await dbMembershipResolver(store([row({ org_role: 'ULTIMATE_OWNER' })])).resolve('u1')).toEqual([])
  })
  it('drops rows with an unknown org role', async () => {
    expect(await dbMembershipResolver(store([row({ org_role: 'KING' })])).resolve('u1')).toEqual([])
  })
  it('drops rows whose scope is a FOREIGN department (defense in depth)', async () => {
    expect(await dbMembershipResolver(store([row({ department_id: 'marketing', scope: 'engineering' })])).resolve('u1')).toEqual([])
  })
  it('keeps a GLOBAL-scoped row', async () => {
    const ms = await dbMembershipResolver(store([row({ scope: 'GLOBAL' })])).resolve('u1')
    expect(ms).toHaveLength(1)
    expect(ms[0].scope).toBe('GLOBAL')
  })
  it('returns active memberships only (suspended dropped)', async () => {
    expect(await dbMembershipResolver(store([row({ status: 'suspended' })])).resolve('u1')).toEqual([])
  })
})

// Minimal fake of the supabase-js chain: from().select().eq() → { data, error }.
function fakeClient(result: { data: unknown[] | null; error: { code?: string } | null }) {
  return { from: () => ({ select: () => ({ eq: async () => result }) }) }
}

describe('supabaseMembershipStore — fail-closed on absent schema, loud otherwise', () => {
  it('returns [] when the table does not exist yet (Postgres 42P01)', async () => {
    expect(await supabaseMembershipStore(fakeClient({ data: null, error: { code: '42P01' } })).fetchMemberships('u')).toEqual([])
  })
  it('returns [] when PostgREST has no such table (PGRST205)', async () => {
    expect(await supabaseMembershipStore(fakeClient({ data: null, error: { code: 'PGRST205' } })).fetchMemberships('u')).toEqual([])
  })
  it('THROWS on any other error (an unexpected failure must be loud, not a silent deny)', async () => {
    await expect(supabaseMembershipStore(fakeClient({ data: null, error: { code: '42501' } })).fetchMemberships('u'))
      .rejects.toThrow(/department_membership query failed/)
  })
  it('passes rows straight through on success', async () => {
    const rows = [row()]
    expect(await supabaseMembershipStore(fakeClient({ data: rows, error: null })).fetchMemberships('u')).toEqual(rows)
  })
})
