import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { userBlocksEnabled, blockedPeers, UUID_RE } from './userBlocks'

describe('userBlocksEnabled', () => {
  it('OFF unless the variable is exactly «true»', () => {
    expect(userBlocksEnabled({})).toBe(false)
    for (const v of ['1', 'TRUE', 'yes', 'false', '']) expect(userBlocksEnabled({ USER_BLOCKS_ENABLED: v })).toBe(false)
    expect(userBlocksEnabled({ USER_BLOCKS_ENABLED: 'true' })).toBe(true)
  })
})

const ME = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'
const C = '44444444-4444-4444-8444-444444444444'

// A fake admin client: rows[table] = [{blocker_id, blocked_id}]; the builder answers .select().eq().in() like PostgREST.
function fake(rows: Record<string, Array<{ blocker_id: string; blocked_id: string }>>, fail = false) {
  return {
    from: (table: string) => ({
      select: (col: 'blocked_id' | 'blocker_id') => ({
        eq: (eqCol: string, eqVal: string) => ({
          in: async (_inCol: string, list: string[]) => {
            if (fail) throw new Error('boom')
            return { data: (rows[table] ?? []).filter((r) => (r as Record<string, string>)[eqCol] === eqVal && list.includes((r as Record<string, string>)[col])).map((r) => ({ [col]: (r as Record<string, string>)[col] })) }
          },
        }),
      }),
    }),
  } as never
}

describe('blockedPeers — both directions, both tables, service role', () => {
  it('finds the people I blocked and the people who blocked me; a chat-only block is NOT read (review 02/10)', async () => {
    const admin = fake({
      user_blocks: [{ blocker_id: ME, blocked_id: A }],
      chat_blocks: [{ blocker_id: B, blocked_id: ME }],
    })
    expect([...(await blockedPeers(admin, ME, [A, B, C]))].sort()).toEqual([A].sort())
  })
  it('ignores ids that are not UUIDs and my own id', async () => {
    expect([...(await blockedPeers(fake({ user_blocks: [{ blocker_id: ME, blocked_id: A }] }), ME, ['x', ME, A]))]).toEqual([A])
    expect(UUID_RE.test(A)).toBe(true)
  })
  it('a failed read returns an EMPTY set (a visibility filter over RLS, not the authority)', async () => {
    expect((await blockedPeers(fake({}, true), ME, [A])).size).toBe(0)
  })
})

describe('the app-visible flag and the files this slice must not touch', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8')
  it('/api/config publishes p8.userBlocks from the same switch; reports from REPORTS_ENABLED', () => {
    const cfg = read('src/app/api/config/route.ts')
    expect(cfg).toMatch(/p8: \{[\s\S]*reports: reportsEnabled\(\),[\s\S]*userBlocks: userBlocksEnabled\(\),[\s\S]*commentModeration: userBlocksEnabled\(\)/)
  })
})
