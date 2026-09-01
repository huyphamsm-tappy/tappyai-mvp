import { describe, it, expect } from 'vitest'
import { selectMarketingRecipients, type AudienceInputs } from './marketingAudience'
import type { ConsentRow } from './governance'
import type { AccountStatusRow } from '@/lib/account/accountStatus'

// V2.2-2 — the marketing audience decision.
//
// Every assertion drives the real function. The two properties under test are
// the ones whose inversion is invisible in production:
//
//   · the audience is what survives BOTH layers (M-12b), so the privacy floor
//     is measured against people who could actually be sent to;
//   · a MISSING map entry is an ANSWER, and the two absences point in opposite
//     directions — no consent means refuse, no send history means permit.

const DAY = new Date(Date.UTC(2026, 8, 15, 5, 0)) // 12:00 in Vietnam
const NIGHT = new Date(Date.UTC(2026, 8, 15, 16, 0)) // 23:00 in Vietnam

const OPTED_IN: ConsentRow[] = [{ channel: 'push', opted_in: true }]

function inputs(over: Partial<AudienceInputs> = {}): AudienceInputs {
  return {
    profileIds: new Set(['a', 'b', 'c']),
    statusByUser: new Map(),
    consentByUser: new Map([
      ['a', OPTED_IN],
      ['b', OPTED_IN],
      ['c', OPTED_IN],
    ]),
    sendsByUser: new Map(),
    ...over,
  }
}

const banned: AccountStatusRow = { is_suspended: false, suspended_until: null, is_banned: true }
const suspendedForever: AccountStatusRow = {
  is_suspended: true,
  suspended_until: null,
  is_banned: false,
}
const suspensionExpired: AccountStatusRow = {
  is_suspended: true,
  suspended_until: new Date(DAY.getTime() - 86_400_000).toISOString(),
  is_banned: false,
}

// ═════════════════════════════════════════════════════════════════════════════
describe('the happy path exists', () => {
  it('✅ POSITIVE CONTROL — three eligible, consenting users are all recipients', () => {
    // Without this, every exclusion test below would pass against a function
    // that returned an empty audience unconditionally.
    const r = selectMarketingRecipients(['a', 'b', 'c'], inputs(), DAY)
    expect(r.recipients).toEqual(['a', 'b', 'c'])
    expect(r.candidates).toBe(3)
    expect(r.refusals).toEqual([])
  })

  it('preserves the order it was given', () => {
    // Chunk boundaries are positional; a reordered audience notifies some
    // people twice on resume and others never.
    const r = selectMarketingRecipients(['c', 'a', 'b'], inputs(), DAY)
    expect(r.recipients).toEqual(['c', 'a', 'b'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('layer 1 — account eligibility', () => {
  it('excludes an account with no profile', () => {
    const r = selectMarketingRecipients(['a', 'b'], inputs({ profileIds: new Set(['a']) }), DAY)
    expect(r.recipients).toEqual(['a'])
    expect(r.skipped.ineligible).toBe(1)
  })

  it('excludes a banned account', () => {
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ statusByUser: new Map([['b', banned]]) }),
      DAY,
    )
    expect(r.recipients).toEqual(['a'])
    expect(r.skipped.ineligible).toBe(1)
  })

  it('excludes a suspended account', () => {
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ statusByUser: new Map([['b', suspendedForever]]) }),
      DAY,
    )
    expect(r.recipients).toEqual(['a'])
  })

  it('🚨 an EXPIRED suspension is NOT an exclusion', () => {
    // Auto-unsuspend is a cron; reading `is_suspended` raw would turn a lapsed
    // 7-day suspension into permanent exclusion from every campaign, and the
    // person would simply stop receiving things with nobody noticing.
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ statusByUser: new Map([['b', suspensionExpired]]) }),
      DAY,
    )
    expect(r.recipients).toEqual(['a', 'b'])
  })

  it('🔑 an account with NO status row is active — the LEFT join', () => {
    // `account_status` has no backfill and no signup trigger: a row appears
    // only when an administrator acts. Treating absence as ineligible would
    // empty the audience while reporting success.
    const r = selectMarketingRecipients(['a'], inputs({ statusByUser: new Map() }), DAY)
    expect(r.recipients).toEqual(['a'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('layer 2 — marketing governance', () => {
  it('🚨 excludes a user with NO consent rows', () => {
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ consentByUser: new Map([['a', OPTED_IN]]) }),
      DAY,
    )
    expect(r.recipients).toEqual(['a'])
    expect(r.skipped.consent).toBe(1)
  })

  it('excludes a globally unsubscribed user even with channel consent', () => {
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({
        consentByUser: new Map([
          ['a', OPTED_IN],
          ['b', [...OPTED_IN, { channel: 'global', opted_in: false }]],
        ]),
      }),
      DAY,
    )
    expect(r.recipients).toEqual(['a'])
    expect(r.skipped.unsubscribed).toBe(1)
  })

  it('excludes a user already sent to inside 24h', () => {
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ sendsByUser: new Map([['b', [new Date(DAY.getTime() - 3_600_000)]]]) }),
      DAY,
    )
    expect(r.recipients).toEqual(['a'])
    expect(r.skipped.frequency_24h).toBe(1)
  })

  it('🔑 NO send history PERMITS a send — absence points the other way here', () => {
    // The two absences in this function mean opposite things. No consent rows
    // refuses; no send history permits. A map pre-filled with defaults would
    // have to pick one and would be wrong for the other.
    const r = selectMarketingRecipients(['a'], inputs({ sendsByUser: new Map() }), DAY)
    expect(r.recipients).toEqual(['a'])
  })

  it('🚨 quiet hours empty the audience without erroring', () => {
    const r = selectMarketingRecipients(['a', 'b', 'c'], inputs(), NIGHT)
    expect(r.recipients).toEqual([])
    expect(r.skipped.quiet_hours).toBe(3)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('what the audience reports', () => {
  it('🚨 skip counts are numbers, and the summary carries no identity', () => {
    const r = selectMarketingRecipients(
      ['a', 'b', 'c'],
      inputs({ consentByUser: new Map([['a', OPTED_IN]]) }),
      DAY,
    )
    expect(r.skipped.consent).toBe(2)
    // The counts object must be safe to put in an audit row or an API response.
    expect(JSON.stringify(r.skipped)).not.toMatch(/[abc]"/)
    expect(Object.values(r.skipped).every((v) => typeof v === 'number')).toBe(true)
  })

  it('refusals carry identity ONLY so a skipped delivery row can be written', () => {
    // This is the one place a reason travels with a user id. It never leaves
    // the server: it is written to notification_deliveries and nowhere else.
    const r = selectMarketingRecipients(
      ['a', 'b'],
      inputs({ consentByUser: new Map([['a', OPTED_IN]]) }),
      DAY,
    )
    expect(r.refusals).toEqual([{ userId: 'b', reason: 'consent' }])
  })

  it('every refused user appears exactly once, and counts match refusals', () => {
    const r = selectMarketingRecipients(['a', 'b', 'c'], inputs({ consentByUser: new Map() }), DAY)
    expect(r.refusals).toHaveLength(3)
    const total = Object.values(r.skipped).reduce((a, b) => a + b, 0)
    expect(total).toBe(r.refusals.length)
  })

  it('recipients plus refusals always equal the candidate list — nobody vanishes', () => {
    // "Delivered to 40 of 100" with 60 unexplained is the failure this
    // invariant exists to prevent.
    const r = selectMarketingRecipients(
      ['a', 'b', 'c'],
      inputs({
        profileIds: new Set(['a', 'b']),
        consentByUser: new Map([['a', OPTED_IN]]),
      }),
      DAY,
    )
    expect(r.recipients.length + r.refusals.length).toBe(3)
    expect(r.candidates).toBe(3)
  })

  it('an empty candidate list produces an empty, well-formed audience', () => {
    const r = selectMarketingRecipients([], inputs(), DAY)
    expect(r).toEqual({
      recipients: [],
      candidates: 0,
      skipped: {
        consent: 0,
        unsubscribed: 0,
        frequency_24h: 0,
        frequency_7d: 0,
        quiet_hours: 0,
        ineligible: 0,
      },
      refusals: [],
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('precedence between the two layers', () => {
  it('🔑 a banned account that also never consented is reported as INELIGIBLE', () => {
    // "May we message this account at all" is answered before "did they agree",
    // so an operator is not told a banned user simply needs to opt in.
    const r = selectMarketingRecipients(
      ['b'],
      inputs({
        statusByUser: new Map([['b', banned]]),
        consentByUser: new Map(),
      }),
      DAY,
    )
    expect(r.refusals).toEqual([{ userId: 'b', reason: 'ineligible' }])
  })
})
