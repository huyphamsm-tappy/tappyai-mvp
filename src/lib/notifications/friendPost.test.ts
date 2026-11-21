import { describe, it, expect, vi, afterEach } from 'vitest'
import { notifyFollowersOfPost, MAX_RECIPIENTS, friendPostNotificationsEnabled } from './friendPost'

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A tiny fake of the admin client: user_follows, user_blocks and profiles. */
function fakeAdmin(opts: { followers: string[]; blocks?: Array<{ blocker: string; blocked: string }>; name?: string | null }) {
  const calls: { limit?: number } = {}
  const admin: any = {
    from(table: string) {
      const q: any = { _eq: [] as Array<[string, unknown]>, _in: null as [string, string[]] | null }
      q.select = () => q
      q.order = () => q
      q.limit = (n: number) => { calls.limit = n; return q }
      q.eq = (c: string, v: unknown) => { q._eq.push([c, v]); return q }
      q.in = (c: string, v: string[]) => { q._in = [c, v]; return q }
      q.maybeSingle = async () => ({ data: table === 'profiles' ? { full_name: opts.name === undefined ? 'Nguyễn An' : opts.name } : null })
      q.then = (res: (v: unknown) => unknown) => {
        let data: unknown[] = []
        if (table === 'user_follows') data = opts.followers.slice(0, calls.limit ?? 999).map((f) => ({ follower_id: f }))
        if (table === 'user_blocks') {
          const [col, ids] = q._in as [string, string[]]
          const me = q._eq[0][1] as string
          data = (opts.blocks ?? [])
            .filter((b) => (col === 'blocked_id' ? b.blocker === me && ids.includes(b.blocked) : b.blocked === me && ids.includes(b.blocker)))
            .map((b) => (col === 'blocked_id' ? { blocked_id: b.blocked } : { blocker_id: b.blocker }))
        }
        return Promise.resolve({ data, error: null }).then(res)
      }
      return q
    },
  }
  return { admin, calls }
}

afterEach(() => { vi.unstubAllEnvs() })

describe('notifyFollowersOfPost', () => {
  const base = { authorId: UUID(1), reviewId: 'r-1', contentType: 'video', body: 'Clip thử' }

  it('notifies every follower once with a link to the post, and says clip for a video', async () => {
    const emit = vi.fn(async (_i: any) => ({ id: 'x', pushStatus: 'skipped', push: { attempted: 0, sent: 0, failed: 0, gone: 0 } }) as any)
    const { admin } = fakeAdmin({ followers: [UUID(2), UUID(3)] })
    const n = await notifyFollowersOfPost({ ...base, admin, emit })
    expect(n).toBe(2)
    expect(emit).toHaveBeenCalledTimes(2)
    const first = emit.mock.calls[0][0] as any
    expect(first).toMatchObject({ type: 'friend_post', category: 'social', actorId: UUID(1), entityUrl: '/reviews/r-1' })
    expect(first.title).toContain('clip mới')
    expect(first.title).toContain('An')
    expect(first.body).toBe('Clip thử')
  })

  it('says post (not clip) for a photo post', async () => {
    const emit = vi.fn(async (_i: any) => ({}) as any)
    const { admin } = fakeAdmin({ followers: [UUID(2)] })
    await notifyFollowersOfPost({ ...base, contentType: 'photo', admin, emit })
    expect((emit.mock.calls[0][0] as any).title).toContain('bài mới')
  })

  it('skips anyone blocked in either direction', async () => {
    const emit = vi.fn(async (_i: any) => ({}) as any)
    const { admin } = fakeAdmin({
      followers: [UUID(2), UUID(3), UUID(4)],
      blocks: [{ blocker: UUID(1), blocked: UUID(2) }, { blocker: UUID(3), blocked: UUID(1) }],
    })
    const n = await notifyFollowersOfPost({ ...base, admin, emit })
    expect(n).toBe(1)
    expect((emit.mock.calls[0][0] as any).userId).toBe(UUID(4))
  })

  it('never notifies the author, and nobody when there are no followers', async () => {
    const emit = vi.fn(async () => ({}) as any)
    expect(await notifyFollowersOfPost({ ...base, admin: fakeAdmin({ followers: [UUID(1)] }).admin, emit })).toBe(0)
    expect(await notifyFollowersOfPost({ ...base, admin: fakeAdmin({ followers: [] }).admin, emit })).toBe(0)
    expect(emit).not.toHaveBeenCalled()
  })

  it('caps the number of recipients read per post', async () => {
    const emit = vi.fn(async () => ({}) as any)
    const { admin, calls } = fakeAdmin({ followers: Array.from({ length: MAX_RECIPIENTS + 50 }, (_, i) => UUID(i + 2)) })
    const n = await notifyFollowersOfPost({ ...base, admin, emit })
    expect(calls.limit).toBe(MAX_RECIPIENTS)
    expect(n).toBe(MAX_RECIPIENTS)
  })

  it('is off with FRIEND_POST_NOTIFICATIONS_ENABLED=false', async () => {
    vi.stubEnv('FRIEND_POST_NOTIFICATIONS_ENABLED', 'false')
    expect(friendPostNotificationsEnabled()).toBe(false)
    const emit = vi.fn(async () => ({}) as any)
    expect(await notifyFollowersOfPost({ ...base, admin: fakeAdmin({ followers: [UUID(2)] }).admin, emit })).toBe(0)
    expect(emit).not.toHaveBeenCalled()
  })

  it('never throws: a failing client or a failing emit yields 0 / fewer, not an error', async () => {
    const bad: any = { from() { throw new Error('db down') } }
    expect(await notifyFollowersOfPost({ ...base, admin: bad })).toBe(0)
    const emit = vi.fn(async () => { throw new Error('push down') })
    expect(await notifyFollowersOfPost({ ...base, admin: fakeAdmin({ followers: [UUID(2)] }).admin, emit: emit as any })).toBe(0)
  })

  it('gives up after the time budget instead of holding the post', async () => {
    const emit = vi.fn(() => new Promise(() => {})) as any
    const n = await notifyFollowersOfPost({ ...base, admin: fakeAdmin({ followers: [UUID(2)] }).admin, emit, budgetMs: 30 })
    expect(n).toBe(0)
  })
})
