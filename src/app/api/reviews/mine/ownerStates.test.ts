/**
 * P2b (2026-09-28) — the owner's profile splits `/api/reviews/mine` into Published / Restricted /
 * Hidden on the client (`ownPostStates.ts`). This runs the REAL route and the REAL moderation
 * payload into that partition, so a change to either side that would silently drop a post from
 * every tab (or leak a held post into Published) fails here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { user: null as any, rows: [] as Record<string, unknown>[] }
  const builder = (table: string) => {
    const preds: ((r: Record<string, unknown>) => boolean)[] = []
    const b: any = {
      select: () => b, order: () => b, limit: () => b, in: () => b,
      eq: (col: string, val: unknown) => { if (table === 'reviews') preds.push(r => r[col] === val); return b },
      then: (res: any) => {
        const data = table === 'reviews' ? state.rows.filter(r => preds.every(p => p(r))) : []
        return Promise.resolve({ data, error: null }).then(res)
      },
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }) }))
vi.mock('@/lib/media/servableMedia', () => ({ stripUnservableMedia: (r: unknown) => r }))

import { GET } from './route'
import { ownPostState, postsInState } from '@/app/(app)/profile/ownPostStates'

const req = () => new Request('http://t/api/reviews/mine', { headers: { 'accept-language': 'vi' } }) as any

beforeEach(() => {
  h.state.user = { id: 'me' }
  h.state.rows = [
    { id: 'legacy', user_id: 'me', is_hidden: false, publication_state: null, safety_state: null },
    { id: 'live', user_id: 'me', is_hidden: false, publication_state: 'PUBLISHED', safety_state: 'SAFE' },
    { id: 'pending', user_id: 'me', is_hidden: false, publication_state: 'UNDER_REVIEW', safety_state: 'HUMAN_REVIEW_REQUIRED' },
    { id: 'blocked', user_id: 'me', is_hidden: false, publication_state: 'RESTRICTED', safety_state: 'VIOLATION' },
    { id: 'hidden', user_id: 'me', is_hidden: true, publication_state: 'PUBLISHED', safety_state: 'SAFE' },
    { id: 'hidden-held', user_id: 'me', is_hidden: true, publication_state: 'UNDER_REVIEW', safety_state: 'UNDETERMINED' },
    { id: 'theirs', user_id: 'them', is_hidden: false, publication_state: 'RESTRICTED', safety_state: 'VIOLATION' },
  ]
})

describe('owner profile states from /api/reviews/mine', () => {
  it('every own post lands in exactly one state; nobody else\'s post appears', async () => {
    const { reviews } = await (await GET(req())).json()
    const ids = (s: 'published' | 'restricted' | 'hidden') => postsInState(reviews, s).map((r: any) => r.id)
    expect(ids('published')).toEqual(['legacy', 'live'])
    expect(ids('restricted')).toEqual(['pending', 'blocked'])
    expect(ids('hidden')).toEqual(['hidden', 'hidden-held'])
    expect(reviews.map((r: any) => r.id)).not.toContain('theirs')
  })

  it('the split works without the raw lifecycle columns reaching the client', async () => {
    const { reviews } = await (await GET(req())).json()
    for (const r of reviews) {
      expect('publication_state' in r).toBe(false)
      expect('safety_state' in r).toBe(false)
    }
  })

  it('an anonymous caller gets 401 — there is no state list for a visitor', async () => {
    h.state.user = null
    expect((await GET(req())).status).toBe(401)
  })
})

describe('ownPostState', () => {
  it('hidden wins over a moderation state; no payload = public', () => {
    expect(ownPostState({ is_hidden: true, moderation: { state: 'RESTRICTED' } })).toBe('hidden')
    expect(ownPostState({})).toBe('published')
    expect(ownPostState({ moderation: { state: 'PUBLISHED' } })).toBe('published')
    expect(ownPostState({ moderation: { state: 'UNDER_REVIEW' } })).toBe('restricted')
  })
})
