import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveConsumers,
  consumerIdsForPublish,
  readyConsumerIds,
  undispatchableConsumerIds,
  envelopeOf,
  settleOutcome,
  MAX_ATTEMPTS,
  type ClaimedRow,
  type ConsumerDispatch,
} from '../outbox'
import type { ModuleManifest, RegisteredModule } from '../types'

// Controller V2 — Component 8 (Event Bus).
//
// ⚠️ WHAT THIS FILE CAN AND CANNOT PROVE — read before trusting a green run.
//
// C8's load-bearing guarantees are enforced by PostgreSQL: the UNIQUE
// constraint, FOR UPDATE SKIP LOCKED, the terminal-state predicate, the
// transaction boundary, and the grants that close the lost-event window. NONE
// OF THEM IS EXECUTED BY THIS FILE.
//
// They ARE executed by supabase/tests/c8_event_outbox.test.ts, which applies
// this migration to a real PostgreSQL 17 (embedded-postgres — no Docker, no
// psql, no DATABASE_URL) and exercises the locking, the attempts increment, the
// DLQ boundary, the terminal states and the grants. That suite is the behaviour
// proof; this one is the text proof, and they fail for different reasons — the
// migration text can drift without the behaviour changing, and vice versa.
//
// So this file is split, explicitly:
//
//   describe('C8 — kernel logic')   REAL behavioural tests. The functions under
//                                   test are pure and are actually executed.
//
//   describe('C8 — migration')      STRUCTURAL assertions against the migration
//                                   TEXT. They prove the SQL *says* the right
//                                   thing. They do NOT prove the database
//                                   *does* it — supabase/tests/
//                                   c8_event_outbox.test.ts does that, and
//                                   whether PRODUCTION carries the objects is a
//                                   read-only check after the Owner applies it.
//
// Labelling the second group as if it were the first is how a suite reports
// coverage it does not have.

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260813_c8_event_outbox.sql'),
  'utf8'
)

function moduleWith(id: string, consumes: string[] | undefined): RegisteredModule {
  const manifest = {
    id,
    name: id,
    version: '1.0.0',
    hub: 'tappy.hub.dashboard',
    permissions: [],
    dependencies: [],
    capabilities: [],
    navigation: { path: `/admin/${id}`, labelKey: 'x', icon: 'X', order: 0 },
    lifecycle: {},
    status: 'enabled',
    ...(consumes ? { events: { consumes } } : {}),
  } as unknown as ModuleManifest

  return { manifest, status: 'enabled', available: true }
}

describe('C8 — kernel logic: consumer resolution', () => {
  const alpha = moduleWith('mod.alpha', ['commerce.order.refunded'])
  const beta = moduleWith('mod.beta', ['commerce.order.refunded', 'other.thing.happened'])
  const silent = moduleWith('mod.silent', undefined)
  const allReady = () => true

  it('binds only modules that declare the event type', () => {
    const bound = resolveConsumers([alpha, beta, silent], 'commerce.order.refunded', allReady)
    expect(bound.map((b) => b.consumerId)).toEqual(['mod.alpha', 'mod.beta'])
  })

  it('a module with no events block is never bound', () => {
    const bound = resolveConsumers([silent], 'commerce.order.refunded', allReady)
    expect(bound).toEqual([])
  })

  it('an unknown event type binds nobody — zero consumers, not an error', () => {
    // Contract §8: 0 consumers ⇒ 0 outbox rows, and publish still succeeds.
    const bound = resolveConsumers([alpha, beta], 'nobody.listens.here', allReady)
    expect(bound).toEqual([])
    expect(consumerIdsForPublish(bound)).toEqual([])
  })

  it('is sorted by consumer id, so registration order cannot change the row set', () => {
    const forward = resolveConsumers([alpha, beta], 'commerce.order.refunded', allReady)
    const reversed = resolveConsumers([beta, alpha], 'commerce.order.refunded', allReady)
    expect(reversed).toEqual(forward)
  })

  it('reports readiness per consumer without filtering anything out', () => {
    const bound = resolveConsumers([alpha, beta], 'commerce.order.refunded', (id) => id === 'mod.alpha')
    expect(bound).toEqual([
      { consumerId: 'mod.alpha', ready: true },
      { consumerId: 'mod.beta', ready: false },
    ])
  })
})

describe('C8 — kernel logic: D2, a disabled consumer', () => {
  const alpha = moduleWith('mod.alpha', ['e.t.happened'])
  const beta = moduleWith('mod.beta', ['e.t.happened'])
  const dispatch: ConsumerDispatch = new Map([
    ['mod.alpha', async () => {}],
    ['mod.beta', async () => {}],
  ])

  it('STILL RECEIVES AN OUTBOX ROW at publish time', () => {
    // The heart of D2. Skipping a disabled consumer here would lose the event
    // for a module that is merely switched off.
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', (id) => id === 'mod.alpha')
    expect(consumerIdsForPublish(bound)).toEqual(['mod.alpha', 'mod.beta'])
  })

  it('is EXCLUDED from the claim, so its row is never touched', () => {
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', (id) => id === 'mod.alpha')
    expect(readyConsumerIds(bound)).toEqual(['mod.alpha'])
  })

  it('becomes claimable again once ready, with no republish', () => {
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', () => true)
    expect(readyConsumerIds(bound)).toEqual(['mod.alpha', 'mod.beta'])
  })

  it('when nothing is ready the claim list is empty, matching no rows', () => {
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', () => false)
    expect(readyConsumerIds(bound)).toEqual([])
  })

  it('readiness is C6 verbatim — the dispatch map cannot change it', () => {
    // Owner decision 2026-08-13: C6 defines ready = enabled && available, and
    // C8 must not widen it. A missing handler is a C8 implementation gap, not a
    // C6 lifecycle state, so it must not silently move a consumer out of the
    // ready set — that would hide §9c's refusal inside D2's pending semantics.
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', () => true)
    const partial: ConsumerDispatch = new Map([['mod.alpha', async () => {}]])
    expect(readyConsumerIds(bound)).toEqual(['mod.alpha', 'mod.beta'])
    expect(undispatchableConsumerIds(bound, partial)).toEqual(['mod.beta'])
  })
})

// The detector reports the state; §9c (ratified 2026-08-13) decides what
// happens to it, and that decision lives in the route. These tests pin the
// split: nothing here may start behaving like a policy.
describe('C8 — the missing-handler state is DETECTED here, decided in the route', () => {
  const alpha = moduleWith('mod.alpha', ['e.t.happened'])
  const beta = moduleWith('mod.beta', ['e.t.happened'])

  it('reports a ready, bound consumer that has no handler', () => {
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', () => true)
    expect(undispatchableConsumerIds(bound, new Map())).toEqual(['mod.alpha', 'mod.beta'])
  })

  it('does not report a NOT-ready consumer — D2 already owns that row', () => {
    // Only a ready consumer can trigger §9c's refusal. A disabled one has its
    // own defined behaviour (stays pending) and must not be conflated with it,
    // or a routine disable would halt the whole drain.
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', (id) => id === 'mod.alpha')
    expect(undispatchableConsumerIds(bound, new Map())).toEqual(['mod.alpha'])
  })

  it('is empty when every ready consumer has a handler', () => {
    const bound = resolveConsumers([alpha, beta], 'e.t.happened', () => true)
    const full: ConsumerDispatch = new Map([
      ['mod.alpha', async () => {}],
      ['mod.beta', async () => {}],
    ])
    expect(undispatchableConsumerIds(bound, full)).toEqual([])
  })

  it('is unreachable in production — no manifest declares events.consumes', async () => {
    // The guard in the drain route is dead code today. This pins the fact that
    // makes it dead, so the day a manifest declares a consumer, this test fails
    // and a handler must be registered with it — otherwise §9c refuses every
    // tick in production, which is safe but stops all delivery.
    const { ADMIN_MODULES } = await import('../registry/adminModules')
    const declaring = ADMIN_MODULES.filter((m) => (m.events?.consumes?.length ?? 0) > 0)
    expect(declaring.map((m) => m.id)).toEqual([])
  })
})

describe('C8 — kernel logic: retry and DLQ (P1)', () => {
  it('a successful attempt is delivered, whatever the attempt count', () => {
    for (const n of [1, 2, 3, 9]) expect(settleOutcome(true, n)).toBe('delivered')
  })

  it('attempt 1 failure stays pending', () => {
    expect(settleOutcome(false, 1)).toBe('pending')
  })

  it('attempt 2 failure stays pending', () => {
    expect(settleOutcome(false, 2)).toBe('pending')
  })

  it('attempt 3 failure is dead — the DLQ boundary is >=, not >', () => {
    // The claim increments before delivery, so the third attempt arrives with
    // attempts === 3. A `>` here would grant a silent fourth attempt.
    expect(settleOutcome(false, 3)).toBe('dead')
    expect(MAX_ATTEMPTS).toBe(3)
  })

  it('never retries past the maximum', () => {
    for (const n of [3, 4, 10]) expect(settleOutcome(false, n)).toBe('dead')
  })
})

describe('C8 — kernel logic: envelope reconstruction', () => {
  const row: ClaimedRow = {
    id: 'row-1',
    event_id: 'e-1',
    type: 'commerce.order.refunded',
    event_version: '1.0.0',
    producer: 'tappy.hub.commerce.orders',
    actor: 'user-9',
    correlation_id: 'corr-1',
    security_class: 'internal',
    payload: { orderId: 123 },
    metadata: { source: 'test' },
    occurred_at: '2026-08-13T03:00:00.000Z',
    consumer_id: 'mod.alpha',
    attempts: 1,
  }

  it('rebuilds the frozen envelope shape', () => {
    expect(envelopeOf(row)).toEqual({
      id: 'e-1',
      type: 'commerce.order.refunded',
      version: '1.0.0',
      producer: 'tappy.hub.commerce.orders',
      actor: 'user-9',
      timestamp: Date.parse('2026-08-13T03:00:00.000Z'),
      correlationId: 'corr-1',
      securityClass: 'internal',
      payload: { orderId: 123 },
      metadata: { source: 'test' },
    })
  })

  it('leaks no delivery bookkeeping into the envelope', () => {
    // A consumer must not see attempts/consumer_id/status. FOUNDATION_01 §6
    // froze the envelope fields; storage layout is not part of that contract.
    const keys = Object.keys(envelopeOf(row))
    for (const leaked of ['attempts', 'consumer_id', 'status', 'next_attempt_at', 'last_error']) {
      expect(keys).not.toContain(leaked)
    }
  })

  it('omits absent optional fields rather than emitting undefined', () => {
    const bare = envelopeOf({ ...row, payload: null, metadata: null, correlation_id: null })
    expect(Object.keys(bare)).not.toContain('payload')
    expect(Object.keys(bare)).not.toContain('metadata')
    expect(bare.correlationId).toBe('')
  })
})

describe('C8 — migration: STRUCTURAL assertions (not runtime proof)', () => {
  const stripped = SQL.replace(/--[^\n]*/g, ' ')

  // Slice each function's OWN body. Slicing to end-of-file was a live defect:
  // `fn_outbox_settle` also contains `status = 'pending'`, so deleting that
  // predicate from the claim left the assertion passing against settle's copy
  // and mutation M8a survived. A duplicated phrase makes `toContain` useless.
  const bodyOf = (name: string) => {
    const start = stripped.indexOf(`FUNCTION ${name}`)
    expect(start, `${name} not found in migration`).toBeGreaterThan(-1)
    const next = stripped.indexOf('CREATE OR REPLACE FUNCTION', start + 1)
    return stripped.slice(start, next === -1 ? undefined : next)
  }

  it('the scan is not vacuous — it reads the real migration', () => {
    expect(SQL.length).toBeGreaterThan(2000)
    expect(stripped).toContain('CREATE TABLE IF NOT EXISTS event_outbox')
  })

  it('declares UNIQUE (event_id, consumer_id) — the republish idempotency key', () => {
    expect(stripped).toMatch(/UNIQUE\s*\(\s*event_id\s*,\s*consumer_id\s*\)/i)
  })

  it('the publish insert is ON CONFLICT DO NOTHING on that key', () => {
    expect(stripped).toMatch(/ON\s+CONFLICT\s*\(\s*event_id\s*,\s*consumer_id\s*\)\s*DO\s+NOTHING/i)
  })

  it('claims with FOR UPDATE SKIP LOCKED', () => {
    expect(stripped).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i)
  })

  it('the claim selects only pending, due rows for ready consumers', () => {
    const claim = bodyOf('fn_outbox_claim')
    // Terminal rows must be unreachable: this predicate is the only thing that
    // stops a delivered or dead row from being claimed again.
    expect(claim).toMatch(/WHERE\s+o\.status\s*=\s*'pending'/i)
    expect(claim).toMatch(/next_attempt_at\s*<=\s*now\(\)/i)
    expect(claim).toMatch(/consumer_id\s*=\s*ANY\(/i)
  })

  it('the claim increments attempts — so a crash mid-delivery still counts', () => {
    expect(bodyOf('fn_outbox_claim')).toMatch(/SET\s+attempts\s*=\s*o\.attempts\s*\+\s*1/i)
  })

  it('settle uses the >= 3 DLQ boundary and only touches pending rows', () => {
    const settle = bodyOf('fn_outbox_settle')
    expect(settle).toMatch(/attempts\s*>=\s*3\s+THEN\s+'dead'/i)
    // Without this predicate a late settle could resurrect a dead row.
    expect(settle).toMatch(/AND\s+o\.status\s*=\s*'pending'/i)
  })

  it('P4: fn_outbox_publish is revoked from EVERY PostgREST role including service_role', () => {
    // This is the whole enforcement. service_role is the role the app tier's
    // admin client authenticates as; leaving it would keep the lost-event
    // window open while the file looked hardened.
    const revoke = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+fn_outbox_publish\b[\s\S]*?;/i.exec(stripped)
    expect(revoke, 'no REVOKE for fn_outbox_publish').not.toBeNull()
    const from = revoke![0].slice(revoke![0].search(/\bFROM\b/i)).toLowerCase()
    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      expect(from, `fn_outbox_publish still executable by ${role}`).toMatch(new RegExp(`\\b${role}\\b`))
    }
  })

  it('P4: fn_outbox_publish is granted to nobody', () => {
    expect(stripped).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+fn_outbox_publish/i)
  })

  it('the drain functions ARE granted to service_role — they cannot publish', () => {
    for (const fn of ['fn_outbox_claim', 'fn_outbox_settle']) {
      expect(stripped).toMatch(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fn}[\\s\\S]*?TO\\s+service_role`, 'i'))
    }
    const claim = stripped.slice(
      stripped.indexOf('FUNCTION fn_outbox_claim'),
      stripped.indexOf('FUNCTION fn_outbox_settle')
    )
    expect(claim).not.toMatch(/INSERT\s+INTO\s+event_outbox/i)
  })

  it('table writes are closed to every PostgREST role; service_role keeps SELECT only', () => {
    expect(stripped).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+event_outbox\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    expect(stripped).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+event_outbox\s+FROM\s+service_role/i)
    expect(stripped).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+event_outbox\s+TO\s+service_role/i)
    expect(stripped).not.toMatch(/GRANT\s+(ALL|INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+event_outbox/i)
  })

  it('every SECURITY DEFINER function pins search_path', () => {
    const defs = stripped.match(/SECURITY\s+DEFINER/gi) ?? []
    const paths = stripped.match(/SET\s+search_path\s*=\s*public,\s*pg_temp/gi) ?? []
    expect(defs.length).toBe(3)
    expect(paths.length).toBe(defs.length)
  })

  it('creates no producer, no consumer and no seed data', () => {
    // C8 ships the mechanism only. An INSERT here would be a fabricated event.
    expect(stripped).not.toMatch(/INSERT\s+INTO\s+event_outbox\s*\(\s*id/i)
    const inserts = stripped.match(/INSERT\s+INTO/gi) ?? []
    expect(inserts.length).toBe(1) // exactly one: the one inside fn_outbox_publish
  })
})

describe('C8 — drain route wiring: STRUCTURAL (not an executed request)', () => {
  const ROUTE = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'cron', 'outbox-drain', 'route.ts'),
    'utf8'
  )

  it('the scan is not vacuous', () => {
    expect(ROUTE.length).toBeGreaterThan(1000)
  })

  it('authenticates with CRON_SECRET exactly like the existing seven crons', () => {
    expect(ROUTE).toContain('process.env.CRON_SECRET')
    expect(ROUTE).toMatch(/authorization'\)\s*!==\s*`Bearer \$\{secret\}`/)
    expect(ROUTE).toMatch(/status:\s*401/)
  })

  it('refuses the tick when a ready consumer has no handler (§9c)', () => {
    // Assert the CONDITION, not just the presence of the branch. Checking only
    // that the 501 body exists let a mutation replace the test with
    // `if (false)` — the guard was gone and the assertion still passed.
    expect(ROUTE, 'guard condition is not driven by the detector').toMatch(
      /if\s*\(\s*undispatchable\.size\s*>\s*0\s*\)/
    )
    expect(ROUTE).toContain('C8_UNDEFINED_MISSING_HANDLER')
    expect(ROUTE).toMatch(/status:\s*501/)
    expect(ROUTE).toContain('undispatchableConsumerIds')
  })

  it('the guard runs BEFORE the claim, so no attempt is ever burned by it', () => {
    const guardAt = ROUTE.search(/if\s*\(\s*undispatchable\.size\s*>\s*0\s*\)/)
    const claimAt = ROUTE.indexOf('fn_outbox_claim')
    expect(guardAt).toBeGreaterThan(-1)
    expect(claimAt).toBeGreaterThan(-1)
    expect(guardAt, 'guard must precede the claim').toBeLessThan(claimAt)
  })

  it('claims with C6 readiness, not with a C8-widened notion of ready', () => {
    expect(ROUTE).toContain('readyConsumerIds')
    expect(ROUTE).not.toContain('eligibleConsumerIds')
  })

  it('registers no consumers — the dispatch map is empty', () => {
    expect(ROUTE).toMatch(/const DISPATCH: ConsumerDispatch = new Map\(\)/)
  })
})

describe('C8 — the drain is wired as a daily cron', () => {
  const vercelJson = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: { path: string; schedule: string }[]
  }

  it('registers /api/cron/outbox-drain', () => {
    const entry = vercelJson.crons.find((c) => c.path === '/api/cron/outbox-drain')
    expect(entry, 'outbox-drain cron missing from vercel.json').toBeDefined()
    expect(entry!.schedule).toBe('0 3 * * *')
  })

  it('every cron is daily-or-less-frequent, as Hobby requires', () => {
    // A finer expression fails at deployment: "Hobby accounts are limited to
    // daily cron jobs." Catching it here beats catching it in a failed deploy.
    for (const c of vercelJson.crons) {
      const [minute, hour] = c.schedule.split(' ')
      expect(minute, `${c.path} minute field must be fixed`).toMatch(/^\d+$/)
      expect(hour, `${c.path} hour field must be fixed`).toMatch(/^\d+$/)
    }
  })

  it('stays within the verified Hobby limit of 100 cron jobs per project', () => {
    expect(vercelJson.crons.length).toBeLessThanOrEqual(100)
    expect(vercelJson.crons.length).toBe(8)
  })
})
