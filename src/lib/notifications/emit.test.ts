import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable supabase-admin mock capturing the inserted row + the push_status patch.
const h = vi.hoisted(() => {
  const state = {
    inserted: null as any,
    updated: null as any,
    insertResult: { data: { id: 'n1' }, error: null } as any,
  }
  const single = vi.fn(async () => state.insertResult)
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn((row: any) => { state.inserted = row; return { select } })
  const eqUpdate = vi.fn(async () => ({ error: null }))
  const update = vi.fn((patch: any) => { state.updated = patch; return { eq: eqUpdate } })
  const from = vi.fn(() => ({ insert, update }))
  return { state, from, insert, update, single, select, sendMock: vi.fn() }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: h.from }) }))
vi.mock('@/lib/notifications/send', () => ({ sendNotificationToUser: h.sendMock }))

import { emitNotification, pushStatusFor } from './emit'

beforeEach(() => {
  vi.clearAllMocks()
  h.state.inserted = null
  h.state.updated = null
  h.state.insertResult = { data: { id: 'n1' }, error: null }
  h.sendMock.mockResolvedValue({ attempted: 1, sent: 1, failed: 0, gone: 0 })
})

describe('pushStatusFor', () => {
  it('no subscriptions → skipped', () => {
    expect(pushStatusFor({ attempted: 0, failed: 0 })).toBe('skipped')
  })
  it('a real failure → failed', () => {
    expect(pushStatusFor({ attempted: 2, failed: 1 })).toBe('failed')
  })
  it('all delivered → sent', () => {
    expect(pushStatusFor({ attempted: 3, failed: 0 })).toBe('sent')
  })
})

describe('emitNotification — persist + push (single writer)', () => {
  it('persists a row with the mapped contract fields, push_status pending on insert', async () => {
    await emitNotification({
      userId: 'u1', type: 'like', category: 'social',
      title: 'T', body: 'B', actorId: 'a1', entityUrl: '/reviews/r1',
    })
    expect(h.from).toHaveBeenCalledWith('notifications')
    expect(h.state.inserted).toMatchObject({
      user_id: 'u1', type: 'like', category: 'social', title: 'T', body: 'B',
      actor_id: 'a1', entity_url: '/reviews/r1', image_url: null,
      data: {}, push_status: 'pending',
    })
    // No backfill fields on a live emit.
    expect(h.state.inserted).not.toHaveProperty('created_at')
    expect(h.state.inserted).not.toHaveProperty('read_at')
  })

  it('dispatches push from the same payload with the deep link in data.url', async () => {
    await emitNotification({ userId: 'u1', type: 'deal', category: 'deal', title: 'T', body: 'B', entityUrl: '/deals' })
    expect(h.sendMock).toHaveBeenCalledTimes(1)
    const [uid, payload] = h.sendMock.mock.calls[0]
    expect(uid).toBe('u1')
    expect(payload).toMatchObject({ title: 'T', body: 'B' })
    expect(payload.data.url).toBe('/deals')
    expect(payload.data.notificationId).toBe('n1')
  })

  it('records push_status=sent with attempts+sent_at when a device received it', async () => {
    h.sendMock.mockResolvedValue({ attempted: 1, sent: 1, failed: 0, gone: 0 })
    const res = await emitNotification({ userId: 'u1', type: 'follow', category: 'social', title: 'T', body: 'B' })
    expect(res).toEqual({ id: 'n1', pushStatus: 'sent' })
    expect(h.state.updated.push_status).toBe('sent')
    expect(h.state.updated.push_attempts).toBe(1)
    expect(h.state.updated.push_sent_at).toBeTruthy()
  })

  it('records push_status=skipped (0 attempts) when the user has no subscription', async () => {
    h.sendMock.mockResolvedValue({ attempted: 0, sent: 0, failed: 0, gone: 0 })
    const res = await emitNotification({ userId: 'u1', type: 'lunch', category: 'explore', title: 'T', body: 'B' })
    expect(res.pushStatus).toBe('skipped')
    expect(h.state.updated.push_status).toBe('skipped')
    expect(h.state.updated.push_attempts).toBe(0)
    expect(h.state.updated.push_sent_at).toBeNull()
  })

  it('records push_status=failed with the first error on a transient failure', async () => {
    h.sendMock.mockResolvedValue({ attempted: 1, sent: 0, failed: 1, gone: 0, firstError: 'boom' })
    const res = await emitNotification({ userId: 'u1', type: 'price', category: 'deal', title: 'T', body: 'B' })
    expect(res.pushStatus).toBe('failed')
    expect(h.state.updated.push_status).toBe('failed')
    expect(h.state.updated.push_error).toBe('boom')
  })

  it('a push that throws is folded into failed, never rejects the caller', async () => {
    h.sendMock.mockRejectedValue(new Error('network'))
    const res = await emitNotification({ userId: 'u1', type: 'comment', category: 'social', title: 'T', body: 'B' })
    expect(res.pushStatus).toBe('failed')
    expect(h.state.updated.push_status).toBe('failed')
  })

  it('backfill (skipPush) persists an already-read historical row and never pushes', async () => {
    const res = await emitNotification({
      userId: 'u1', type: 'like', category: 'social', title: 'T', body: 'B',
      skipPush: true, createdAt: '2026-07-01T00:00:00.000Z', readAt: '2026-07-01T00:00:00.000Z',
    })
    expect(h.sendMock).not.toHaveBeenCalled()
    expect(res.pushStatus).toBe('skipped')
    expect(h.state.inserted.created_at).toBe('2026-07-01T00:00:00.000Z')
    expect(h.state.inserted.read_at).toBe('2026-07-01T00:00:00.000Z')
    expect(h.state.updated.push_status).toBe('skipped')
  })

  it('an insert error returns id=null and skips the push entirely', async () => {
    h.state.insertResult = { data: null, error: { message: 'rls' } }
    const res = await emitNotification({ userId: 'u1', type: 'system', category: 'system', title: 'T', body: 'B' })
    expect(res.id).toBeNull()
    expect(h.sendMock).not.toHaveBeenCalled()
  })
})
