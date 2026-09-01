import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CONSENT_EXPORT_SATISFIED,
  canActivateSend,
  evaluateActivation,
  activationBlockMessage,
} from './activationGate'
import { serverEnv } from '@/lib/config/env'

// V2.2-2 — the activation gate.
//
// 🚨 THESE TESTS EXIST TO KEEP MARKETING UNABLE TO SEND. Most test files prove
// a feature works; this one proves a capability is ABSENT, and stays absent
// even when everything else is arranged to permit it.

afterEach(() => vi.restoreAllMocks())

describe('🚨 M-30 — the contract gate', () => {
  it('consent export is UNSATISFIED', () => {
    // Owner decision, not an implementation detail. Flipping this without the
    // exported payload demonstrably containing consent state would be a false
    // statement about a compliance obligation, made in code (M-2a).
    expect(CONSENT_EXPORT_SATISFIED).toBe(false)
  })

  it('🚨 sending is refused, and the reason names the real blocker', () => {
    expect(canActivateSend()).toEqual({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
  })

  it('🚨 setting the environment switch does NOT unblock it', () => {
    // The whole point of two gates. An env flag can be flipped in seconds from
    // a deployment dashboard with no review; M-30 is an unmet legal
    // precondition and Q6 an unresolved ownership question, so no switch may
    // open it.
    vi.spyOn(serverEnv, 'marketingSendingEnabled').mockReturnValue(true)
    expect(canActivateSend()).toEqual({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
  })

  it('the contract gate is reported BEFORE the switch', () => {
    // An operator told "sending is disabled" would go hunting for a switch to
    // flip. The honest answer is that no switch will help.
    vi.spyOn(serverEnv, 'marketingSendingEnabled').mockReturnValue(false)
    const v = canActivateSend()
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('CONSENT_EXPORT_UNSATISFIED')
  })
})

describe('the gate logic — all four combinations', () => {
  // Against `evaluateActivation` rather than `canActivateSend`, because the
  // constant is false in every environment this will ever run in: a test of the
  // second gate written against the wrapper could only ever hit the FIRST
  // refusal, and would keep passing if the second gate were deleted.

  it('🚨 export unsatisfied + switch off  → refused on the contract gate', () => {
    expect(evaluateActivation(false, false)).toEqual({
      ok: false,
      reason: 'CONSENT_EXPORT_UNSATISFIED',
    })
  })

  it('🚨 export unsatisfied + switch ON   → STILL refused on the contract gate', () => {
    // The switch cannot open what the contract closed.
    expect(evaluateActivation(false, true)).toEqual({
      ok: false,
      reason: 'CONSENT_EXPORT_UNSATISFIED',
    })
  })

  it('🔑 export satisfied + switch off    → refused on the operational switch', () => {
    // This is the branch that proves the second gate exists at all.
    expect(evaluateActivation(true, false)).toEqual({ ok: false, reason: 'SENDING_DISABLED' })
  })

  it('export satisfied + switch on        → permitted (the only open combination)', () => {
    expect(evaluateActivation(true, true)).toEqual({ ok: true })
  })

  it('🔑 and today the wrapper is wired to the FIRST of those', () => {
    // Ties the pure logic back to the shipped values, so a future edit that
    // pointed `canActivateSend` at something else would fail here.
    expect(canActivateSend()).toEqual(
      evaluateActivation(CONSENT_EXPORT_SATISFIED, serverEnv.marketingSendingEnabled()),
    )
  })

  it('the env switch reads strictly `true`, not truthiness', () => {
    // 'false', '0' and 'off' are all truthy strings. A switch that asked
    // whether the value was SET would arm on `MARKETING_SENDING_ENABLED=false`.
    const prev = process.env.MARKETING_SENDING_ENABLED
    try {
      process.env.MARKETING_SENDING_ENABLED = 'false'
      expect(serverEnv.marketingSendingEnabled()).toBe(false)
      process.env.MARKETING_SENDING_ENABLED = '1'
      expect(serverEnv.marketingSendingEnabled()).toBe(false)
      process.env.MARKETING_SENDING_ENABLED = 'true'
      expect(serverEnv.marketingSendingEnabled()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.MARKETING_SENDING_ENABLED
      else process.env.MARKETING_SENDING_ENABLED = prev
    }
  })

  it('🚨 it is a DIFFERENT variable from the Phase C broadcast switch', () => {
    // DoD 13: the Phase C switch is not reused as a Marketing switch. Arming a
    // Controller broadcast for one message must not arm every campaign.
    const prev = process.env.CONTROLLER_BROADCAST_ENABLED
    try {
      process.env.CONTROLLER_BROADCAST_ENABLED = 'true'
      delete process.env.MARKETING_SENDING_ENABLED
      expect(serverEnv.broadcastEnabled()).toBe(true)
      expect(serverEnv.marketingSendingEnabled()).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.CONTROLLER_BROADCAST_ENABLED
      else process.env.CONTROLLER_BROADCAST_ENABLED = prev
    }
  })
})

describe('the block message says what is true', () => {
  it('names M-30 and Q6 rather than suggesting a switch', () => {
    const m = activationBlockMessage('CONSENT_EXPORT_UNSATISFIED')
    expect(m).toMatch(/M-30/)
    expect(m).toMatch(/Q6/)
  })

  it('the disabled-switch message is separate', () => {
    expect(activationBlockMessage('SENDING_DISABLED')).toBe('Marketing sending is disabled')
  })
})
