import { describe, it, expect, vi } from 'vitest'

// The pieces that need a database or the notification system are replaced; what is pinned here is the CONTRACT the owner relies on:
// nothing happens until reviewers are configured, an alert never carries content, it is throttled, and a failure never throws.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the admin client must not be touched here') } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: async () => { throw new Error('emit must not be called here') } }))

import { alertModerators, alertNotice, alertRecipients, ALERT_WINDOW_MS } from './operatorAlert'

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

describe('alertRecipients', () => {
  it('is empty by default — the alert is inert until the owner names reviewers', () => {
    expect(alertRecipients({})).toEqual([])
  })
  it('prefers MODERATION_ALERT_USER_IDS, falls back to the digest list, trims and de-duplicates', () => {
    expect(alertRecipients({ MODERATION_ALERT_USER_IDS: ` ${ids[0]} , ${ids[0]},${ids[1]} `, MODERATION_DIGEST_USER_IDS: 'x' })).toEqual(ids)
    expect(alertRecipients({ MODERATION_DIGEST_USER_IDS: ids[1] })).toEqual([ids[1]])
  })
})

describe('alertNotice', () => {
  it('is bilingual, points at the queue, and carries no content, ids or counts', () => {
    for (const kind of ['report', 'block'] as const) {
      const n = alertNotice(kind)
      const all = `${n.title}\n${n.body}`
      expect(all).toContain('/admin/moderation')
      expect(all).toMatch(/[ăâđêôơư]/i)      // Vietnamese present
      expect(all).toMatch(/\b(report|blocked)\b/i)  // English present
      expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)  // no uuid
    }
  })
  it('the report notice states the 24 h target for severe groups', () => {
    expect(alertNotice('report').body).toContain('24')
  })
})

describe('alertModerators', () => {
  it('does nothing — and touches neither the database nor the notifier — with no recipients', async () => {
    expect(await alertModerators('report', { recipients: [] })).toEqual({ recipients: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it('sends one system notification per reviewer with a content-free payload', async () => {
    const emit = vi.fn(async (_input: unknown) => ({ id: 'n1' }))
    const r = await alertModerators('block', { recipients: ids, emit, recentlyAlerted: async () => false })
    expect(r).toEqual({ recipients: 2, sent: 2, skipped: 0, failed: 0 })
    expect(emit).toHaveBeenCalledTimes(2)
    const first = emit.mock.calls[0][0] as { userId: string; type: string; category: string; entityUrl: string; data: Record<string, unknown> }
    expect(first).toMatchObject({ userId: ids[0], type: 'system', category: 'system', entityUrl: '/admin/moderation' })
    expect(first.data).toEqual({ kind: 'moderation_alert', alert: 'block' })
  })

  it('is throttled: a reviewer already alerted inside the window is skipped, not pinged again', async () => {
    const emit = vi.fn(async (_input: unknown) => ({ id: 'n1' }))
    const seen: Array<{ userId: string; kind: string; since: number }> = []
    const now = Date.parse('2026-10-09T10:00:00Z')
    const r = await alertModerators('report', {
      recipients: ids, emit, now: () => now,
      recentlyAlerted: async (userId, kind, sinceIso) => { seen.push({ userId, kind, since: Date.parse(sinceIso) }); return userId === ids[0] },
    })
    expect(r).toEqual({ recipients: 2, sent: 1, skipped: 1, failed: 0 })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(seen[0]).toEqual({ userId: ids[0], kind: 'report', since: now - ALERT_WINDOW_MS })
  })

  it('never throws: a failing notifier or throttle read is counted, logged, and the others still go out', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const emit = vi.fn(async (i: { userId: string }) => { if (i.userId === ids[0]) throw new Error('boom'); return { id: 'n2' } })
    const r = await alertModerators('report', { recipients: ids, emit, recentlyAlerted: async () => false })
    expect(r).toEqual({ recipients: 2, sent: 1, skipped: 0, failed: 1 })
    const none = await alertModerators('report', { recipients: ids, emit: async () => ({ id: null }), recentlyAlerted: async () => false })
    expect(none.sent).toBe(0)
    expect(err).toHaveBeenCalledWith(expect.stringContaining('no alert delivered'))
    const broken = await alertModerators('report', { recipients: ids, emit, recentlyAlerted: async () => { throw new Error('db down') } })
    expect(broken.failed).toBe(2)
    err.mockRestore()
  })
})
