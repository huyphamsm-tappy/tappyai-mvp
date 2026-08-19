/**
 * F3 — the public profile post count must mean "publicly visible".
 *
 * UAT finding: the count filtered `is_hidden` but not the publication state, so
 * it counted posts nobody can reach. Worse, it counted them differently
 * depending on who asked: RLS lets an author read their own held rows, so the
 * author saw a bigger number than every visitor and had no way to tell why.
 *
 * The fake really applies `.eq()` and `.or()` to fixture rows, so deleting the
 * filter from the query makes a restricted post reappear in the count.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = { rows: [] as Row[], user: null as any }

  const clause = (row: Row, c: string): boolean => {
    const [col, ...rest] = c.split('.')
    const op = rest.join('.')
    if (op === 'is.null') return row[col] === null || row[col] === undefined
    if (op === 'not.is.null') return row[col] !== null && row[col] !== undefined
    if (op.startsWith('eq.')) return String(row[col]) === op.slice(3)
    throw new Error(`unsupported or() clause: ${c}`)
  }

  const builder = (table: string) => {
    const preds: ((r: Row) => boolean)[] = []
    const b: any = {
      select: (_c?: string, opts?: { count?: string; head?: boolean }) => {
        b.__counting = opts?.count === 'exact'
        return b
      },
      eq: (col: string, val: unknown) => { preds.push(r => r[col] === val); return b },
      or: (expr: string) => {
        const cs = expr.split(',')
        preds.push(r => cs.some(c => clause(r, c)))
        return b
      },
      single: () =>
        Promise.resolve(
          table === 'profiles'
            ? { data: { id: 'author-1', full_name: 'A', avatar_url: null, follower_count: 0, following_count: 0 }, error: null }
            : { data: null, error: { code: 'PGRST116' } },
        ),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res: any) => {
        const hits = table === 'reviews' ? state.rows.filter(r => preds.every(p => p(r))) : []
        return Promise.resolve({ data: null, count: hits.length, error: null }).then(res)
      },
    }
    return b
  }

  return { state, client: { from: (t: string) => builder(t) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

import { GET } from './route'

const review = (publication_state: string | null, is_hidden = false): Row => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'author-1',
  is_hidden,
  publication_state,
})

const countFor = async (viewer: string | null) => {
  h.state.user = viewer ? { id: viewer } : null
  const res = await GET({} as any, { params: { id: 'author-1' } })
  return (await res.json()).review_count as number
}

beforeEach(() => {
  // Without this the filter is inert and every assertion is vacuous.
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
  h.state.rows = [
    review('PUBLISHED'),
    review('PUBLISHED'),
    review('RESTRICTED'),
    review('UNDER_REVIEW'),
    review(null),            // legacy — publicly visible, so it counts
    review('PUBLISHED', true), // author-hidden — excluded by the older rule
  ]
})

describe('F3 — public profile post count', () => {
  it('counts published and legacy posts only', async () => {
    expect(await countFor(null)).toBe(3)
  })

  it('🚨 does not count RESTRICTED posts', async () => {
    h.state.rows = [review('PUBLISHED'), review('RESTRICTED'), review('RESTRICTED')]
    expect(await countFor(null)).toBe(1)
  })

  it('does not count UNDER_REVIEW posts', async () => {
    h.state.rows = [review('PUBLISHED'), review('UNDER_REVIEW')]
    expect(await countFor(null)).toBe(1)
  })

  it('🚨 the AUTHOR sees the same number as everyone else', async () => {
    // The bug this closes: RLS lets the author read their own held rows, so
    // without the filter their count silently exceeded the public one.
    const anonymous = await countFor(null)
    const otherUser = await countFor('someone-else')
    const author = await countFor('author-1')
    expect(author).toBe(anonymous)
    expect(otherUser).toBe(anonymous)
  })

  it('author-hidden posts stay excluded — the older rule still applies', async () => {
    h.state.rows = [review('PUBLISHED'), review('PUBLISHED', true)]
    expect(await countFor(null)).toBe(1)
  })

  it('the guard is inert before the schema migration, so deploy order stays safe', async () => {
    process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = ''
    h.state.rows = [review('PUBLISHED'), review('RESTRICTED')]
    expect(await countFor(null)).toBe(2)
  })
})
