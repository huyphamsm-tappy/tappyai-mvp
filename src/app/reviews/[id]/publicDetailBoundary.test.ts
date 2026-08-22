/**
 * F1 — the public review detail page must not serve unpublished content.
 *
 * Found in UAT: `/reviews/[id]` filtered only on `is_hidden`. Nothing leaked,
 * because the database's RESTRICTIVE policy refuses held rows to anyone but
 * their author — but the page carried none of the guard the five review APIs
 * carry, so it stood entirely on a policy living in another system.
 *
 * The fake below really applies `.eq()` and `.or()` to fixture rows, so deleting
 * the filter from the query makes a restricted row appear here and these fail.
 * A test that only asserted the string `publishableFilter` appeared in the file
 * would pass with the call deleted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = { rows: [] as Row[] }

  const clause = (row: Row, c: string): boolean => {
    const [col, ...rest] = c.split('.')
    const op = rest.join('.')
    if (op === 'is.null') return row[col] === null || row[col] === undefined
    if (op === 'not.is.null') return row[col] !== null && row[col] !== undefined
    if (op.startsWith('eq.')) return String(row[col]) === op.slice(3)
    throw new Error(`unsupported or() clause: ${c}`)
  }

  const builder = () => {
    const preds: ((r: Row) => boolean)[] = []
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => { preds.push(r => r[col] === val); return b },
      or: (expr: string) => {
        const cs = expr.split(',')
        preds.push(r => cs.some(c => clause(r, c)))
        return b
      },
      // PostgREST semantics: `.single()` on zero rows is an ERROR, not null data.
      single: () => {
        const hits = state.rows.filter(r => preds.every(p => p(r)))
        return Promise.resolve(
          hits.length === 1
            ? { data: hits[0], error: null }
            : { data: null, error: { code: 'PGRST116' } },
        )
      },
    }
    return b
  }

  return { state, client: { from: () => builder() } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))

import { getReview } from './getReview'

const PUBLISHED = '11111111-1111-4111-8111-111111111111'
const RESTRICTED = '22222222-2222-4222-8222-222222222222'
const LEGACY = '33333333-3333-4333-8333-333333333333'
const HIDDEN = '44444444-4444-4444-8444-444444444444'

const row = (id: string, publication_state: string | null, over: Row = {}): Row => ({
  id,
  user_id: 'author-1',
  place_name: 'Quán Ngon',
  body: 'ngon',
  rating: 5,
  is_hidden: false,
  publication_state,
  ...over,
})

beforeEach(() => {
  // Without this the gate's filter is inert and every assertion below is vacuous.
  process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = 'true'
  h.state.rows = [
    row(PUBLISHED, 'PUBLISHED'),
    row(RESTRICTED, 'RESTRICTED'),
    row(LEGACY, null),
    row(HIDDEN, 'PUBLISHED', { is_hidden: true }),
  ]
})

describe('F1 — public review detail boundary', () => {
  it('a PUBLISHED post is served', async () => {
    expect((await getReview(PUBLISHED))?.id).toBe(PUBLISHED)
  })

  it('🚨 a RESTRICTED post is NOT served', async () => {
    expect(await getReview(RESTRICTED)).toBeNull()
  })

  it('a legacy row (publication_state NULL) keeps its prior visibility', async () => {
    expect((await getReview(LEGACY))?.id).toBe(LEGACY)
  })

  it('an author-hidden post stays hidden — the older rule still applies', async () => {
    expect(await getReview(HIDDEN)).toBeNull()
  })

  it('an UNDER_REVIEW post is not served either', async () => {
    h.state.rows = [row(PUBLISHED, 'UNDER_REVIEW')]
    expect(await getReview(PUBLISHED)).toBeNull()
  })

  /**
   * The page uses the anon SSR client, so "anonymous" and "another user" are the
   * same code path here and both are already refused by the query itself — the
   * row never reaches the page regardless of who is asking. The author is
   * refused too, deliberately: this is the shareable public URL, and their own
   * copy lives on their profile.
   */
  it('🚨 the author is refused here as well — no viewer-dependent public URL', async () => {
    expect(await getReview(RESTRICTED)).toBeNull()
  })

  it('the guard is inert before the schema migration, exactly as the API guard is', async () => {
    // Deploy-order safety: filtering a column that does not exist yet would take
    // the page down. Legacy behaviour must survive until the migration lands.
    process.env.CONTENT_SAFETY_SCHEMA_MIGRATED = ''
    expect((await getReview(RESTRICTED))?.id).toBe(RESTRICTED)
  })
})
