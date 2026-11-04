import { describe, it, expect } from 'vitest'
import { messageFromRealtimeRow } from '../realtimeRow'

// A row that arrives through Supabase realtime (the table's own columns) as the message the page uses. A picture's storage path is NEVER carried into the page: the row says
// only THAT there is a picture (`hasMedia`), and the page reads the thread again to get the short-lived signed link the server makes.

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1', thread_id: 't1', sender_id: 'u2', body: 'xin chào', created_at: '2026-11-05T01:00:00.000Z',
  media_path: null, media_type: null, media_width: null, media_height: null, ...over,
})

describe('messageFromRealtimeRow', () => {
  it('a text message maps exactly as before, with no picture', () => {
    const m = messageFromRealtimeRow(row())
    expect(m).toEqual({ id: 'm1', threadId: 't1', senderId: 'u2', body: 'xin chào', createdAt: '2026-11-05T01:00:00.000Z' })
    expect('hasMedia' in m).toBe(false)
    expect('media' in m).toBe(false)
  })

  it('a message with a picture says THAT it has one (hasMedia), and never carries the storage path or a made-up link', () => {
    const m = messageFromRealtimeRow(row({ body: '', media_path: 't1/u2/1-abc.webp', media_type: 'image', media_width: 800, media_height: 600 }))
    expect(m.hasMedia).toBe(true)
    expect(m.media).toBeUndefined()
    expect(JSON.stringify(m)).not.toContain('1-abc.webp')
    expect(m.body).toBe('')
  })

  it('a deleted sender stays a null sender', () => {
    expect(messageFromRealtimeRow(row({ sender_id: null })).senderId).toBeNull()
  })

  it('a row from before the migration (no media columns at all) is a plain text message', () => {
    const { media_path: _a, media_type: _b, media_width: _c, media_height: _d, ...old } = row()
    expect(messageFromRealtimeRow(old).hasMedia).toBeUndefined()
  })
})
