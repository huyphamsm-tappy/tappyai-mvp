import { describe, it, expect } from 'vitest'
import {
  CAMPAIGN_STATUSES,
  canTransition,
  isEditable,
  isActivatable,
  type CampaignStatus,
} from './campaignLifecycle'

// V2.2-2 — the campaign lifecycle (M-16).
//
// The transition table is small enough to test EXHAUSTIVELY, so this file does
// that rather than spot-checking: every ordered pair of states is asserted, and
// a new state or a new edge cannot be added without a test failing.

const ALL = CAMPAIGN_STATUSES

describe('the whole transition table', () => {
  /** The only two edges that exist. */
  const PERMITTED = new Set(['draft->active', 'active->completed'])

  it('🚨 every ordered pair is decided, and only two are permitted', () => {
    const permitted: string[] = []
    for (const from of ALL) {
      for (const to of ALL) {
        if (canTransition(from, to).ok) permitted.push(`${from}->${to}`)
      }
    }
    expect(new Set(permitted)).toEqual(PERMITTED)
    // 3 states x 3 states = 9 pairs; 2 permitted, 7 refused. Stated as a number
    // so adding a state without updating this test fails loudly.
    expect(ALL.length * ALL.length - permitted.length).toBe(7)
  })

  it('draft -> active is permitted — positive control', () => {
    expect(canTransition('draft', 'active')).toEqual({ ok: true })
  })

  it('active -> completed is permitted — positive control', () => {
    expect(canTransition('active', 'completed')).toEqual({ ok: true })
  })
})

describe('🚨 completed is terminal — the irreversibility guard', () => {
  it('completed -> active is refused as TERMINAL', () => {
    // Re-activating would send the same message to the same audience a second
    // time, and no confirmation UI makes that recoverable.
    expect(canTransition('completed', 'active')).toEqual({ ok: false, reason: 'TERMINAL' })
  })

  it('completed -> draft is refused as TERMINAL', () => {
    expect(canTransition('completed', 'draft')).toEqual({ ok: false, reason: 'TERMINAL' })
  })

  it('a completed campaign is not activatable', () => {
    expect(isActivatable('completed')).toBe(false)
  })
})

describe('backwards and skipping edges', () => {
  it('active -> draft is refused', () => {
    expect(canTransition('active', 'draft')).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    })
  })

  it('🔑 draft -> completed is refused — a send that never happened', () => {
    // Allowing it would create rows claiming a campaign completed without ever
    // activating, poisoning the delivery analysis window doc 34 describes.
    expect(canTransition('draft', 'completed')).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    })
  })
})

describe('🚨 a no-op is refused, not ignored', () => {
  it.each(ALL)('%s -> %s is NO_OP', (s: CampaignStatus) => {
    // `active -> active` is what a double-clicked activation sends. Answering
    // "fine" would let the route run a second pass over the same audience; the
    // ledger would catch the duplicate sends, but a guard that relies on the
    // layer below it to be correct is not a guard.
    expect(canTransition(s, s)).toEqual({ ok: false, reason: 'NO_OP' })
  })
})

describe('editability', () => {
  it('only a draft is editable', () => {
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('active')).toBe(false)
    expect(isEditable('completed')).toBe(false)
  })
})

describe('activatability agrees with the transition table', () => {
  it.each(ALL)('%s', (s: CampaignStatus) => {
    // One definition of the lifecycle, not two that can drift apart.
    expect(isActivatable(s)).toBe(canTransition(s, 'active').ok)
  })
})
