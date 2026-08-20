import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module 08 — per-field visibility: §6 email masking, and the ban-reason gate
// added by Owner Decision A (ADR-023 sub-decision (a)).
//
// The interesting assertions are the ways a field gate gets quietly broken:
// leaking the local part's LENGTH, denying instead of masking, claiming a
// hidden value where there is none, and — the one that matters most here — the
// two gates collapsing into a single check.

const h = vi.hoisted(() => ({ can: vi.fn() }))
vi.mock('@/lib/admin/permissions/engine', () => ({ permissionEngine: { can: h.can } }))

import { maskEmail, canReadFullEmail, emailFor, canReadBanReason, banReasonFor } from './fieldVisibility'
import { PERMISSIONS } from '@/lib/admin/permissions/registry'
import type { Actor } from '@/lib/admin/rbac'

const actor = (over: Partial<Actor> = {}) =>
  ({ userId: 'a', isOwner: false, roles: ['moderator'], capabilities: [], ...over }) as unknown as Actor

beforeEach(() => {
  vi.clearAllMocks()
  h.can.mockReturnValue(false)
})

describe('maskEmail', () => {
  it('produces §6’s shape', () => {
    expect(maskEmail('huypham.sm@gmail.com')).toBe('h***@gmail.com')
  })

  it('is FIXED width — the mask must not encode how long the local part was', () => {
    // Two addresses on the same domain, local parts of very different length.
    const short = maskEmail('ab@tappyai.com')
    const long = maskEmail('averylonglocalpartindeed@tappyai.com')
    expect(short).toBe(long)
    expect(short).toBe('a***@tappyai.com')
  })

  it('keeps the domain, which is what makes the masked value useful at all', () => {
    expect(maskEmail('x@sub.example.co.uk').endsWith('@sub.example.co.uk')).toBe(true)
  })

  it('splits on the LAST @, so a quoted local part cannot smuggle the domain out', () => {
    expect(maskEmail('a@b@real.com')).toBe('a***@real.com')
  })

  it.each(['', 'no-at-sign', '@leading.com', 'trailing@'])(
    'reveals nothing for a value it cannot parse: %s',
    (value) => {
      expect(maskEmail(value)).toBe('***')
    }
  )
})

describe('the policy is a PERMISSION, not a role comparison', () => {
  it('asks the PDP for users.email.read_full', () => {
    canReadFullEmail(actor())
    expect(h.can).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.USERS_EMAIL_READ_FULL)
  })

  it('the PDP’s answer is what decides — an allowing PDP unmasks', () => {
    h.can.mockReturnValue(true)
    expect(emailFor(actor(), 'huypham.sm@gmail.com')).toBe('huypham.sm@gmail.com')
  })

  it('a denying PDP MASKS rather than denying — a moderator must still see the list', () => {
    h.can.mockReturnValue(false)
    expect(emailFor(actor(), 'huypham.sm@gmail.com')).toBe('h***@gmail.com')
  })
})

describe('emailFor', () => {
  it.each([null, undefined, ''])('no address on file stays absent, never "***" (%s)', (value) => {
    expect(emailFor(actor(), value)).toBeNull()
    // Claiming a hidden address exists is a different — and wrong — statement.
    expect(h.can).not.toHaveBeenCalled()
  })
})

describe('the ban-reason gate (ADR-023 sub-decision (a))', () => {
  const NOTE = 'coordinated review fraud across twelve accounts'

  it('asks the PDP for users.ban_reason.read', () => {
    canReadBanReason(actor())
    expect(h.can).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.USERS_BAN_REASON_READ)
  })

  it('withholds the note when the PDP denies it', () => {
    h.can.mockReturnValue(false)
    expect(banReasonFor(actor(), NOTE)).toEqual({ value: null, withheld: true })
  })

  it('returns the note when the PDP grants it', () => {
    h.can.mockReturnValue(true)
    expect(banReasonFor(actor(), NOTE)).toEqual({ value: NOTE, withheld: false })
  })

  it.each([null, undefined, ''])(
    'reports no note as absent, not withheld (%s)',
    (value) => {
      expect(banReasonFor(actor(), value)).toEqual({ value: null, withheld: false })
      // An account banned with no reason recorded must not look like one whose
      // reason is being kept from the reader.
      expect(h.can).not.toHaveBeenCalled()
    }
  )

  it('there is no partial form — no fragment of the note survives in the result', () => {
    h.can.mockReturnValue(false)
    // Asserted over the WHOLE returned object, not just `value`: a truncated
    // preview smuggled into any field would be a leak, and a half-shown
    // moderation note is misleading rather than safer.
    expect(JSON.stringify(banReasonFor(actor(), NOTE))).not.toContain('fraud')
  })
})

describe('the two gates are INDEPENDENT permissions, not one check reused', () => {
  const NOTE = 'fraud ring'

  it('holding only users.email.read_full does not reveal the ban reason', () => {
    h.can.mockImplementation((_a: unknown, p: string) => p === PERMISSIONS.USERS_EMAIL_READ_FULL)

    expect(emailFor(actor(), 'huypham.sm@gmail.com')).toBe('huypham.sm@gmail.com')
    expect(banReasonFor(actor(), NOTE).withheld).toBe(true)
  })

  it('holding only users.ban_reason.read does not unmask the address', () => {
    h.can.mockImplementation((_a: unknown, p: string) => p === PERMISSIONS.USERS_BAN_REASON_READ)

    expect(emailFor(actor(), 'huypham.sm@gmail.com')).toBe('h***@gmail.com')
    expect(banReasonFor(actor(), NOTE).value).toBe(NOTE)
  })
})
