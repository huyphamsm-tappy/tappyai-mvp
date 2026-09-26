/**
 * GET /api/users/[id] — the public identity record.
 *
 * Serves `bio` and `cover_url` (public presentation, `20260915_profile_public_presentation.sql`)
 * next to the social fields, and NEVER the owner-only columns the same row carries
 * (`language`, `onboarded`). Before the migration PostgREST answers 42703; the route then
 * falls back to the previous column set instead of failing the whole profile.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    columns: new Set(['id', 'full_name', 'avatar_url', 'follower_count', 'following_count', 'bio', 'cover_url', 'language', 'onboarded']),
    row: { id: 'author-1', full_name: 'A', avatar_url: null, follower_count: 2, following_count: 1, bio: 'Hi', cover_url: 'https://storage.googleapis.com/b/covers/a.jpg', language: 'vi', onboarded: true } as Record<string, unknown>,
    selects: [] as string[],
    user: null as any,
  }
  const builder = (table: string) => {
    let selected: string[] = []
    const b: any = {
      select: (c: string) => { if (table === 'profiles') { selected = c.split(',').map(s => s.trim()); state.selects.push(c) } return b },
      eq: () => b, or: () => b,
      single: () => {
        const bad = selected.find(c => !state.columns.has(c))
        if (bad) return Promise.resolve({ data: null, error: { code: '42703' } })
        return Promise.resolve({ data: Object.fromEntries(selected.map(c => [c, state.row[c] ?? null])), error: null })
      },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (res: any) => Promise.resolve({ data: null, count: 5, error: null }).then(res),
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }) }))

import { GET } from './route'

const call = async () => (await GET({ headers: new Headers() } as any, { params: { id: 'author-1' } })).json()

beforeEach(() => {
  h.state.columns = new Set(['id', 'full_name', 'avatar_url', 'follower_count', 'following_count', 'bio', 'cover_url', 'language', 'onboarded'])
  h.state.selects.length = 0
  h.state.user = null
})

describe('public presentation fields', () => {
  it('serves bio and cover_url with the social fields, and nothing owner-only', async () => {
    const body = await call()
    expect(body).toMatchObject({ id: 'author-1', full_name: 'A', follower_count: 2, following_count: 1, bio: 'Hi', cover_url: 'https://storage.googleapis.com/b/covers/a.jpg', review_count: 5, is_following: false, is_self: false })
    expect('language' in body).toBe(false)
    expect('onboarded' in body).toBe(false)
    expect('email' in body).toBe(false)
  })

  it('schema bridge: before the migration the read falls back and the keys are simply absent — no 404', async () => {
    h.state.columns.delete('bio'); h.state.columns.delete('cover_url')
    const body = await call()
    expect(body.full_name).toBe('A')
    expect('bio' in body).toBe(false)
    expect('cover_url' in body).toBe(false)
    expect(h.state.selects).toHaveLength(2)
    expect(h.state.selects[1]).not.toMatch(/bio|cover_url/)
  })

  it('a missing profile is still a 404', async () => {
    h.state.columns.delete('full_name')
    h.state.columns.delete('id')
    const res = await GET({ headers: new Headers() } as any, { params: { id: 'author-1' } })
    expect(res.status).toBe(404)
  })
})
