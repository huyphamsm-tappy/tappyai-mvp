// @vitest-environment node
/**
 * POST /api/reviews/[id]/share — the post author is told (18/11): never for a self-share, at most one row per sharer per
 * post per Vietnam day, Vietnamese with diacritics (English for a recipient whose stored language is en). The share itself
 * is recorded whatever happens to the notification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vietnamDayStartIso } from '@/lib/i18n/socialNotices'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  user: { id: 'sharer', is_anonymous: false } as Row,
  review: { id: 'rev-1', user_id: 'owner', place_name: 'Quán A' } as Row,
  existing: 0,
  lang: null as string | null,
  emitted: [] as Row[],
  dedupeFilters: [] as Array<[string, unknown]>,
  emitThrows: false,
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: {
      from: (table: string) => {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: table === 'reviews' ? h.review : null, error: null }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 's1', created_at: 't' }, error: null }) }) }),
        }
        return b
      },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => { if (table === 'notifications') h.dedupeFilters.push([c, v]); return b },
        gte: (c: string, v: unknown) => { h.dedupeFilters.push([c, v]); return Promise.resolve({ count: h.existing }) },
        single: () => Promise.resolve({ data: { language: h.lang } }),
        maybeSingle: () => Promise.resolve({ data: { full_name: 'Trần Thị Bé' } }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/notifications/emit', () => ({
  emitNotification: async (i: Row) => { if (h.emitThrows) throw new Error('boom'); h.emitted.push(i); return { id: 'n' } },
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => `msg:${k}` }))

import { POST } from './route'

async function share() {
  const res = await POST(new Request('https://x/api/reviews/rev-1/share', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'copy' }),
  }) as any, { params: { id: 'rev-1' } })
  await new Promise((r) => setTimeout(r, 0))
  return res
}

beforeEach(() => {
  h.user = { id: 'sharer', is_anonymous: false }
  h.review = { id: 'rev-1', user_id: 'owner', place_name: 'Quán A' }
  h.existing = 0
  h.lang = null
  h.emitted = []
  h.dedupeFilters = []
  h.emitThrows = false
})

describe('share notification', () => {
  it('tells the post author, once, with the sharer as actor and the review as link', async () => {
    const res = await share()
    expect(res.status).toBe(200)
    expect(h.emitted).toHaveLength(1)
    expect(h.emitted[0]).toMatchObject({ userId: 'owner', type: 'share', category: 'social', actorId: 'sharer', entityUrl: '/reviews/rev-1', body: 'Quán A' })
    expect(h.emitted[0].title).toBe('🔗 Bé đã chia sẻ review của bạn')
  })

  it('English for a recipient whose stored language is en', async () => {
    h.lang = 'en'
    await share()
    expect(h.emitted[0].title).toBe('🔗 Bé shared your review')
  })

  it('never for a self-share (and the share is still recorded)', async () => {
    h.user = { id: 'owner', is_anonymous: false }
    const res = await share()
    expect(res.status).toBe(200)
    expect(h.emitted).toEqual([])
  })

  it('at most one per sharer per post per day: an existing row today suppresses the second', async () => {
    h.existing = 1
    const res = await share()
    expect(res.status).toBe(200)
    expect(h.emitted).toEqual([])
  })

  it('the dedupe looks for the same recipient, type, actor and post since the start of the Vietnam day', async () => {
    await share()
    const f = Object.fromEntries(h.dedupeFilters)
    expect(f).toMatchObject({ user_id: 'owner', type: 'share', actor_id: 'sharer', entity_url: '/reviews/rev-1' })
    expect(new Date(f.created_at as string).getTime()).toBeLessThanOrEqual(Date.now())
    expect(Date.now() - new Date(f.created_at as string).getTime()).toBeLessThan(24 * 60 * 60 * 1000)
  })

  it('a failing notification does not fail the share', async () => {
    h.emitThrows = true
    const res = await share()
    expect(res.status).toBe(200)
    expect((await res.json()).shared).toBe(true)
  })
})

describe('vietnamDayStartIso', () => {
  it('is 00:00 Vietnam time (17:00 UTC the day before)', () => {
    expect(vietnamDayStartIso(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11-17T17:00:00.000Z')
    expect(vietnamDayStartIso(new Date('2026-11-17T16:59:00Z'))).toBe('2026-11-16T17:00:00.000Z')
    expect(vietnamDayStartIso(new Date('2026-11-17T17:00:00Z'))).toBe('2026-11-17T17:00:00.000Z')
  })
})
