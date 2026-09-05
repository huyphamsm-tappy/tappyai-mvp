import { describe, it, expect } from 'vitest'
import { assembleSummaries, type ThreadSummaryRow, type SummaryQueryClient } from '../summaries'
import { counterpart, threadTitle } from '../types'

/**
 * The conversation list, assembled from what the database returned.
 *
 * 🚨 EVERY NUMBER HERE ORIGINATES SERVER-SIDE. `unread_count` arrives from
 * `chat_thread_summaries()`, which derives it from the caller's read cursor.
 * This module must pass it through and must never compute one, because a second
 * implementation of "what counts as unread" is free to disagree with the first —
 * and the version the user believes is the badge.
 */

/** A stub shaped like the two `.from().select().in()` calls this module makes. */
function client(participants: unknown, profiles: unknown): SummaryQueryClient {
  const byTable: Record<string, unknown> = { chat_participants: participants, profiles }
  return {
    from(table: string) {
      return {
        select() {
          return {
            in: () => Promise.resolve({ data: byTable[table] ?? [], error: null }),
          }
        },
      }
    },
  }
}

const row = (over: Partial<ThreadSummaryRow> = {}): ThreadSummaryRow => ({
  thread_id: 't1',
  kind: 'direct',
  title: null,
  last_message_at: '2026-09-05T10:20:00Z',
  last_body: 'Quán này có view đẹp quá!',
  last_sender_id: 'u2',
  last_created_at: '2026-09-05T10:20:00Z',
  unread_count: 1,
  ...over,
})

describe('assembleSummaries', () => {
  it('returns nothing, and asks the database nothing, for an empty list', async () => {
    let touched = false
    const spy: SummaryQueryClient = {
      from() { touched = true; return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) } },
    }
    expect(await assembleSummaries(spy, [])).toEqual([])
    expect(touched, 'an empty inbox must not issue queries').toBe(false)
  })

  it('joins each thread to its participants and their profiles', async () => {
    const out = await assembleSummaries(
      client(
        [{ thread_id: 't1', user_id: 'u1' }, { thread_id: 't1', user_id: 'u2' }],
        [{ id: 'u1', full_name: 'Tôi', avatar_url: null }, { id: 'u2', full_name: 'Mai Anh', avatar_url: 'a.png' }],
      ),
      [row()],
    )
    expect(out).toHaveLength(1)
    expect(out[0].participants).toEqual([
      { userId: 'u1', fullName: 'Tôi', avatarUrl: null },
      { userId: 'u2', fullName: 'Mai Anh', avatarUrl: 'a.png' },
    ])
  })

  it('passes the server-derived unread count through untouched', async () => {
    const out = await assembleSummaries(client([], []), [row({ unread_count: 7 })])
    expect(out[0].unreadCount).toBe(7)
  })

  it('keeps a participant whose profile row is missing rather than dropping them', async () => {
    // A member with no profile yet must still be a member — losing them would
    // silently shrink a group.
    const out = await assembleSummaries(
      client([{ thread_id: 't1', user_id: 'ghost' }], []),
      [row()],
    )
    expect(out[0].participants).toEqual([{ userId: 'ghost', fullName: null, avatarUrl: null }])
  })

  it('represents a thread with no messages as a real thread, not a broken one', async () => {
    const out = await assembleSummaries(
      client([{ thread_id: 't1', user_id: 'u1' }], [{ id: 'u1', full_name: 'Tôi', avatar_url: null }]),
      [row({ last_body: null, last_sender_id: null, last_created_at: null, unread_count: 0 })],
    )
    expect(out[0].lastMessage).toBeNull()
    expect(out[0].unreadCount).toBe(0)
  })

  it('keeps the order the database returned — newest thread first', async () => {
    const out = await assembleSummaries(client([], []), [
      row({ thread_id: 'newer', last_message_at: '2026-09-05T11:00:00Z' }),
      row({ thread_id: 'older', last_message_at: '2026-09-05T09:00:00Z' }),
    ])
    expect(out.map(t => t.id)).toEqual(['newer', 'older'])
  })
})

describe('thread naming', () => {
  const direct = {
    kind: 'direct' as const,
    title: null,
    participants: [
      { userId: 'me', fullName: 'Tôi', avatarUrl: null },
      { userId: 'them', fullName: 'Mai Anh', avatarUrl: null },
    ],
  }

  it('names a direct thread after the other person, never yourself', () => {
    expect(threadTitle(direct, 'me', 'Người dùng')).toBe('Mai Anh')
    expect(counterpart(direct, 'me')?.userId).toBe('them')
  })

  it('names a group after its title, and a group has no counterpart', () => {
    const group = { kind: 'group' as const, title: 'Nhóm Đà Lạt 2024', participants: direct.participants }
    expect(threadTitle(group, 'me', 'Nhóm')).toBe('Nhóm Đà Lạt 2024')
    expect(counterpart(group, 'me')).toBeNull()
  })

  it('falls back to the caller-supplied string rather than inventing a name', () => {
    // 🔑 The fallback is an i18n string passed IN. This module holds no
    // user-facing text, so it cannot leak an untranslated default.
    const nameless = { kind: 'group' as const, title: '   ', participants: [] }
    expect(threadTitle(nameless, 'me', 'Nhóm')).toBe('Nhóm')
    const anonymous = {
      kind: 'direct' as const,
      title: null,
      participants: [{ userId: 'them', fullName: null, avatarUrl: null }],
    }
    expect(threadTitle(anonymous, 'me', 'Người dùng')).toBe('Người dùng')
  })
})
