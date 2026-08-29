// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Controller V2.4 — the SHARED notification dispatch seam.
//
// 🔑 WHAT IS REAL HERE AND WHAT IS MOCKED. The seam, its fan-out, its
// de-duplication, its aggregation and its audit call all run for real. Mocked
// only at the boundaries the Owner named: the transport (`sendNotificationToUser`
// — the network), the database client, and the shared rate-limit store. Mocking
// `emitNotification` itself would have made "the seam calls the ONE writer"
// unfalsifiable, which is the single most important claim this file makes.
//
// NO REAL PROVIDER IS EVER CONTACTED. `sendNotificationToUser` is replaced
// before any test runs, so neither FCM nor Web Push can be reached from here.

const h = vi.hoisted(() => ({
  send: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
}))

// The transport boundary — the only place a real network call would occur.
vi.mock('./send', () => ({ sendNotificationToUser: h.send }))

// The database boundary. `emitNotification` runs for real against this.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row)
        return { select: () => ({ single: async () => ({ data: { id: `n${h.inserted.length}` }, error: null }) }) }
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: h.audit }))
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))

import { dispatchNotification, dispatchFingerprint, MAX_RECIPIENTS_PER_DISPATCH } from './dispatchService'

const ORIGIN = {
  source: 'controller' as const,
  action: 'notification.send',
  actorId: 'admin-1',
  actorEmail: 'admin@tappyai.com',
  actorRole: 'admin' as const,
  isPlatformOwner: false,
}

const req = (recipients: string[], over: Partial<Parameters<typeof dispatchNotification>[0]> = {}) => ({
  recipients,
  message: { title: 'T', body: 'B' },
  type: 'broadcast' as const,
  category: 'system' as const,
  origin: ORIGIN,
  ...over,
})

/** A transport result. `attempted: 0` is how send.ts reports "no subscription". */
const push = (o: Partial<{ attempted: number; sent: number; failed: number; gone: number }>) => ({
  attempted: 0, sent: 0, failed: 0, gone: 0, ...o,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.inserted.length = 0
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.send.mockResolvedValue(push({ attempted: 1, sent: 1 }))
})

describe('fan-out and de-duplication', () => {
  it('one recipient → one notification row and one transport call', async () => {
    const r = await dispatchNotification(req(['u1']))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.recipients).toBe(1)
    expect(h.inserted).toHaveLength(1)
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('multiple recipients → one row each', async () => {
    const r = await dispatchNotification(req(['u1', 'u2', 'u3']))
    expect(r.ok && r.recipients).toBe(3)
    expect(h.inserted).toHaveLength(3)
  })

  it('🔑 duplicate recipient ids collapse to one message per person', async () => {
    // Selecting the same person twice must not mean two rows and two pushes.
    const r = await dispatchNotification(req(['u1', 'u1', 'u2', 'u1']))
    expect(r.ok && r.recipients).toBe(2)
    expect(h.inserted).toHaveLength(2)
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('refuses an empty recipient list', async () => {
    const r = await dispatchNotification(req([]))
    expect(r).toEqual({ ok: false, reason: 'NO_RECIPIENTS' })
    expect(h.send).not.toHaveBeenCalled()
  })

  it('refuses more recipients than the seam-owned cap, before dispatching anything', async () => {
    const many = Array.from({ length: MAX_RECIPIENTS_PER_DISPATCH + 1 }, (_, i) => `u${i}`)
    const r = await dispatchNotification(req(many))
    expect(r).toMatchObject({ ok: false, reason: 'TOO_MANY_RECIPIENTS', limit: MAX_RECIPIENTS_PER_DISPATCH })
    expect(h.send).not.toHaveBeenCalled()
    expect(h.inserted).toHaveLength(0)
  })
})

describe('honest outcome reporting', () => {
  it('accepted — the provider took it', async () => {
    h.send.mockResolvedValue(push({ attempted: 1, sent: 1 }))
    const r = await dispatchNotification(req(['u1']))
    expect(r.ok && r).toMatchObject({ accepted: 1, failed: 0, gone: 0, unreachable: 0 })
  })

  it('failed — the provider rejected it', async () => {
    h.send.mockResolvedValue(push({ attempted: 1, failed: 1 }))
    const r = await dispatchNotification(req(['u1']))
    expect(r.ok && r).toMatchObject({ accepted: 0, failed: 1, gone: 0 })
  })

  it('🔑 gone — a dead subscription is reported as gone, NOT as accepted', async () => {
    // The whole reason `EmitResult.push` was added. `pushStatus` collapses this
    // case to 'sent'; if the seam read that instead of the PushResult, a message
    // that reached nobody would be reported as accepted.
    h.send.mockResolvedValue(push({ attempted: 1, gone: 1 }))
    const r = await dispatchNotification(req(['u1']))
    expect(r.ok && r).toMatchObject({ accepted: 0, failed: 0, gone: 1 })
  })

  it('unreachable — an in-app row exists but there was no device to push to', async () => {
    h.send.mockResolvedValue(push({ attempted: 0 }))
    const r = await dispatchNotification(req(['u1']))
    expect(r.ok && r).toMatchObject({ unreachable: 1, accepted: 0 })
    // The notification still exists in the inbox.
    expect(h.inserted).toHaveLength(1)
  })

  it('🔑 partial failure — every recipient is accounted for individually', async () => {
    h.send
      .mockResolvedValueOnce(push({ attempted: 1, sent: 1 }))
      .mockResolvedValueOnce(push({ attempted: 1, failed: 1 }))
      .mockResolvedValueOnce(push({ attempted: 1, gone: 1 }))
      .mockResolvedValueOnce(push({ attempted: 0 }))
    const r = await dispatchNotification(req(['u1', 'u2', 'u3', 'u4']))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r).toMatchObject({ recipients: 4, accepted: 1, failed: 1, gone: 1, unreachable: 1 })
    expect(r.perRecipient).toHaveLength(4)
    expect(r.perRecipient.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3', 'u4'])
  })

  it('a transport that throws does not stop the other recipients', async () => {
    h.send.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(push({ attempted: 1, sent: 1 }))
    const r = await dispatchNotification(req(['u1', 'u2']))
    // emitNotification catches the throw itself and reports it as a failure.
    expect(r.ok && r.recipients).toBe(2)
    expect(h.inserted).toHaveLength(2)
  })
})

describe('duplicate suppression', () => {
  it('refuses a second identical dispatch inside the window', async () => {
    h.rateLimit.mockResolvedValueOnce({ ok: true, retryAfter: 0 }).mockResolvedValueOnce({ ok: false, retryAfter: 42 })
    expect((await dispatchNotification(req(['u1']))).ok).toBe(true)
    const second = await dispatchNotification(req(['u1']))
    expect(second).toMatchObject({ ok: false, reason: 'DUPLICATE', retryAfter: 42 })
    // Nothing was written on the refused attempt.
    expect(h.inserted).toHaveLength(1)
  })

  it('🔑 the suppression key holds no message text and no user ids', async () => {
    // The key goes to an external shared store. A fingerprint that embedded the
    // body or a uuid would put user data somewhere with no retention policy.
    const key = dispatchFingerprint(req(['user-uuid-aaa']), ['user-uuid-aaa'])
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(key).not.toContain('user-uuid')
  })

  it('different content produces a different key; identical content the same key', async () => {
    const a = dispatchFingerprint(req(['u1']), ['u1'])
    const b = dispatchFingerprint(req(['u1'], { message: { title: 'T', body: 'DIFFERENT' } }), ['u1'])
    expect(a).not.toBe(b)
    expect(dispatchFingerprint(req(['u1']), ['u1'])).toBe(a)
  })

  it('recipient ORDER does not change the key — the same send is the same send', async () => {
    expect(dispatchFingerprint(req(['a', 'b']), ['a', 'b']))
      .toBe(dispatchFingerprint(req(['b', 'a']), ['b', 'a']))
  })
})

describe('audit', () => {
  it('🔑 is always written, by the SEAM, so no caller can forget', async () => {
    await dispatchNotification(req(['u1', 'u2']))
    expect(h.audit).toHaveBeenCalledTimes(1)
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      actorId: 'admin-1',
      action: 'notification.send',
      targetType: 'notification_dispatch',
      metadata: expect.objectContaining({ source: 'controller', recipients: 2 }),
    })
  })

  it('records the outcome counts an operator would need', async () => {
    h.send
      .mockResolvedValueOnce(push({ attempted: 1, sent: 1 }))
      .mockResolvedValueOnce(push({ attempted: 1, gone: 1 }))
    await dispatchNotification(req(['u1', 'u2']))
    expect(h.audit.mock.calls[0][0].metadata).toMatchObject({
      recipients: 2, accepted: 1, gone: 1, failed: 0, unreachable: 0, errored: 0,
    })
  })

  it('🔑 contains NO message content, NO recipient ids, NO PII', async () => {
    await dispatchNotification(
      req(['user-uuid-aaa'], { message: { title: 'SECRET TITLE', body: 'SECRET BODY', link: '/x' } })
    )
    const serialized = JSON.stringify(h.audit.mock.calls[0][0])
    for (const forbidden of ['SECRET TITLE', 'SECRET BODY', 'user-uuid-aaa', '/x']) {
      expect(serialized, `audit leaked ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('is not written when the dispatch was refused', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 5 })
    await dispatchNotification(req(['u1']))
    expect(h.audit).not.toHaveBeenCalled()
  })
})

describe('the seam stays a seam', () => {
  const SRC = readFileSync('src/lib/notifications/dispatchService.ts', 'utf8')
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('🔑 never writes the notifications table itself — emitNotification is the ONE writer', () => {
    expect(code).not.toMatch(/from\(['"]notifications['"]\)/)
    expect(code).not.toContain('createAdminClient')
    expect(code).toContain('emitNotification')
  })

  it('🔑 never calls a push provider directly', () => {
    for (const forbidden of ['fcm', 'webpush', 'web-push', 'sendNotificationToUser', 'fetch(']) {
      expect(code.toLowerCase(), `seam reaches ${forbidden}`).not.toContain(forbidden.toLowerCase())
    }
  })

  it('🔑 never uses CRON_SECRET', () => {
    expect(code).not.toContain('CRON_SECRET')
  })

  it('🔑 performs NO authorization — which is why the two callers stay independent', () => {
    // If the seam ever checked a permission, `notifications.send.user` and
    // `marketing.campaigns.activate` would share a gate and could leak into one
    // another. Authorization belongs to the caller, before it gets here.
    for (const forbidden of ['requirePermission', 'permissionEngine', 'PERMISSIONS.', 'isOwner &&', 'can(']) {
      expect(code, `seam performs authorization via ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('reuses the shared rate limiter rather than a parallel one', () => {
    expect(code).toContain('distributedRateLimit')
  })
})

describe('Marketing compatibility — the same seam, a different caller', () => {
  it('🔑 accepts source=marketing with a segment-resolved recipient list', async () => {
    // PROOF, not documentation: the identical call shape a future campaign
    // activation will make. No Marketing code exists; nothing here implements
    // campaigns. What this asserts is that the seam already supports the caller,
    // so Marketing will never need a second notification system.
    const r = await dispatchNotification({
      recipients: ['seg-u1', 'seg-u2'],
      message: { title: 'Campaign', body: 'Body' },
      type: 'broadcast',
      category: 'system',
      origin: {
        source: 'marketing',
        action: 'campaign.activate',
        actorId: 'marketer-1',
        actorEmail: 'marketer@tappyai.com',
        actorRole: 'admin',
        isPlatformOwner: false,
      },
    })
    expect(r.ok && r.recipients).toBe(2)
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      action: 'campaign.activate',
      metadata: expect.objectContaining({ source: 'marketing' }),
    })
  })

  it('both callers reach the same ONE writer', async () => {
    await dispatchNotification(req(['u1']))
    const controllerRows = h.inserted.length
    h.inserted.length = 0
    await dispatchNotification({
      ...req(['u2']),
      origin: { ...ORIGIN, source: 'marketing', action: 'campaign.activate' },
    })
    // Same insert path, same row shape — one writer, two callers.
    expect(h.inserted).toHaveLength(controllerRows)
  })
})
