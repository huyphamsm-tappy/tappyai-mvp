import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { planCampaign, runCampaign, type RunnerDeps } from './campaignRunner'
import { emptySkipCounts, MIN_AUDIENCE } from './governance'
import type { MarketingAudience } from './marketingAudience'
import type { CampaignRow } from './campaignStore'

// V2.2-2 — running a campaign.
//
// 🚨 THE MOST IMPORTANT ASSERTIONS HERE ARE ABOUT WHAT DOES NOT HAPPEN: no
// dispatch while the activation gate is closed, no dispatch below the floor, no
// number in a floor refusal, and no delivery row claiming a send that a refused
// chunk never made.

const ADMIN = {} as SupabaseClient

const CAMPAIGN: CampaignRow = {
  id: 'camp-1',
  title: 'Spring',
  body: 'Hello there',
  link: '/deals',
  status: 'active',
  created_by: 'admin-1',
  activated_by: 'admin-1',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  activated_at: '2026-09-01T00:00:00Z',
  completed_at: null,
}

const ORIGIN = {
  source: 'marketing' as const,
  action: 'campaign.activate',
  actorId: 'admin-1',
  actorEmail: 'a@b.c',
  actorRole: 'admin' as const,
  isPlatformOwner: false,
}

const users = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)

function audience(recipients: string[], over: Partial<MarketingAudience> = {}): MarketingAudience {
  return {
    recipients,
    candidates: recipients.length,
    skipped: emptySkipCounts(),
    refusals: [],
    ...over,
  }
}

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    buildAudience: vi.fn(async () => audience(users(MIN_AUDIENCE))),
    dispatch: vi.fn(async (req: { recipients: readonly string[] }) => ({
      ok: true as const,
      recipients: req.recipients.length,
      accepted: req.recipients.length,
      failed: 0,
      gone: 0,
      unreachable: 0,
      errored: 0,
      perRecipient: req.recipients.map((userId) => ({
        userId,
        notificationId: `n-${userId}`,
        accepted: 1,
        failed: 0,
        gone: 0,
        reachable: true,
      })),
    })),
    alreadyRecorded: vi.fn(async () => new Set<string>()),
    recordDeliveries: vi.fn(async () => {}),
    ...over,
  } as RunnerDeps
}

beforeEach(() => vi.clearAllMocks())

// ═════════════════════════════════════════════════════════════════════════════
describe('planCampaign — the dry run (M-18)', () => {
  it('reports the plan for an audience at the floor', () => {
    return planCampaign(ADMIN, 'camp-1', deps()).then((o) => {
      expect(o.ok).toBe(true)
      if (o.ok) {
        expect(o.plan.audienceSize).toBe(MIN_AUDIENCE)
        expect(o.plan.chunkCount).toBe(1)
        expect(o.plan.audienceFingerprint).toMatch(/^[0-9a-f]{16}$/)
      }
    })
  })

  it('🚨 refuses at 9 and permits at 10 (DoD 6)', async () => {
    const below = await planCampaign(ADMIN, 'c', deps({ buildAudience: async () => audience(users(9)) }))
    const at = await planCampaign(ADMIN, 'c', deps({ buildAudience: async () => audience(users(10)) }))
    expect(below).toEqual({ ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' })
    expect(at.ok).toBe(true)
  })

  it('🚨 the refusal carries NO number — not the size, not the shortfall', async () => {
    // An operator able to read the shortfall back could binary-search a
    // predicate down to one identifiable person.
    const o = await planCampaign(ADMIN, 'c', deps({ buildAudience: async () => audience(users(2)) }))
    expect(JSON.stringify(o)).not.toMatch(/\d/)
  })

  it('a dry run DISPATCHES NOTHING', async () => {
    const d = deps()
    await planCampaign(ADMIN, 'c', d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(d.recordDeliveries).not.toHaveBeenCalled()
  })

  it('the fingerprint is stable for the same ordered audience and moves when order changes', async () => {
    const a = await planCampaign(ADMIN, 'c', deps({ buildAudience: async () => audience(users(10)) }))
    const b = await planCampaign(ADMIN, 'c', deps({ buildAudience: async () => audience(users(10)) }))
    const c = await planCampaign(
      ADMIN,
      'c',
      deps({ buildAudience: async () => audience([...users(10)].reverse()) }),
    )
    if (a.ok && b.ok && c.ok) {
      expect(a.plan.audienceFingerprint).toBe(b.plan.audienceFingerprint)
      expect(c.plan.audienceFingerprint).not.toBe(a.plan.audienceFingerprint)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('🚨 runCampaign — the activation gate holds inside the runner', () => {
  it('refuses a real send while consent export is unsatisfied', async () => {
    const o = await runCampaign(ADMIN, CAMPAIGN, ORIGIN, deps())
    expect(o).toEqual({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
  })

  it('🚨 and DISPATCHES NOTHING, reads no audience, writes no ledger row', async () => {
    // The route checks the gate too. This proves the runner refuses on its own,
    // so a future caller that forgets the route's check still cannot send.
    const d = deps()
    await runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
    expect(d.dispatch).not.toHaveBeenCalled()
    expect(d.buildAudience).not.toHaveBeenCalled()
    expect(d.recordDeliveries).not.toHaveBeenCalled()
  })

  it('the gate is checked BEFORE the audience is resolved', async () => {
    // Resolving the audience reads every subscriber; a blocked send should not
    // pay for it, and should not touch consent data it may not act on.
    const buildAudience = vi.fn(async () => audience(users(10)))
    await runCampaign(ADMIN, CAMPAIGN, ORIGIN, deps({ buildAudience }))
    expect(buildAudience).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('the send path, exercised with the gate stubbed open', () => {
  // The gate is a module constant that is false in every environment. To test
  // what happens AFTER it, the module is re-imported with it stubbed — the same
  // reason `evaluateActivation` was extracted in activationGate.ts.
  async function withOpenGate<T>(fn: (mod: typeof import('./campaignRunner')) => Promise<T>): Promise<T> {
    vi.resetModules()
    vi.doMock('./activationGate', async () => {
      const real = await vi.importActual<typeof import('./activationGate')>('./activationGate')
      return { ...real, canActivateSend: () => ({ ok: true as const }) }
    })
    try {
      return await fn(await import('./campaignRunner'))
    } finally {
      vi.doUnmock('./activationGate')
      vi.resetModules()
    }
  }

  it('✅ POSITIVE CONTROL — dispatches the audience through the seam', async () => {
    await withOpenGate(async (mod) => {
      const d = deps()
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      expect(o.ok).toBe(true)
      expect(d.dispatch).toHaveBeenCalledTimes(1)
      const req = (d.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(req.recipients).toHaveLength(MIN_AUDIENCE)
      expect(req.category).toBe('marketing')
      expect(req.type).toBe('marketing')
      expect(req.origin.source).toBe('marketing')
      expect(req.data).toEqual({ marketing_campaign_id: 'camp-1' })
    })
  })

  it('🚨 refuses below the floor on the REAL send too, not only the dry run (M-12d)', async () => {
    await withOpenGate(async (mod) => {
      const d = deps({ buildAudience: async () => audience(users(9)) })
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      expect(o).toEqual({ ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' })
      expect(d.dispatch).not.toHaveBeenCalled()
    })
  })

  it('🚨 skips everyone already recorded — resume, not re-send (M-34)', async () => {
    await withOpenGate(async (mod) => {
      const d = deps({ alreadyRecorded: vi.fn(async () => new Set(['u0', 'u1', 'u2'])) })
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      const req = (d.dispatch as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(req.recipients).not.toContain('u0')
      expect(req.recipients).toHaveLength(MIN_AUDIENCE - 3)
      if (o.ok) expect(o.result.alreadyNotified).toBe(3)
    })
  })

  it('🔑 the floor is measured against the AUDIENCE, not the remaining work', async () => {
    // A campaign resumed with three people left must not be refused for being
    // "below 10" — the other seven were already messaged, and refusing would
    // strand it half-delivered forever.
    await withOpenGate(async (mod) => {
      const d = deps({ alreadyRecorded: vi.fn(async () => new Set(users(7))) })
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      expect(o.ok).toBe(true)
      expect(d.dispatch).toHaveBeenCalled()
    })
  })

  it('records a delivery row per recipient, per chunk', async () => {
    await withOpenGate(async (mod) => {
      const d = deps()
      await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      const first = (d.recordDeliveries as ReturnType<typeof vi.fn>).mock.calls[0][1]
      expect(first).toHaveLength(MIN_AUDIENCE)
      expect(first[0]).toMatchObject({ campaignId: 'camp-1', status: 'sent' })
    })
  })

  it('🚨 records SKIPS with their reason, so a campaign can explain itself (M-7)', async () => {
    await withOpenGate(async (mod) => {
      const d = deps({
        buildAudience: async () =>
          audience(users(10), {
            refusals: [
              { userId: 'x1', reason: 'consent' },
              { userId: 'x2', reason: 'quiet_hours' },
            ],
          }),
      })
      await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      const calls = (d.recordDeliveries as ReturnType<typeof vi.fn>).mock.calls
      const skipRows = calls.flatMap((c) => c[1]).filter((r: { status: string }) => r.status === 'skipped')
      expect(skipRows).toEqual([
        { campaignId: 'camp-1', userId: 'x1', status: 'skipped', skipReason: 'consent' },
        { campaignId: 'camp-1', userId: 'x2', status: 'skipped', skipReason: 'quiet_hours' },
      ])
    })
  })

  it('🚨 a REFUSED chunk halts the campaign and records no send for it', async () => {
    // Recording a refusal as a send would silence those people for 24 hours for
    // a message they never received.
    await withOpenGate(async (mod) => {
      const d = deps({
        dispatch: vi.fn(async () => ({ ok: false as const, reason: 'DUPLICATE' as const, retryAfter: 60 })),
      })
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      expect(o.ok).toBe(true)
      if (o.ok) {
        expect(o.result.status).toBe('halted')
        expect(o.result.accepted).toBe(0)
      }
      const sent = (d.recordDeliveries as ReturnType<typeof vi.fn>).mock.calls
        .flatMap((c) => c[1])
        .filter((r: { status: string }) => r.status === 'sent')
      expect(sent).toHaveLength(0)
    })
  })

  it('🚨 a recipient whose row could not be created is NOT recorded as sent', async () => {
    // Counting it would charge that person's frequency cap for a message that
    // does not exist.
    await withOpenGate(async (mod) => {
      const d = deps({
        dispatch: vi.fn(async (req: { recipients: readonly string[] }) => ({
          ok: true as const,
          recipients: req.recipients.length,
          accepted: 0,
          failed: 0,
          gone: 0,
          unreachable: 0,
          errored: req.recipients.length,
          perRecipient: req.recipients.map((userId) => ({
            userId,
            notificationId: null,
            accepted: 0,
            failed: 0,
            gone: 0,
            reachable: false,
          })),
        })),
      })
      await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      const rows = (d.recordDeliveries as ReturnType<typeof vi.fn>).mock.calls[0][1]
      expect(rows.every((r: { status: string }) => r.status === 'skipped')).toBe(true)
    })
  })

  it('chunks a large audience under the seam cap', async () => {
    await withOpenGate(async (mod) => {
      const d = deps({ buildAudience: async () => audience(users(1200)) })
      const o = await mod.runCampaign(ADMIN, CAMPAIGN, ORIGIN, d)
      expect(d.dispatch).toHaveBeenCalledTimes(3)
      const sizes = (d.dispatch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].recipients.length)
      expect(sizes).toEqual([500, 500, 200])
      if (o.ok) expect(o.result.attempted).toBe(1200)
    })
  })
})
