// @vitest-environment node
/**
 * POST /api/reviews/[id]/comments — who is told (18/11):
 *  - the post's author gets a "comment" row (not for a self-comment);
 *  - a reply also tells the PARENT comment's author with a "reply" row (not for a self-reply);
 *  - when the parent's author IS the post's author they get exactly ONE row (the reply);
 *  - the copy has Vietnamese diacritics, in English for a recipient whose stored language is "en".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  user: { id: 'commenter', is_anonymous: false } as Row,
  review: { user_id: 'owner', place_name: 'Quán A' } as Row | null,
  parent: null as Row | null,
  langs: {} as Record<string, string | null>,
  emitted: [] as Row[],
  fullName: 'Nguyễn Văn An' as string | null,
}))

vi.mock('@/lib/auth/getRequestUser', () => {
  const userDb = {
    from: (table: string) => {
      const b: any = {
        insert: () => b,
        select: () => b,
        eq: () => b,
        in: () => Promise.resolve({ data: [{ id: 'commenter', full_name: h.fullName, avatar_url: null }] }),
        single: () => Promise.resolve({ data: { id: 'c-new', body: 'hi', created_at: 'now', user_id: 'commenter', parent_comment_id: null }, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: 1 }).then(res),
      }
      return table === 'profiles' ? { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'commenter', full_name: h.fullName, avatar_url: null }] }) }) } : b
    },
  }
  return { getRequestUser: async () => ({ user: h.user, supabase: userDb }) }
})
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let eqId: string | null = null
      const b: any = {
        select: () => b,
        eq: (_c: string, v: string) => { eqId = v; return b },
        single: () => Promise.resolve(
          table === 'reviews' ? { data: h.review } : { data: { language: h.langs[eqId ?? ''] ?? null } },
        ),
        maybeSingle: () => Promise.resolve({ data: table === 'review_comments' ? h.parent : null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: async (i: Row) => { h.emitted.push(i); return { id: 'n' } } }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/account/accountStatus', () => ({
  getAccountRestriction: async () => ({ blocked: false }),
  accountRestrictionMessage: () => '', accountRestrictionCode: () => '', accountRestrictionStatus: () => 403,
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => `msg:${k}` }))

import { POST } from './route'

async function post(body: Row) {
  const res = await POST(new Request('https://x/api/reviews/rev-1/comments', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as any, { params: { id: 'rev-1' } })
  // emit is fire-and-forget; let its promise chain settle
  await new Promise((r) => setTimeout(r, 0))
  return res
}

beforeEach(() => {
  h.user = { id: 'commenter', is_anonymous: false }
  h.review = { user_id: 'owner', place_name: 'Quán A' }
  h.parent = null
  h.langs = {}
  h.emitted = []
  h.fullName = 'Nguyễn Văn An'
})

describe('comment notification', () => {
  it('tells the post author, in Vietnamese with diacritics, linking the review', async () => {
    expect((await post({ body: 'Ngon quá' })).status).toBe(200)
    expect(h.emitted).toHaveLength(1)
    expect(h.emitted[0]).toMatchObject({ userId: 'owner', type: 'comment', category: 'social', actorId: 'commenter', entityUrl: '/reviews/rev-1' })
    expect(h.emitted[0].title).toBe('💬 An đã bình luận review của bạn')
    expect(h.emitted[0].title).not.toMatch(/binh luan|cua ban/)
    expect(h.emitted[0].body).toBe('"Ngon quá"')
  })

  it('uses English for a recipient whose stored language is en', async () => {
    h.langs.owner = 'en'
    await post({ body: 'Nice' })
    expect(h.emitted[0].title).toBe('💬 An commented on your review')
  })

  it('falls back to a localized "someone" when the commenter has no name', async () => {
    h.fullName = null
    await post({ body: 'x' })
    expect(h.emitted[0].title).toContain('Ai đó')
    expect(h.emitted[0].title).not.toContain('Ai do')
  })

  it('does not notify a self-comment', async () => {
    h.review = { user_id: 'commenter', place_name: 'Quán A' }
    await post({ body: 'mine' })
    expect(h.emitted).toEqual([])
  })
})

describe('reply notification', () => {
  it('a reply tells the parent comment author (reply) AND the post author (comment)', async () => {
    h.parent = { user_id: 'parent-author', review_id: 'rev-1' }
    await post({ body: 'Đồng ý', parentId: 'p1' })
    const byUser = Object.fromEntries(h.emitted.map((e) => [e.userId, e]))
    expect(Object.keys(byUser).sort()).toEqual(['owner', 'parent-author'])
    expect(byUser['parent-author']).toMatchObject({ type: 'reply', entityUrl: '/reviews/rev-1', actorId: 'commenter' })
    expect(byUser['parent-author'].title).toBe('↩️ An đã trả lời bình luận của bạn')
    expect(byUser.owner.type).toBe('comment')
  })

  it('the parent author gets English copy when their language is en', async () => {
    h.parent = { user_id: 'parent-author', review_id: 'rev-1' }
    h.langs['parent-author'] = 'en'
    await post({ body: 'Agree', parentId: 'p1' })
    expect(h.emitted.find((e) => e.userId === 'parent-author')!.title).toBe('↩️ An replied to your comment')
  })

  it('a self-reply notifies nobody about the reply (the post author still hears about the comment)', async () => {
    h.parent = { user_id: 'commenter', review_id: 'rev-1' }
    await post({ body: 'more', parentId: 'p1' })
    expect(h.emitted.map((e) => [e.userId, e.type])).toEqual([['owner', 'comment']])
  })

  it('when the parent author is also the post author they get ONE row, the reply', async () => {
    h.parent = { user_id: 'owner', review_id: 'rev-1' }
    await post({ body: 'thanks', parentId: 'p1' })
    expect(h.emitted).toHaveLength(1)
    expect(h.emitted[0]).toMatchObject({ userId: 'owner', type: 'reply' })
  })

  it('ignores a parent that belongs to another review (the id comes from the client)', async () => {
    h.parent = { user_id: 'someone', review_id: 'other-review' }
    await post({ body: 'x', parentId: 'p9' })
    expect(h.emitted.map((e) => e.userId)).toEqual(['owner'])
  })

  it('a reply by the post author to someone else tells that someone, and not the author themself', async () => {
    h.user = { id: 'owner', is_anonymous: false }
    h.parent = { user_id: 'parent-author', review_id: 'rev-1' }
    await post({ body: 'cảm ơn', parentId: 'p1' })
    expect(h.emitted.map((e) => [e.userId, e.type])).toEqual([['parent-author', 'reply']])
  })
})
