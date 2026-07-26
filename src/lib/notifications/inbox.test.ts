import { describe, it, expect } from 'vitest'
import { mapDtoToInbox, groupNotifs, notifSection, isSocialGroup, type InboxNotif } from './inbox'
import type { NotificationDTO } from './contract'

const dto = (over: Partial<NotificationDTO>): NotificationDTO => ({
  id: 'x', type: 'like', category: 'social', title: 'T', body: 'B',
  actor: null, entity_url: null, image_url: null, data: {}, read_at: null,
  created_at: '2026-07-26T00:00:00.000Z', ...over,
})

const inbox = (over: Partial<InboxNotif>): InboxNotif => ({
  id: 'x', type: 'like', category: 'social', actor_id: 'a', actor_name: 'A', actor_avatar: null,
  title: 'T', text: 'B', url: '/reviews/r1', created_at: '2026-07-26T00:00:00.000Z', read_at: null, ...over,
})

describe('mapDtoToInbox', () => {
  it('flattens actor into actor_id/name/avatar and body→text, entity_url→url', () => {
    const m = mapDtoToInbox(dto({ actor: { id: 'a1', name: 'Nam', avatar: 'x.png' }, body: 'Phở', entity_url: '/reviews/r9' }))
    expect(m).toMatchObject({ actor_id: 'a1', actor_name: 'Nam', actor_avatar: 'x.png', text: 'Phở', url: '/reviews/r9' })
  })
  it('non-social row with no actor → empty actor fields', () => {
    const m = mapDtoToInbox(dto({ type: 'deal', category: 'deal', actor: null, entity_url: '/deals' }))
    expect(m.actor_id).toBe('')
    expect(m.actor_name).toBe('')
    expect(m.url).toBe('/deals')
  })
})

describe('groupNotifs', () => {
  it('collapses many likes on the SAME review into one group with an actor stack', () => {
    const g = groupNotifs([
      inbox({ id: 'l1', type: 'like', url: '/reviews/r1', actor_id: 'a1', actor_name: 'A' }),
      inbox({ id: 'l2', type: 'like', url: '/reviews/r1', actor_id: 'a2', actor_name: 'B' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].actors.map(a => a.id)).toEqual(['a1', 'a2'])
    expect(g[0].count).toBe(2)
  })
  it('does NOT collapse likes across different reviews', () => {
    const g = groupNotifs([
      inbox({ id: 'l1', type: 'like', url: '/reviews/r1', actor_id: 'a1' }),
      inbox({ id: 'l2', type: 'like', url: '/reviews/r2', actor_id: 'a1' }),
    ])
    expect(g).toHaveLength(2)
  })
  it('dedupes the same actor within a group (no double-count)', () => {
    const g = groupNotifs([
      inbox({ id: 'l1', type: 'like', url: '/reviews/r1', actor_id: 'a1' }),
      inbox({ id: 'l2', type: 'like', url: '/reviews/r1', actor_id: 'a1' }),
    ])
    expect(g[0].actors).toHaveLength(1)
  })
  it('non-social rows each stay their own group with an empty actor stack', () => {
    const g = groupNotifs([
      inbox({ id: 'd1', type: 'deal', category: 'deal', actor_id: '', url: '/deals' }),
      inbox({ id: 'm1', type: 'milestone', category: 'social', actor_id: '', url: '/reviews/r1' }),
    ])
    expect(g).toHaveLength(2)
    expect(g.every(x => x.actors.length === 0)).toBe(true)
  })
  it('orders groups newest-first', () => {
    const g = groupNotifs([
      inbox({ id: 'a', type: 'follow', actor_id: 'a1', created_at: '2026-07-20T00:00:00.000Z' }),
      inbox({ id: 'b', type: 'follow', actor_id: 'a2', created_at: '2026-07-26T00:00:00.000Z' }),
    ])
    expect(g[0].id).toBe('b')
  })
})

describe('notifSection', () => {
  const now = new Date('2026-07-26T12:00:00.000Z').getTime()
  it('< 1h → VỪA XONG', () => {
    expect(notifSection(new Date(now - 30 * 60_000).toISOString(), now)).toBe('VỪA XONG')
  })
  it('< 24h → HÔM NAY', () => {
    expect(notifSection(new Date(now - 5 * 3600_000).toISOString(), now)).toBe('HÔM NAY')
  })
  it('older → TUẦN NÀY', () => {
    expect(notifSection(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('TUẦN NÀY')
  })
})

describe('isSocialGroup', () => {
  it('like/follow/comment WITH actors render social', () => {
    const g = groupNotifs([inbox({ type: 'comment', actor_id: 'a1' })])[0]
    expect(isSocialGroup(g)).toBe(true)
  })
  it('milestone / deal / system render generic', () => {
    for (const type of ['milestone', 'deal', 'lunch', 'broadcast', 'system']) {
      const g = groupNotifs([inbox({ type, actor_id: '' })])[0]
      expect(isSocialGroup(g)).toBe(false)
    }
  })
})
