import { describe, it, expect } from 'vitest'
import {
  UserListQuerySchema,
  SuspendUserSchema,
  UnsuspendUserSchema,
  BanUserSchema,
  UnbanUserSchema,
  encodeCursor,
  decodeCursor,
} from './schema'

// Module 08 — the request contract.
//
// `19_Security.md` §5 is the authority for the reason floor and the duration
// cap. The cursor assertions cover the two failure modes a keyset cursor has:
// it must not be splice-able into the PostgREST filter grammar, and a bad one
// must never degrade into "page one".

const REASON = 'coordinated review fraud across twelve accounts'

describe('the reason floor of 19 §5', () => {
  const schemas = [
    ['suspend', SuspendUserSchema],
    ['unsuspend', UnsuspendUserSchema],
    ['ban', BanUserSchema],
    ['unban', UnbanUserSchema],
  ] as const

  it.each(schemas)('%s rejects a reason under 20 characters', (_name, schema) => {
    expect(schema.safeParse({ reason: 'spam' }).success).toBe(false)
  })

  it.each(schemas)('%s rejects a reason that is only whitespace padding', (_name, schema) => {
    // Trimmed BEFORE measuring — otherwise twenty spaces satisfies the floor
    // and the audit trail fills with blank justifications.
    expect(schema.safeParse({ reason: ' '.repeat(40) }).success).toBe(false)
  })

  it.each(schemas)('%s rejects a reason over 500 characters', (_name, schema) => {
    expect(schema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false)
  })

  it.each(schemas)('%s accepts a stated reason', (_name, schema) => {
    expect(schema.safeParse({ reason: REASON }).success).toBe(true)
  })

  it.each(schemas)('%s requires the reason — lifting a sanction is audited too', (_name, schema) => {
    expect(schema.safeParse({}).success).toBe(false)
  })
})

describe('SuspendUserSchema duration', () => {
  it('is optional — its absence means an indefinite suspension', () => {
    const parsed = SuspendUserSchema.safeParse({ reason: REASON })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.duration_hours).toBeUndefined()
  })

  it('accepts the §5 bounds', () => {
    expect(SuspendUserSchema.safeParse({ reason: REASON, duration_hours: 1 }).success).toBe(true)
    expect(SuspendUserSchema.safeParse({ reason: REASON, duration_hours: 720 }).success).toBe(true)
  })

  it.each([0, -1, 721, 1.5])('rejects %s', (duration_hours) => {
    expect(SuspendUserSchema.safeParse({ reason: REASON, duration_hours }).success).toBe(false)
  })

  it('rejects an unknown field rather than ignoring it', () => {
    expect(SuspendUserSchema.safeParse({ reason: REASON, duration_days: 3 }).success).toBe(false)
  })
})

describe('BanUserSchema', () => {
  it('carries optional audit-only notes alongside the stored reason', () => {
    const parsed = BanUserSchema.safeParse({ reason: REASON, notes: 'ticket #4821' })
    expect(parsed.success && parsed.data.notes).toBe('ticket #4821')
  })
})

describe('UserListQuerySchema', () => {
  it('defaults to 50 per page and coerces the string a query string actually delivers', () => {
    const parsed = UserListQuerySchema.safeParse({})
    expect(parsed.success && parsed.data.limit).toBe(50)
    const explicit = UserListQuerySchema.safeParse({ limit: '25' })
    expect(explicit.success && explicit.data.limit).toBe(25)
  })

  it('caps the page at 100', () => {
    expect(UserListQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })

  it('rejects an unimplemented filter instead of silently ignoring it', () => {
    // §2 lists `platform`. It is not implemented this round, and a caller must
    // learn that rather than believe the list was filtered.
    expect(UserListQuerySchema.safeParse({ platform: 'android' }).success).toBe(false)
  })

  it('rejects a one-character search', () => {
    expect(UserListQuerySchema.safeParse({ q: 'a' }).success).toBe(false)
  })

  it('accepts the three standings and nothing else', () => {
    for (const status of ['active', 'suspended', 'banned']) {
      expect(UserListQuerySchema.safeParse({ status }).success).toBe(true)
    }
    expect(UserListQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
})

describe('the keyset cursor', () => {
  const CREATED = '2026-08-20T12:00:00+00:00'
  const ID = '33333333-3333-3333-3333-333333333333'

  it('round-trips both halves — the id is the tiebreaker, not decoration', () => {
    expect(decodeCursor(encodeCursor(CREATED, ID))).toEqual({ createdAt: CREATED, id: ID })
  })

  it('survives a timestamp containing the offset separator', () => {
    const decoded = decodeCursor(encodeCursor('2026-08-20T12:00:00.123456+07:00', ID))
    expect(decoded?.createdAt).toBe('2026-08-20T12:00:00.123456+07:00')
  })

  it.each([
    ['not base64 at all', '!!!!'],
    ['no separator', Buffer.from('justatimestamp', 'utf8').toString('base64url')],
    ['empty id', Buffer.from(`${CREATED}|`, 'utf8').toString('base64url')],
    ['empty timestamp', Buffer.from(`|${ID}`, 'utf8').toString('base64url')],
  ])('refuses a malformed cursor (%s) rather than restarting at page one', (_name, cursor) => {
    expect(decodeCursor(cursor)).toBeNull()
  })

  it.each([
    ['comma', `2026-08-20T12:00:00Z,id.eq.x|${ID}`],
    ['quote', `2026-08-20T12:00:00Z"|${ID}`],
    ['parenthesis', `2026-08-20T12:00:00Z)|${ID}`],
  ])(
    'refuses a timestamp carrying PostgREST filter syntax (%s)',
    (_name, raw) => {
      // Both halves are interpolated into an `or=` filter. These characters are
      // structural there, so they never reach the query.
      expect(decodeCursor(Buffer.from(raw, 'utf8').toString('base64url'))).toBeNull()
    }
  )

  it('refuses a filter-syntax comma that `new Date` accepts as an RFC-2822 date', () => {
    // The case the earlier assertions could not reach, found by mutation M18:
    // for `2026-08-20T12:00:00Z,id.eq.x` the date parse ALREADY fails, so those
    // tests passed with the allowlist deleted. This value parses cleanly and
    // still carries a comma — only the allowlist stops it, so only this pins it.
    const rfc2822 = 'Mon, 20 Aug 2026 12:00:00 GMT'
    expect(Number.isNaN(new Date(rfc2822).getTime())).toBe(false)
    expect(decodeCursor(Buffer.from(`${rfc2822}|${ID}`, 'utf8').toString('base64url'))).toBeNull()
  })

  it('refuses an id that is not a UUID', () => {
    const raw = `${CREATED}|not-a-uuid,or(id.eq.x)`
    expect(decodeCursor(Buffer.from(raw, 'utf8').toString('base64url'))).toBeNull()
  })

  it('refuses a well-formed but nonsensical timestamp', () => {
    const raw = `99999-99-99T99:99:99Z|${ID}`
    expect(decodeCursor(Buffer.from(raw, 'utf8').toString('base64url'))).toBeNull()
  })
})
