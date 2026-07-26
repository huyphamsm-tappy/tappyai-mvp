import { describe, it, expect } from 'vitest'
import { buildBackfillItems, type BackfillSources, type ReviewMeta } from './backfill'

const base = (over: Partial<BackfillSources> = {}): BackfillSources => ({
  follows: [], likes: [], comments: [], milestones: [],
  reviewsById: new Map<string, ReviewMeta>(),
  namesById: new Map<string, string | null>(),
  ...over,
})

describe('buildBackfillItems', () => {
  it('maps a follow to the followed user with the live title + read-on-arrival', () => {
    const items = buildBackfillItems(base({
      follows: [{ follower_id: 'a1', following_id: 'u1', created_at: '2026-07-01T00:00:00Z' }],
      namesById: new Map([['a1', 'Trần Văn Nam']]),
    }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      userId: 'u1', type: 'follow', category: 'social', actorId: 'a1',
      entityUrl: '/users/a1', skipPush: true,
      title: '👤 Nam đang theo dõi bạn',
    })
    // Landed already-read at the original event time.
    expect(items[0].readAt).toBe('2026-07-01T00:00:00Z')
    expect(items[0].createdAt).toBe('2026-07-01T00:00:00Z')
    expect(items[0].data).toEqual({ backfill: true })
  })

  it('maps a like to the review OWNER and drops self-likes', () => {
    const reviewsById = new Map<string, ReviewMeta>([['r1', { user_id: 'owner', place_name: 'Phở 10' }]])
    const items = buildBackfillItems(base({
      likes: [
        { user_id: 'a1', review_id: 'r1', created_at: '2026-07-02T00:00:00Z' },
        { user_id: 'owner', review_id: 'r1', created_at: '2026-07-02T01:00:00Z' }, // self-like → dropped
      ],
      reviewsById,
      namesById: new Map([['a1', 'Lê Bình']]),
    }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ userId: 'owner', type: 'like', body: 'Phở 10', actorId: 'a1', entityUrl: '/reviews/r1' })
  })

  it('maps comment (truncates >60 chars) and milestone (no actor)', () => {
    const reviewsById = new Map<string, ReviewMeta>([['r1', { user_id: 'owner', place_name: 'Bún Bò' }]])
    const long = 'x'.repeat(80)
    const items = buildBackfillItems(base({
      comments: [{ user_id: 'a1', review_id: 'r1', body: long, created_at: '2026-07-03T00:00:00Z' }],
      milestones: [{ review_id: 'r1', milestone: 10, created_at: '2026-07-04T00:00:00Z' }],
      reviewsById,
      namesById: new Map([['a1', 'Mai']]),
    }))
    const comment = items.find(i => i.type === 'comment')!
    const milestone = items.find(i => i.type === 'milestone')!
    expect(comment.body).toBe('"' + 'x'.repeat(60) + '..."')
    expect(comment.actorId).toBe('a1')
    expect(milestone.title).toBe('🎉 10 người đã thích bài của bạn!')
    expect(milestone.actorId).toBeUndefined()
  })

  it('drops events whose review is unknown (deleted review)', () => {
    const items = buildBackfillItems(base({
      likes: [{ user_id: 'a1', review_id: 'gone', created_at: '2026-07-02T00:00:00Z' }],
      reviewsById: new Map(),
    }))
    expect(items).toHaveLength(0)
  })

  it('caps per recipient and keeps the newest', () => {
    const follows = Array.from({ length: 5 }, (_, i) => ({
      follower_id: `a${i}`, following_id: 'u1',
      created_at: `2026-07-0${i + 1}T00:00:00Z`,
    }))
    const items = buildBackfillItems(base({ follows, perUserCap: 3 }))
    expect(items).toHaveLength(3)
    // Newest three (07-05, 07-04, 07-03), newest first.
    expect(items.map(i => i.createdAt)).toEqual(['2026-07-05T00:00:00Z', '2026-07-04T00:00:00Z', '2026-07-03T00:00:00Z'])
  })

  it('caps independently per recipient', () => {
    const items = buildBackfillItems(base({
      follows: [
        { follower_id: 'a1', following_id: 'u1', created_at: '2026-07-01T00:00:00Z' },
        { follower_id: 'a2', following_id: 'u1', created_at: '2026-07-02T00:00:00Z' },
        { follower_id: 'a3', following_id: 'u2', created_at: '2026-07-03T00:00:00Z' },
      ],
      perUserCap: 1,
    }))
    expect(items.filter(i => i.userId === 'u1')).toHaveLength(1)
    expect(items.filter(i => i.userId === 'u2')).toHaveLength(1)
  })
})
