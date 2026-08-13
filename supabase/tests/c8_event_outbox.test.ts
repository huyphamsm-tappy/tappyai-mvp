import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Controller V2 — Component 8 (Event Bus): the migration, EXECUTED.
//
// Contract: docs/controller-v2/08_COMPONENT8_EVENT_BUS_CONTRACT.md
// Requirement: ROADMAP.md — "Any .sql file must be executed against a real
// PostgreSQL before it is called verified", carried forward from the Foundation.
//
// C8 shipped with structural assertions only (src/lib/controller/__tests__/
// outbox.test.ts), on the stated belief that no local PostgreSQL existed. That
// belief was false — this file is the correction. Everything C8 delegates to the
// database is exercised here against a real PostgreSQL 17: the UNIQUE
// constraint, FOR UPDATE SKIP LOCKED, claim-time attempts, the DLQ boundary,
// terminal states, D2, and the grants that close the lost-event window.
//
// The structural suite is NOT replaced. It still guards the migration text; this
// guards its behaviour, and they fail for different reasons.
//
// SCOPE, LOCKED — the FUNCTION-PRIVILEGE and TABLE-PRIVILEGE layers.
// Row visibility is deliberately not asserted: production's `service_role`
// carries BYPASSRLS, a platform attribute this harness does not model, so a
// row-count assertion here would describe the harness rather than production.
// RLS is asserted as configuration (enabled, zero policies), which is what the
// migration actually controls.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260813_c8_event_outbox.sql'),
  'utf8'
)

// Reproduces the Supabase platform facts the migration defends against. Without
// the ALTER DEFAULT PRIVILEGES lines every REVOKE assertion below would be
// vacuously true — the ACL would be empty because nothing ever granted anything,
// not because C8 took it away (ADR-019).
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;

  -- Control objects: created under the same default privileges as event_outbox,
  -- and never revoked. Their ACLs are the proof that the defaults were in force
  -- at CREATE time, which is what makes event_outbox's empty ACL meaningful.
  CREATE TABLE harness_control (id INT PRIMARY KEY);
  CREATE FUNCTION harness_control_fn() RETURNS INT LANGUAGE sql IMMUTABLE AS $ctl$ SELECT 1 $ctl$;
`

const PORT = 54350
const ROLES = ['anon', 'authenticated', 'service_role'] as const

let pg: EmbeddedPostgres
let db: Client
let db2: Client
let dataDir: string

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const EVENT_A = uuid(1)
const EVENT_B = uuid(2)

/** Publish through the P4 primitive, as a producer's SECURITY DEFINER function would. */
async function publish(
  eventId: string,
  consumers: string[] | null,
  opts: { type?: string; occurredAt?: string; payload?: unknown; metadata?: unknown; actor?: unknown; correlationId?: string } = {}
): Promise<number> {
  const r = await db.query(
    `SELECT fn_outbox_publish($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7::text[],
                              $8::jsonb, $9, $10::jsonb, $11::jsonb) AS n`,
    [
      eventId,
      opts.type ?? 'commerce.order.refunded',
      '1.0.0',
      'tappy.hub.commerce.orders',
      'internal',
      opts.occurredAt ?? '2026-08-13T03:00:00Z',
      consumers,
      opts.actor === undefined ? null : JSON.stringify(opts.actor),
      opts.correlationId ?? null,
      opts.payload === undefined ? null : JSON.stringify(opts.payload),
      opts.metadata === undefined ? null : JSON.stringify(opts.metadata),
    ]
  )
  return Number(r.rows[0].n)
}

async function claim(consumers: string[], limit = 100, client: Client = db) {
  const r = await client.query(`SELECT * FROM fn_outbox_claim($1::text[], $2)`, [consumers, limit])
  return r.rows as { id: string; consumer_id: string; attempts: number; event_id: string; type: string; payload: unknown; metadata: unknown; actor: unknown; correlation_id: string | null; occurred_at: Date }[]
}

async function settle(id: string, ok: boolean, error: string | null = null): Promise<string | null> {
  const r = await db.query(`SELECT fn_outbox_settle($1::uuid, $2, $3) AS status`, [id, ok, error])
  return r.rows[0].status as string | null
}

async function rows(): Promise<{ consumer_id: string; status: string; attempts: number; last_error: string | null; delivered_at: Date | null }[]> {
  const r = await db.query(
    `SELECT consumer_id, status, attempts, last_error, delivered_at
       FROM event_outbox ORDER BY consumer_id, created_at`
  )
  return r.rows
}

/** Attempt an execution AS a role. Returns the SQLSTATE, or null when it succeeded. */
async function tryAsRole(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query(`SET ROLE ${role}`)
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'UNKNOWN'
  } finally {
    await db.query('RESET ROLE')
  }
}

const aclOf = async (kind: 'function' | 'table', name: string): Promise<string> => {
  const q =
    kind === 'function'
      ? `SELECT COALESCE(array_to_string(p.proacl, ' '), '<null: built-in default>') AS acl
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`
      : `SELECT COALESCE(array_to_string(c.relacl, ' '), '<null: built-in default>') AS acl
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1`
  const r = await db.query(q, [name])
  return r.rows[0]?.acl ?? '<absent>'
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgc8-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('c8')
  db = pg.getPgClient('c8')
  await db.connect()
  db2 = pg.getPgClient('c8')
  await db2.connect()
}, 240_000)

afterAll(async () => {
  try { await db2?.end() } catch { /* already closed */ }
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
})

const applyMigration = () => db.query(MIGRATION)

describe('C8 runtime — harness fidelity', () => {
  it('reproduces Supabase default privileges, so every REVOKE below is non-vacuous', async () => {
    // Guards the guard. If this fails, the grant assertions in this file prove
    // nothing: an empty ACL would mean "never granted", not "revoked".
    expect(await aclOf('function', 'harness_control_fn')).toContain('anon=X')
    expect(await aclOf('table', 'harness_control')).toMatch(/anon=arwdDxt/)
    expect(await aclOf('table', 'harness_control')).toMatch(/service_role=arwdDxt/)
  })
})

describe('C8 runtime — the migration applies', () => {
  beforeEach(applyMigration)

  it('creates the table and all three functions', async () => {
    const t = await db.query(`SELECT to_regclass('public.event_outbox') AS t`)
    expect(t.rows[0].t).toBe('event_outbox')

    const f = await db.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND proname LIKE 'fn_outbox%' ORDER BY proname`
    )
    expect(f.rows.map((r) => r.proname)).toEqual([
      'fn_outbox_claim', 'fn_outbox_publish', 'fn_outbox_settle',
    ])
  })

  it('is idempotent — applying it twice is not an error and changes nothing', async () => {
    await publish(EVENT_A, ['mod.alpha'])
    await applyMigration()
    expect(await rows()).toHaveLength(1)
    const t = await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname='event_outbox_event_consumer_key'`)
    expect(t.rows[0].n).toBe(1)
  })

  it('enables RLS with no policies — defence in depth behind the grants', async () => {
    const r = await db.query(
      `SELECT c.relrowsecurity AS on, (SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid) AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='event_outbox'`
    )
    expect(r.rows[0].on).toBe(true)
    expect(r.rows[0].policies).toBe(0)
  })

  it('every C8 function is SECURITY DEFINER with a pinned search_path', async () => {
    const r = await db.query(
      `SELECT proname, prosecdef, proconfig::text FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND proname LIKE 'fn_outbox%' ORDER BY proname`
    )
    expect(r.rows).toHaveLength(3)
    for (const row of r.rows) {
      expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true)
      expect(row.proconfig, `${row.proname} must pin search_path`).toContain('search_path=public, pg_temp')
    }
  })
})

describe('C8 runtime — schema constraints', () => {
  beforeEach(applyMigration)

  it('rejects a second obligation for the same (event_id, consumer_id)', async () => {
    await publish(EVENT_A, ['mod.alpha'])
    // Direct INSERT, bypassing ON CONFLICT: this is the CONSTRAINT under test,
    // not the publish function's conflict clause.
    let code: string | null = null
    try {
      await db.query(
        `INSERT INTO event_outbox (event_id, type, event_version, producer, security_class, occurred_at, consumer_id)
         VALUES ($1::uuid,'t','1.0.0','p','internal',now(),'mod.alpha')`,
        [EVENT_A]
      )
    } catch (e) {
      code = (e as { code?: string }).code ?? null
    }
    expect(code, 'UNIQUE (event_id, consumer_id) did not reject the duplicate').toBe('23505')
  })

  it('permits the same event for a DIFFERENT consumer — P3 is per (event, consumer)', async () => {
    expect(await publish(EVENT_A, ['mod.alpha', 'mod.beta'])).toBe(2)
  })

  it('rejects a status outside pending/delivered/dead', async () => {
    let code: string | null = null
    try {
      await db.query(
        `INSERT INTO event_outbox (event_id, type, event_version, producer, security_class, occurred_at, consumer_id, status)
         VALUES ($1::uuid,'t','1.0.0','p','internal',now(),'mod.alpha','sent')`,
        [EVENT_B]
      )
    } catch (e) { code = (e as { code?: string }).code ?? null }
    expect(code).toBe('23514')
  })

  it('rejects negative attempts', async () => {
    let code: string | null = null
    try {
      await db.query(
        `INSERT INTO event_outbox (event_id, type, event_version, producer, security_class, occurred_at, consumer_id, attempts)
         VALUES ($1::uuid,'t','1.0.0','p','internal',now(),'mod.alpha',-1)`,
        [EVENT_B]
      )
    } catch (e) { code = (e as { code?: string }).code ?? null }
    expect(code).toBe('23514')
  })

  it('defaults a new row to pending / 0 attempts / due now', async () => {
    await publish(EVENT_A, ['mod.alpha'])
    const r = await db.query(`SELECT status, attempts, next_attempt_at <= now() AS due, delivered_at, schema_version FROM event_outbox`)
    expect(r.rows[0]).toMatchObject({ status: 'pending', attempts: 0, due: true, delivered_at: null, schema_version: 1 })
  })

  it('carries the claim index as a PARTIAL index on pending rows', async () => {
    const r = await db.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='event_outbox'`)
    const claimIdx = r.rows.find((x) => x.indexname === 'event_outbox_claim_idx')
    expect(claimIdx, 'event_outbox_claim_idx missing').toBeDefined()
    expect(claimIdx.indexdef).toMatch(/WHERE \(status = 'pending'::text\)/)
    expect(r.rows.some((x) => x.indexname === 'event_outbox_dead_idx')).toBe(true)
  })
})

describe('C8 runtime — GRANTS: the P4 boundary, executed rather than read', () => {
  beforeEach(applyMigration)

  it('NO PostgREST role can execute fn_outbox_publish — the lost-event window is closed', async () => {
    // The whole enforcement of P4. service_role is the role the app tier
    // authenticates as; if this passes for it, a business write could commit
    // with no event and the file would still look hardened.
    for (const role of ROLES) {
      const code = await tryAsRole(
        role,
        `SELECT fn_outbox_publish($1::uuid,'t','1.0.0','p','internal',now(),ARRAY['mod.alpha']::text[])`,
        [EVENT_B]
      )
      expect(code, `${role} was able to call fn_outbox_publish`).toBe('42501')
    }
    expect(await rows(), 'a denied call must not have inserted anything').toHaveLength(0)
  })

  it('the ACL confirms it, and is not merely empty by accident', async () => {
    const acl = await aclOf('function', 'fn_outbox_publish')
    expect(acl).not.toBe('<null: built-in default>')  // NULL would mean EXECUTE to PUBLIC
    for (const role of ROLES) expect(acl).not.toContain(`${role}=X`)
    expect(acl, 'the owner must retain EXECUTE — a producer runs as it').toContain('postgres=X')
  })

  it('the owner CAN execute it — a producer SECURITY DEFINER function is the caller', async () => {
    expect(await publish(EVENT_A, ['mod.alpha'])).toBe(1)
  })

  it('service_role CAN drain: claim and settle are granted to it, and to nobody else', async () => {
    expect(await tryAsRole('service_role', `SELECT * FROM fn_outbox_claim(ARRAY['mod.alpha']::text[], 10)`)).toBeNull()
    expect(await tryAsRole('service_role', `SELECT fn_outbox_settle($1::uuid, true, null)`, [uuid(9)])).toBeNull()
    for (const role of ['anon', 'authenticated']) {
      expect(await tryAsRole(role, `SELECT * FROM fn_outbox_claim(ARRAY['mod.alpha']::text[], 10)`), `${role} reached the claim`).toBe('42501')
      expect(await tryAsRole(role, `SELECT fn_outbox_settle($1::uuid, true, null)`, [uuid(9)]), `${role} reached settle`).toBe('42501')
    }
  })

  it('table writes are closed to every PostgREST role; service_role keeps SELECT only', async () => {
    const priv = async (role: string, p: string) => {
      const r = await db.query(`SELECT has_table_privilege($1, 'public.event_outbox', $2) AS ok`, [role, p])
      return r.rows[0].ok as boolean
    }
    expect(await priv('service_role', 'SELECT')).toBe(true)
    for (const p of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(await priv('service_role', p), `service_role could ${p} directly and forge a delivery`).toBe(false)
    }
    for (const role of ['anon', 'authenticated']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(await priv(role, p), `${role} retained ${p}`).toBe(false)
      }
    }
  })
})

describe('C8 runtime — publish semantics', () => {
  beforeEach(applyMigration)

  it('creates one row per consumer (P3)', async () => {
    expect(await publish(EVENT_A, ['mod.beta', 'mod.alpha'])).toBe(2)
    expect((await rows()).map((r) => r.consumer_id)).toEqual(['mod.alpha', 'mod.beta'])
  })

  it('zero consumers: publish SUCCEEDS and writes nothing (§8)', async () => {
    expect(await publish(EVENT_A, [])).toBe(0)
    expect(await rows()).toHaveLength(0)
  })

  it('a NULL consumer list is the same as none — not an error', async () => {
    expect(await publish(EVENT_A, null)).toBe(0)
    expect(await rows()).toHaveLength(0)
  })

  it('republishing the same event is idempotent, not fatal', async () => {
    expect(await publish(EVENT_A, ['mod.alpha', 'mod.beta'])).toBe(2)
    expect(await publish(EVENT_A, ['mod.alpha', 'mod.beta'])).toBe(0)
    expect(await rows()).toHaveLength(2)
  })

  it('a retried producer transaction adds only the consumer that was missing', async () => {
    await publish(EVENT_A, ['mod.alpha'])
    expect(await publish(EVENT_A, ['mod.alpha', 'mod.beta'])).toBe(1)
    expect(await rows()).toHaveLength(2)
  })

  it('stores the frozen envelope fields verbatim', async () => {
    await publish(EVENT_A, ['mod.alpha'], {
      payload: { orderId: 123 },
      metadata: { source: 'test' },
      actor: { userId: 'u-9' },
      correlationId: 'corr-1',
      occurredAt: '2026-08-13T03:00:00Z',
    })
    const r = await db.query(`SELECT event_id, type, event_version, producer, security_class, payload, metadata, actor, correlation_id, occurred_at FROM event_outbox`)
    expect(r.rows[0]).toMatchObject({
      event_id: EVENT_A,
      type: 'commerce.order.refunded',
      event_version: '1.0.0',
      producer: 'tappy.hub.commerce.orders',
      security_class: 'internal',
      payload: { orderId: 123 },
      metadata: { source: 'test' },
      actor: { userId: 'u-9' },
      correlation_id: 'corr-1',
    })
  })

  it('rolls the producer back with it — the insert is not independently committed', async () => {
    // P4 in one assertion: inside a transaction that aborts, the outbox insert
    // dies with it. This is what makes "same transaction" more than a comment.
    await db.query('BEGIN')
    await publish(EVENT_A, ['mod.alpha'])
    await db.query('ROLLBACK')
    expect(await rows()).toHaveLength(0)
  })
})

describe('C8 runtime — claim semantics', () => {
  beforeEach(async () => {
    await applyMigration()
    await publish(EVENT_A, ['mod.alpha', 'mod.beta'])
  })

  it('increments attempts AT CLAIM TIME — one claim is one attempt', async () => {
    const claimed = await claim(['mod.alpha'])
    expect(claimed).toHaveLength(1)
    expect(claimed[0].attempts, 'the returned row must already carry the increment').toBe(1)

    // And it is durable: nothing settles it, exactly as a crashed drain would
    // leave it. Under settle-time increment this would still read 0 and the row
    // would retry forever.
    const persisted = (await rows()).find((r) => r.consumer_id === 'mod.alpha')!
    expect(persisted.attempts).toBe(1)
    expect(persisted.status).toBe('pending')
  })

  it('D2: a consumer absent from the ready list is never touched', async () => {
    await claim(['mod.alpha'])
    const beta = (await rows()).find((r) => r.consumer_id === 'mod.beta')!
    expect(beta).toMatchObject({ status: 'pending', attempts: 0, last_error: null, delivered_at: null })
  })

  it('an empty ready list claims nothing at all', async () => {
    expect(await claim([])).toHaveLength(0)
    expect((await rows()).every((r) => r.attempts === 0)).toBe(true)
  })

  it('skips rows that are not yet due', async () => {
    await db.query(`UPDATE event_outbox SET next_attempt_at = now() + interval '1 hour'`)
    expect(await claim(['mod.alpha', 'mod.beta'])).toHaveLength(0)
  })

  it('never re-claims a terminal row', async () => {
    const first = await claim(['mod.alpha'])
    await settle(first[0].id, true)
    await db.query(`UPDATE event_outbox SET status='dead' WHERE consumer_id='mod.beta'`)
    expect(await claim(['mod.alpha', 'mod.beta']), 'delivered or dead rows were claimed again').toHaveLength(0)
  })

  it('honours the batch limit and takes the oldest first', async () => {
    await db.query(`UPDATE event_outbox SET created_at = now() - interval '1 day' WHERE consumer_id='mod.beta'`)
    const claimed = await claim(['mod.alpha', 'mod.beta'], 1)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].consumer_id, 'oldest row must be claimed first').toBe('mod.beta')
  })

  it('a limit of zero claims nothing rather than everything', async () => {
    expect(await claim(['mod.alpha', 'mod.beta'], 0)).toHaveLength(0)
  })

  it('FOR UPDATE SKIP LOCKED: a concurrent drain skips the locked row instead of blocking', async () => {
    // The reason the claim must live in a Postgres function at all. Client A
    // holds its claim open; client B must return the OTHER row promptly. Without
    // SKIP LOCKED, B blocks on A's row and hits the timeout.
    // A second event, so mod.alpha owns two claimable rows. Renaming beta's row
    // to alpha would collide with UNIQUE (event_id, consumer_id) — the very
    // constraint this migration relies on.
    await publish(EVENT_B, ['mod.alpha'])

    await db.query('BEGIN')
    const mine = await claim(['mod.alpha'], 1)
    expect(mine).toHaveLength(1)

    await db2.query(`SET statement_timeout = '4s'`)
    let theirs: Awaited<ReturnType<typeof claim>> = []
    let blocked: string | null = null
    try {
      theirs = await claim(['mod.alpha'], 1, db2)
    } catch (e) {
      blocked = (e as { code?: string }).code ?? 'UNKNOWN'  // 57014 = statement_timeout
    } finally {
      await db2.query(`RESET statement_timeout`)
      await db.query('ROLLBACK')
    }

    expect(blocked, 'the second drain blocked on a locked row — SKIP LOCKED is not in force').toBeNull()
    expect(theirs).toHaveLength(1)
    expect(theirs[0].id, 'both drains claimed the same row').not.toBe(mine[0].id)
  })

  it('hands the consumer the envelope, with delivery bookkeeping alongside it', async () => {
    const claimed = await claim(['mod.alpha'])
    expect(Object.keys(claimed[0])).toEqual(
      expect.arrayContaining(['id', 'event_id', 'type', 'event_version', 'producer', 'actor', 'correlation_id', 'security_class', 'payload', 'metadata', 'occurred_at', 'consumer_id', 'attempts'])
    )
    expect(claimed[0].event_id).toBe(EVENT_A)
  })
})

describe('C8 runtime — settle, retry and the DLQ boundary (P1)', () => {
  beforeEach(async () => {
    await applyMigration()
    await publish(EVENT_A, ['mod.alpha'])
  })

  const cycle = async (ok: boolean, error: string | null = null) => {
    const [row] = await claim(['mod.alpha'])
    expect(row, 'expected a claimable row').toBeDefined()
    return settle(row.id, ok, error)
  }

  it('success is terminal and stamps delivered_at', async () => {
    expect(await cycle(true)).toBe('delivered')
    const r = (await rows())[0]
    expect(r.status).toBe('delivered')
    expect(r.delivered_at).not.toBeNull()
    expect(r.last_error).toBeNull()
  })

  it('a first failure stays pending, records the error, and becomes due again', async () => {
    expect(await cycle(false, 'consumer exploded')).toBe('pending')
    const r = (await rows())[0]
    expect(r).toMatchObject({ status: 'pending', attempts: 1, last_error: 'consumer exploded' })
    const due = await db.query(`SELECT next_attempt_at <= now() AS due FROM event_outbox`)
    expect(due.rows[0].due, 'the daily cron supplies the spacing; the row itself is due').toBe(true)
  })

  it('reaches the DLQ on the THIRD failure, not the fourth', async () => {
    expect(await cycle(false, 'boom 1')).toBe('pending')
    expect(await cycle(false, 'boom 2')).toBe('pending')
    expect(await cycle(false, 'boom 3')).toBe('dead')
    expect((await rows())[0]).toMatchObject({ status: 'dead', attempts: 3, last_error: 'boom 3' })
    expect(await claim(['mod.alpha']), 'a dead row must never be claimed again').toHaveLength(0)
  })

  it('a late settle cannot resurrect a dead row', async () => {
    await cycle(false, 'boom 1')
    await cycle(false, 'boom 2')
    const [row] = await claim(['mod.alpha'])
    await settle(row.id, false, 'boom 3')                      // now dead
    expect(await settle(row.id, true), 'settle touched a terminal row').toBeNull()
    expect((await rows())[0]).toMatchObject({ status: 'dead', attempts: 3 })
  })

  it('a late settle cannot un-deliver a delivered row either', async () => {
    const [row] = await claim(['mod.alpha'])
    await settle(row.id, true)
    expect(await settle(row.id, false, 'late failure')).toBeNull()
    expect((await rows())[0]).toMatchObject({ status: 'delivered', last_error: null })
  })

  it('settling an unknown id is a no-op, not an error', async () => {
    expect(await settle(uuid(99), true)).toBeNull()
  })

  it('a crash between claim and settle still consumes the attempt', async () => {
    // Three claims with no settle at all — the crashed-drain shape. P1 must
    // still bound it: the third claim is the last one the DLQ boundary allows.
    await claim(['mod.alpha'])
    await claim(['mod.alpha'])
    const third = await claim(['mod.alpha'])
    expect(third[0].attempts).toBe(3)
    const [row] = await claim(['mod.alpha'])
    expect(await settle(row.id, false, 'still failing')).toBe('dead')
  })
})
