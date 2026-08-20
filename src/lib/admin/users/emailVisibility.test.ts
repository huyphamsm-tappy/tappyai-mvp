import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module 08 — the §6 email masking policy.
//
// The interesting assertions are the two ways masking gets quietly broken:
// leaking the local part's LENGTH, and denying instead of masking.

const h = vi.hoisted(() => ({ can: vi.fn() }))
vi.mock('@/lib/admin/permissions/engine', () => ({ permissionEngine: { can: h.can } }))

import { maskEmail, canReadFullEmail, emailFor } from './emailVisibility'
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
