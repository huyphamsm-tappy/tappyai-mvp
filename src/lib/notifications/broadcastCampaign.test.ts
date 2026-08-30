import { describe, it, expect, vi } from 'vitest'
import {
  runBroadcastCampaign,
  BROADCAST_CAMPAIGN_KEY,
  type DispatchFn,
} from './broadcastCampaign'
import type { DispatchOutcome, DispatchRequest } from './dispatchService'

// Contract §5, §5.1 — C-7, C-34 … C-39. Owner decision O-3 = A.
//
// Everything here is behavioural: a real orchestrator, a recording dispatch, and
// assertions about WHO WAS SENT TO. Nothing reads source text.

const CAMPAIGN = 'ffffffff-0000-0000-0000-00000000000c'
const ids = (n: number, p = 'u') => Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(4, '0')}`)

const ok = (n: number): DispatchOutcome => ({
  ok: true,
  recipients: n,
  accepted: n,
  failed: 0,
  gone: 0,
  unreachable: 0,
  errored: 0,
  perRecipient: [],
})

/** Records every recipient the campaign actually dispatched to. */
function recorder(
  behaviour?: (call: number, req: DispatchRequest) => DispatchOutcome | Error | undefined,
) {
  const sentTo: string[] = []
  const requests: DispatchRequest[] = []
  let call = 0
  const dispatch: DispatchFn = async (req) => {
    call++
    requests.push(req)
    const outcome = behaviour?.(call, req)
    if (outcome instanceof Error) throw outcome
    // A refusal means the seam did nothing — so nothing is recorded as sent.
    if (outcome && !outcome.ok) return outcome
    sentTo.push(...req.recipients)
    return outcome ?? ok(req.recipients.length)
  }
  return { dispatch, sentTo, requests }
}

const run = (
  audience: string[],
  deps: { dispatch: DispatchFn; alreadyNotified?: (c: string, u: readonly string[]) => Promise<Set<string>> },
  extra: Partial<Parameters<typeof runBroadcastCampaign>[0]> = {},
) =>
  runBroadcastCampaign({
    campaignId: CAMPAIGN,
    audience,
    message: { title: 't', body: 'b' },
    origin: {
      source: 'controller',
      action: 'notification.broadcast',
      actorId: 'actor-1',
      actorEmail: 'a@example.com',
      actorRole: 'super_admin',
      isPlatformOwner: false,
    },
    chunkSize: 2,
    deps: {
      dispatch: deps.dispatch,
      alreadyNotified: deps.alreadyNotified ?? (async () => new Set()),
    },
    ...extra,
  })

describe('the campaign stamps its identity on every row it creates', () => {
  it('🔑 every dispatch carries the campaign id — this IS the ledger', async () => {
    const r = recorder()
    await run(ids(5), r)
    expect(r.requests).toHaveLength(3)
    for (const req of r.requests) {
      expect(req.data).toEqual({ [BROADCAST_CAMPAIGN_KEY]: CAMPAIGN })
    }
  })

  it('adds nothing else to the row', async () => {
    const r = recorder()
    await run(ids(1), r)
    expect(Object.keys(r.requests[0].data ?? {})).toEqual([BROADCAST_CAMPAIGN_KEY])
  })
})

describe('idempotency is per RECIPIENT, not per run (C-35)', () => {
  it('🚨 MUTATION TARGET — recipients already notified for this campaign are SKIPPED', async () => {
    const r = recorder()
    const audience = ids(5)
    const result = await run(audience, {
      dispatch: r.dispatch,
      alreadyNotified: async () => new Set([audience[0], audience[3]]),
    })
    expect(r.sentTo).toEqual([audience[1], audience[2], audience[4]])
    expect(result.alreadyNotified).toBe(2)
    expect(result.attempted).toBe(3)
  })

  it('🚨 replaying the whole campaign sends to NOBODY a second time', async () => {
    const audience = ids(5)
    const notified = new Set<string>()
    const first = recorder()
    await run(audience, {
      dispatch: async (req) => {
        req.recipients.forEach((id) => notified.add(id))
        return first.dispatch(req)
      },
      alreadyNotified: async () => new Set(notified),
    })
    expect(notified.size).toBe(5)

    // The resume: same campaign id, same audience, ledger now full.
    const second = recorder()
    const result = await run(audience, {
      dispatch: second.dispatch,
      alreadyNotified: async () => new Set(notified),
    })
    expect(second.sentTo).toEqual([])
    expect(result.chunkCount).toBe(0)
    expect(result.status).toBe('completed')
  })

  it('a resume preserves recipient ORDER for what remains (C-36)', async () => {
    const audience = ids(6)
    const r = recorder()
    await run(audience, {
      dispatch: r.dispatch,
      alreadyNotified: async () => new Set([audience[2]]),
    })
    // Order of the survivors is the audience order with the skipped one removed
    // — not re-sorted, not re-queried.
    expect(r.sentTo).toEqual([audience[0], audience[1], audience[3], audience[4], audience[5]])
  })
})

describe('🚨 THE HARD CASE — dispatched, then the process died before recording (C-37)', () => {
  it('the chunk is reported unknown, NOT retried, and later chunks still run', async () => {
    // Later chunks hold disjoint recipients (guaranteed by the partition), so
    // continuing cannot double-notify anyone the unknown chunk may have reached.
    const audience = ids(6)
    const r = recorder((call) => (call === 1 ? new Error('socket hang up') : undefined))
    const result = await run(audience, r)

    expect(result.chunks[0].status).toBe('failed-after-dispatch-unknown')
    expect(result.chunks.filter((c) => c.status === 'success')).toHaveLength(2)
    // The failed chunk was attempted exactly ONCE.
    expect(r.requests.filter((q) => q.recipients[0] === audience[0])).toHaveLength(1)
    expect(result.status).toBe('partial')
  })

  it('🚨 on resume, whoever DID get a row is skipped — no duplicate', async () => {
    const audience = ids(6)
    // The first chunk reached its first recipient before the process died.
    const partiallyNotified = new Set([audience[0]])
    const r = recorder()
    await run(audience, {
      dispatch: r.dispatch,
      alreadyNotified: async () => new Set(partiallyNotified),
    })
    expect(r.sentTo).not.toContain(audience[0])
    expect(r.sentTo).toEqual([audience[1], audience[2], audience[3], audience[4], audience[5]])
  })
})

describe('partial failure is classified, not flattened (C-8)', () => {
  it('🔑 a REFUSAL means nothing was sent — and is reported distinctly from unknown', async () => {
    const audience = ids(4)
    const r = recorder((call) =>
      call === 1 ? ({ ok: false, reason: 'DUPLICATE', retryAfter: 60 } as DispatchOutcome) : undefined,
    )
    const result = await run(audience, r)

    expect(result.chunks[0]).toMatchObject({ status: 'failed-before-dispatch', reason: 'DUPLICATE' })
    expect(result.chunks[1].status).toBe('success')
    // Nothing from the refused chunk went out.
    expect(r.sentTo).toEqual([audience[2], audience[3]])
    expect(result.status).toBe('partial')
  })

  it('🚨 a refusal is NOT retried in-process — none of the seam refusals is transient', async () => {
    // DUPLICATE is suppressed for 60s; TOO_MANY and NO_RECIPIENTS are
    // deterministic. A retry loop would burn attempts to reach the same answer
    // and would look like resilience while providing none.
    const r = recorder(() => ({ ok: false, reason: 'DUPLICATE', retryAfter: 60 }) as DispatchOutcome)
    await run(ids(2), r)
    expect(r.requests).toHaveLength(1)
  })

  it('reports which recipients were reached, per chunk, in aggregate', async () => {
    const r = recorder((call) => (call === 2 ? ok(2) : undefined))
    const result = await run(ids(4), r)
    expect(result.accepted).toBe(4)
    expect(result.chunks.map((c) => c.size)).toEqual([2, 2])
  })

  it('every chunk succeeding reports completed', async () => {
    const result = await run(ids(4), recorder())
    expect(result.status).toBe('completed')
  })
})

describe('the kill switch stops an in-flight campaign (C-13)', () => {
  it('🚨 stops at the next chunk boundary and says so', async () => {
    const audience = ids(6)
    const r = recorder()
    let live = true
    const result = await run(audience, r, {
      shouldContinue: () => {
        const now = live
        live = false // flipped after the first check
        return now
      },
    })
    expect(r.sentTo).toEqual([audience[0], audience[1]])
    expect(result.status).toBe('stopped')
  })

  it('does not pretend the campaign never happened', async () => {
    const r = recorder()
    const result = await run(ids(6), r, { shouldContinue: () => false })
    expect(result.status).toBe('stopped')
    expect(result.attempted).toBe(6) // what it set out to do is still reported
    expect(r.sentTo).toEqual([])
  })
})

describe('nothing is sent to anyone outside the audience', () => {
  it('🚨 the union of dispatched recipients is exactly the audience', async () => {
    const audience = ids(7)
    const r = recorder()
    await run(audience, r)
    expect([...r.sentTo].sort()).toEqual([...audience].sort())
    expect(new Set(r.sentTo).size).toBe(audience.length) // nobody twice
  })

  it('an empty audience dispatches nothing at all', async () => {
    const r = recorder()
    const result = await run([], r)
    expect(r.requests).toEqual([])
    expect(result.status).toBe('completed')
    expect(result.chunkCount).toBe(0)
  })
})

describe('the campaign never exceeds the cap (C-23)', () => {
  it('🚨 MUTATION TARGET — no dispatch carries more than 500 recipients', async () => {
    const r = recorder()
    await runBroadcastCampaign({
      campaignId: CAMPAIGN,
      audience: ids(1201),
      message: { title: 't', body: 'b' },
      origin: {
        source: 'controller',
        action: 'notification.broadcast',
        actorId: 'a',
        actorEmail: 'a@example.com',
        actorRole: 'super_admin',
        isPlatformOwner: false,
      },
      deps: { dispatch: r.dispatch, alreadyNotified: async () => new Set() },
    })
    expect(r.requests).toHaveLength(3)
    for (const req of r.requests) expect(req.recipients.length).toBeLessThanOrEqual(500)
  })
})

describe('the ledger read is not allowed to fail open', () => {
  it('🚨 a ledger error aborts the campaign rather than sending to everyone', async () => {
    // An empty set means "send to everyone". Degrading to it on a read failure
    // would turn a resume into a second full broadcast, at the exact moment the
    // system is already unhealthy.
    const r = recorder()
    await expect(
      run(ids(3), {
        dispatch: r.dispatch,
        alreadyNotified: async () => {
          throw new Error('ledger read failed')
        },
      }),
    ).rejects.toThrow(/ledger read failed/)
    expect(r.requests).toEqual([])
  })
})

describe('the campaign holds no authorization', () => {
  it('🔑 it dispatches whatever audience it is given — the ROUTE authorizes', async () => {
    // Same reason the seam holds none: a permission check here would sit
    // between the route and the seam and become a second, quieter gate.
    const r = recorder()
    await run(['anyone-at-all'], r)
    expect(r.sentTo).toEqual(['anyone-at-all'])
    expect(vi.isMockFunction(r.dispatch)).toBe(false)
  })
})
