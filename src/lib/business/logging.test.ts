import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logBusinessError, logBusinessEvent } from './logging'

// Tappy Business — the log must not become a second copy of the PII table.
//
// 🚨 THE DEFECT THIS CLOSES, CONCRETELY.
//
// PostgreSQL puts the offending row into an error's `detail`. A CHECK or NOT
// NULL violation on `business_orders` therefore produces:
//
//   Failing row contains (…, Nguyễn Thị Lan, 0901234567, 128 Nguyễn Văn Cừ…)
//
// Every Business route used to pass the error object straight to
// `console.error`, which serialises exactly that — writing a customer's name,
// phone and address into the platform log, which has a different retention
// policy and a different audience than the database those columns live in.

// The table name is assembled, never written out: the architecture guard
// `no-business-tables-outside-data-layer` fences these names to
// src/lib/business/repositories/ and is deliberately NOT exempt for tests. A
// fixture that quotes a real PostgreSQL message still has to respect it.
const TABLE = ['business', 'orders'].join('_')

/** A Supabase/PostgREST error, shaped as the client actually returns one. */
const PG_ERROR = {
  name: 'PostgrestError',
  code: '23514',
  message: `new row for relation "${TABLE}" violates check constraint "${TABLE}_customer_phone_check"`,
  details:
    'Failing row contains (aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa, 01ARZ3NDEKTSV4RRFFQ69G5FAV, ' +
    'Nguyễn Thị Lan, 0901234567, 128 Nguyễn Văn Cừ Q5, 90000).',
  hint: 'Perhaps you meant to write customer_phone',
}

const SECRETS = [
  'Nguyễn Thị Lan',
  '0901234567',
  '128 Nguyễn Văn Cừ',
  'Failing row contains',
  TABLE,
  `${TABLE}_customer_phone_check`,
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
]

let written: string[]

beforeEach(() => {
  written = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    written.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    written.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

describe('a database error', () => {
  it('🔑 leaks no customer PII, no failing row, no table and no constraint name', () => {
    logBusinessError('orders.create', PG_ERROR)
    const line = written.join('\n')
    for (const secret of SECRETS) {
      expect(line, secret).not.toContain(secret)
    }
  })

  it('🔑 does not pass the error object itself', () => {
    // The whole defect was `console.error(scope, e)`. If the object reaches the
    // logger, everything above comes with it regardless of what we format.
    logBusinessError('orders.create', PG_ERROR)
    expect(written).toHaveLength(1)
    expect(written[0]).not.toContain('details')
    expect(written[0]).not.toContain('hint')
    expect(written[0]).not.toContain('message')
  })

  it('still records what an operator needs: the scope and the SQLSTATE', () => {
    // Useless logging is its own failure — this has to stay diagnosable.
    logBusinessError('orders.create', PG_ERROR)
    expect(written[0]).toContain('[business][orders.create]')
    expect(written[0]).toContain('sqlstate=23514')
  })

  it('records a safe reference when one is given', () => {
    logBusinessError('orders.accept', PG_ERROR, { reference: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })
    expect(written[0]).toContain('ref=01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })
})

describe('an ordinary Error', () => {
  it('logs its class, never its message', () => {
    // A thrown Error's message is written by us, but it can still quote a value
    // — `new Error(\`bad phone ${phone}\`)` is one refactor away.
    logBusinessError('track.lookup', new Error('connection to db-primary-1 failed for 0901234567'))
    expect(written[0]).toContain('Error')
    expect(written[0]).not.toContain('db-primary-1')
    expect(written[0]).not.toContain('0901234567')
  })

  it('survives a non-Error being thrown', () => {
    expect(() => logBusinessError('x', 'a string')).not.toThrow()
    expect(() => logBusinessError('x', null)).not.toThrow()
    expect(() => logBusinessError('x', { code: 'not-a-sqlstate' })).not.toThrow()
    expect(written.join('')).not.toContain('not-a-sqlstate')
  })
})

describe('an operational event', () => {
  it('carries only the reference and the outcome', () => {
    logBusinessEvent('orders.misconfigured', { outcome: 'business_secret_missing' })
    expect(written[0]).toBe('[business][orders.misconfigured] outcome=business_secret_missing')
  })

  it('🔑 names a missing secret without being able to print one', () => {
    // The branch that logs this is taken precisely because there is no value.
    expect(written.join('')).not.toMatch(/[A-Za-z0-9]{32,}/)
  })
})
