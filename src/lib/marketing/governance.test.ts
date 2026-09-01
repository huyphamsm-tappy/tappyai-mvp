import { describe, it, expect } from 'vitest'
import {
  MARKETING_CHANNELS,
  GLOBAL_CONSENT_CHANNEL,
  isGloballyUnsubscribed,
  hasChannelConsent,
  vietnamHour,
  isQuietHours,
  QUIET_HOURS_START,
  QUIET_HOURS_END,
  countWithinWindow,
  frequencyBreach,
  decideRecipient,
  checkAudienceFloor,
  emptySkipCounts,
  MIN_AUDIENCE,
  CAP_24H,
  CAP_7D,
  WINDOW_24H_MS,
  WINDOW_7D_MS,
  type ConsentRow,
  type RecipientState,
} from './governance'

// ─── V2.2-2 MARKETING GOVERNANCE — BEHAVIOURAL TESTS ─────────────────────────
//
// Contract DoD 2–6. Every test here runs the code; none asserts on source text.
// The mutation harness (governanceMutation.test.ts) is what proves these tests
// would FAIL if a rule were removed — a passing suite is not evidence on its
// own, which this repository has learned more than once.

/** Vietnam is UTC+7 with no DST, so a UTC instant maps to a known VN hour. */
function atVietnamHour(hour: number, minute = 0): Date {
  // VN hour H == UTC hour H-7 (mod 24). Anchored on a fixed date so the test
  // does not drift with the calendar.
  const utcHour = (hour - 7 + 24) % 24
  return new Date(Date.UTC(2026, 8, 15, utcHour, minute, 0))
}

const OPTED_IN: ConsentRow[] = [{ channel: 'push', opted_in: true }]

function state(over: Partial<RecipientState> = {}): RecipientState {
  return { consent: OPTED_IN, sentAt: [], eligible: true, ...over }
}

// ═════════════════════════════════════════════════════════════════════════════
describe('§2 consent — absence means opted out (M-1)', () => {
  it('🚨 a user with NO consent row does not consent', () => {
    // DoD 2. This is the single assertion the whole opt-in posture rests on.
    expect(hasChannelConsent([], 'push')).toBe(false)
  })

  it('a user with an explicit opted_in=false row does not consent', () => {
    expect(hasChannelConsent([{ channel: 'push', opted_in: false }], 'push')).toBe(false)
  })

  it('a user with opted_in=true on push consents on push', () => {
    // POSITIVE CONTROL. Without this, a function that always returned false
    // would pass every other test in this describe block.
    expect(hasChannelConsent([{ channel: 'push', opted_in: true }], 'push')).toBe(true)
  })

  it('consent is per channel — email opt-in does not grant push', () => {
    const rows: ConsentRow[] = [{ channel: 'email', opted_in: true }]
    expect(hasChannelConsent(rows, 'push')).toBe(false)
    expect(hasChannelConsent(rows, 'email')).toBe(true)
  })

  it('models all three channels (M-3), and `global` is not one of them', () => {
    expect([...MARKETING_CHANNELS]).toEqual(['push', 'email', 'in_app'])
    expect(MARKETING_CHANNELS as readonly string[]).not.toContain(GLOBAL_CONSENT_CHANNEL)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('§7 global unsubscribe (M-10)', () => {
  it('a global row with opted_in=false is an unsubscribe', () => {
    expect(isGloballyUnsubscribed([{ channel: 'global', opted_in: false }])).toBe(true)
  })

  it('🔑 a MISSING global row is not an unsubscribe', () => {
    // Otherwise every user on the platform would read as unsubscribed and the
    // audience would silently always be zero — a bug that looks like safety.
    expect(isGloballyUnsubscribed([])).toBe(false)
    expect(isGloballyUnsubscribed(OPTED_IN)).toBe(false)
  })

  it('a global row with opted_in=true is not an unsubscribe', () => {
    expect(isGloballyUnsubscribed([{ channel: 'global', opted_in: true }])).toBe(false)
  })

  it('🚨 global unsubscribe OVERRIDES a per-channel opt-in', () => {
    const rows: ConsentRow[] = [
      { channel: 'push', opted_in: true },
      { channel: 'global', opted_in: false },
    ]
    // The channel row still says yes...
    expect(hasChannelConsent(rows, 'push')).toBe(true)
    // ...and the decision is still a refusal, attributed to the unsubscribe.
    expect(decideRecipient(state({ consent: rows }), atVietnamHour(10))).toEqual({
      send: false,
      reason: 'unsubscribed',
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('§6 quiet hours — 22:00–07:00 Asia/Ho_Chi_Minh (M-8, M-9)', () => {
  it('resolves the Vietnam hour through the timezone database', () => {
    expect(vietnamHour(new Date(Date.UTC(2026, 8, 15, 15, 0)))).toBe(22)
    expect(vietnamHour(new Date(Date.UTC(2026, 8, 15, 0, 0)))).toBe(7)
    // Midnight VN must be 0, not 24 — some ICU builds render "24" under hour12:false.
    expect(vietnamHour(new Date(Date.UTC(2026, 8, 15, 17, 0)))).toBe(0)
  })

  it('🚨 the four boundaries, exactly (DoD 5)', () => {
    expect(isQuietHours(atVietnamHour(21, 59))).toBe(false) // 21:59 sends
    expect(isQuietHours(atVietnamHour(22, 0))).toBe(true) //  22:00 does not
    expect(isQuietHours(atVietnamHour(6, 59))).toBe(true) //  06:59 does not
    expect(isQuietHours(atVietnamHour(7, 0))).toBe(false) //  07:00 sends
  })

  it('the window wraps midnight rather than being an empty range', () => {
    // A `start <= h && h < end` implementation is empty for every hour; these
    // two assertions are what make that mutation observable.
    expect(isQuietHours(atVietnamHour(23))).toBe(true)
    expect(isQuietHours(atVietnamHour(2))).toBe(true)
  })

  it('daytime hours are not quiet — positive control across the whole day', () => {
    for (let h = QUIET_HOURS_END; h < QUIET_HOURS_START; h++) {
      expect(isQuietHours(atVietnamHour(h))).toBe(false)
    }
  })

  it('is evaluated in VN time, not the server timezone', () => {
    // 15:00 UTC is the middle of the working day in UTC and 22:00 in Vietnam.
    // An implementation reading `now.getHours()` passes in a UTC-hosted CI and
    // fails here.
    expect(isQuietHours(new Date(Date.UTC(2026, 8, 15, 15, 30)))).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('§5 rolling frequency caps (M-6a, M-6b, DoD 4)', () => {
  const now = atVietnamHour(12)
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('🚨 rolling 24h: a send at T+23h59m still counts, T+24h01m does not', () => {
    const justInside = ago(WINDOW_24H_MS - 60_000) // 23h59m ago
    const justOutside = ago(WINDOW_24H_MS + 60_000) // 24h01m ago
    expect(countWithinWindow([justInside], now, WINDOW_24H_MS)).toBe(1)
    expect(countWithinWindow([justOutside], now, WINDOW_24H_MS)).toBe(0)
  })

  it('a send exactly `windowMs` old has left the window', () => {
    expect(countWithinWindow([ago(WINDOW_24H_MS)], now, WINDOW_24H_MS)).toBe(0)
  })

  it('🚨 a CALENDAR implementation fails this: two sends 2 minutes apart across midnight', () => {
    // 23:59 VN and 00:01 VN are different CALENDAR DAYS and two minutes apart.
    // Under "1 per calendar day" the second send is permitted; under a rolling
    // 24h window it is refused. This is the test a calendar implementation fails.
    const justBeforeMidnight = atVietnamHour(23, 59) // VN 15 Sep 23:59
    const justAfterMidnight = atVietnamHour(0, 1) //    VN 16 Sep 00:01
    expect(justAfterMidnight.getTime() - justBeforeMidnight.getTime()).toBe(2 * 60_000)
    expect(frequencyBreach([justBeforeMidnight], justAfterMidnight)).toBe('frequency_24h')
  })

  it('one send inside 24h breaches the 24h cap', () => {
    expect(frequencyBreach([ago(60_000)], now)).toBe('frequency_24h')
  })

  it('🚨 four sends inside 7 days breach the weekly cap even with none inside 24h (M-6b)', () => {
    const days = (n: number) => ago(n * 24 * 60 * 60 * 1000)
    const history = [days(2), days(3), days(4), days(5)]
    expect(countWithinWindow(history, now, WINDOW_24H_MS)).toBe(0) // none recent
    expect(frequencyBreach(history, now)).toBe('frequency_7d')
  })

  it('three sends inside 7 days, none inside 24h, is ALLOWED — positive control', () => {
    const days = (n: number) => ago(n * 24 * 60 * 60 * 1000)
    expect(frequencyBreach([days(2), days(3), days(4)], now)).toBeNull()
  })

  it('sends older than 7 days do not count at all', () => {
    const old = ago(WINDOW_7D_MS + 60_000)
    expect(frequencyBreach([old, old, old, old, old], now)).toBeNull()
  })

  it('an empty history never breaches', () => {
    expect(frequencyBreach([], now)).toBeNull()
  })

  it('pins the limits `27` §4 states', () => {
    expect(CAP_24H).toBe(1)
    expect(CAP_7D).toBe(4)
    expect(WINDOW_24H_MS).toBe(86_400_000)
    expect(WINDOW_7D_MS).toBe(604_800_000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('the per-recipient decision', () => {
  const day = atVietnamHour(12)

  it('✅ POSITIVE CONTROL — an eligible, consenting, un-capped user in daytime is SENT', () => {
    // Without this every refusal test below would pass against a function that
    // refused unconditionally.
    expect(decideRecipient(state(), day)).toEqual({ send: true })
  })

  it('refuses an ineligible account first, whatever else is true', () => {
    expect(decideRecipient(state({ eligible: false }), day)).toEqual({
      send: false,
      reason: 'ineligible',
    })
  })

  it('🚨 refuses a user with no consent row (DoD 2)', () => {
    expect(decideRecipient(state({ consent: [] }), day)).toEqual({
      send: false,
      reason: 'consent',
    })
  })

  it('refuses during quiet hours even for a consenting, un-capped user', () => {
    expect(decideRecipient(state(), atVietnamHour(23))).toEqual({
      send: false,
      reason: 'quiet_hours',
    })
  })

  it('refuses a capped user in daytime', () => {
    expect(decideRecipient(state({ sentAt: [new Date(day.getTime() - 60_000)] }), day)).toEqual({
      send: false,
      reason: 'frequency_24h',
    })
  })

  it('precedence: unsubscribe is reported over consent, consent over quiet hours', () => {
    const unsub: ConsentRow[] = [{ channel: 'global', opted_in: false }]
    // Night-time AND unsubscribed AND capped: the most fundamental reason wins.
    const s = state({ consent: unsub, sentAt: [new Date(day.getTime() - 60_000)] })
    expect(decideRecipient(s, atVietnamHour(23))).toEqual({ send: false, reason: 'unsubscribed' })

    // No consent row, at night: consent is reported, not quiet hours.
    expect(decideRecipient(state({ consent: [] }), atVietnamHour(23))).toEqual({
      send: false,
      reason: 'consent',
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('§8.1 audience floor (M-12a, M-12c, DoD 6)', () => {
  it('🚨 refuses at 9 and permits at 10', () => {
    expect(checkAudienceFloor(9)).toEqual({ ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' })
    expect(checkAudienceFloor(10)).toEqual({ ok: true })
  })

  it('permits comfortably above the floor', () => {
    expect(checkAudienceFloor(400)).toEqual({ ok: true })
  })

  it('refuses an empty audience', () => {
    expect(checkAudienceFloor(0)).toEqual({ ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' })
  })

  it('🚨 the refusal carries NO number — it is not a query oracle (M-12c)', () => {
    // An operator must not be able to binary-search a predicate down to one
    // person by reading the shortfall back out of successive refusals.
    const refusal = checkAudienceFloor(1)
    expect(Object.keys(refusal).sort()).toEqual(['ok', 'reason'])
    expect(JSON.stringify(refusal)).not.toMatch(/\d/)
  })

  it('pins the Owner-decided threshold', () => {
    expect(MIN_AUDIENCE).toBe(10)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('skip accounting (M-7, M-9b)', () => {
  it('starts at zero for every reason the decision can return', () => {
    const counts = emptySkipCounts()
    expect(counts).toEqual({
      consent: 0,
      unsubscribed: 0,
      frequency_24h: 0,
      frequency_7d: 0,
      quiet_hours: 0,
      ineligible: 0,
    })
  })

  it('🔑 every reason `decideRecipient` can return has a counter', () => {
    // A reason with no counter would be reported as a send that silently
    // vanished — "delivered to 40 of 100" with no explanation for the 60.
    const counts = emptySkipCounts()
    const reasons = [
      decideRecipient(state({ eligible: false }), atVietnamHour(12)),
      decideRecipient(state({ consent: [{ channel: 'global', opted_in: false }] }), atVietnamHour(12)),
      decideRecipient(state({ consent: [] }), atVietnamHour(12)),
      decideRecipient(state(), atVietnamHour(23)),
      decideRecipient(state({ sentAt: [atVietnamHour(11, 59)] }), atVietnamHour(12)),
    ]
    for (const r of reasons) {
      expect(r.send).toBe(false)
      if (!r.send) expect(counts).toHaveProperty(r.reason)
    }
  })
})
