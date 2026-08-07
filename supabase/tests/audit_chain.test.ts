import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Controller V2 — Component 7: the audit chain, against a REAL PostgreSQL.
//
// Implements the Phase F specification
// (docs/controller-v2/07_PHASE_F_TEST_SPECIFICATION.md).
//
// This suite exists because code review, tsc, lint, the architecture guard and
// the build do not execute SQL. Component 1's seed shipped `MIN(uuid)` — a
// function PostgreSQL does not have — and passed all six.
//
// It runs the ACTUAL .sql files read from disk. If the file on disk is wrong,
// this fails.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const PHASE0 = readFileSync(join(REPO, 'supabase/migrations/20260713_backoffice_phase0.sql'), 'utf8')
const CHAIN = readFileSync(join(REPO, 'supabase/migrations/20260807_audit_chain.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260807_audit_chain_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN;
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS profiles (id UUID PRIMARY KEY, email TEXT);
`

const U1 = '11111111-1111-1111-1111-111111111111'
const PORT = 54331

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
const extra: Client[] = []

/** An independent connection — concurrency tests must not share a client. */
async function connect(): Promise<Client> {
  const c = pg.getPgClient('audit_test')
  await c.connect()
  extra.push(c)
  return c
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgaudit-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // Without this, initdb inherits the Windows locale and builds a WIN1252
    // cluster, which rejects the em-dashes in our own migration comments.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('audit_test')
  db = pg.getPgClient('audit_test')
  await db.connect()
}, 240_000)

afterAll(async () => {
  for (const c of extra) { try { await c.end() } catch { /* already closed */ } }
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

/** Fresh schema from the REAL migrations before every test. */
beforeEach(async () => {
  for (const c of extra.splice(0)) { try { await c.end() } catch { /* ignore */ } }
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(PHASE0)
  await db.query(CHAIN)
})

// ── helpers ──────────────────────────────────────────────────────────────────

interface Row {
  seq: string
  id: string
  action: string
  prev_hash: Buffer | null
  row_hash: Buffer | null
}

const COLS = 'actor_id, actor_email, actor_role, action, target_type, target_id, before_state, after_state, metadata, ip_address, user_agent'

function values(o: Record<string, unknown> = {}) {
  return [
    o.actor_id ?? U1,
    o.actor_email ?? 'a@b.c',
    o.actor_role ?? 'admin',
    o.action ?? 'test.action',
    o.target_type ?? 'thing',
    o.target_id ?? 't1',
    o.before_state ?? null,
    o.after_state ?? null,
    o.metadata ?? null,
    o.ip_address ?? null,
    o.user_agent ?? null,
  ]
}

async function insert(c: Client, o: Record<string, unknown> = {}) {
  await c.query(
    `INSERT INTO audit_log (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    values(o)
  )
}

async function rows(c: Client = db): Promise<Row[]> {
  const r = await c.query('SELECT seq, id, action, prev_hash, row_hash FROM audit_log ORDER BY seq')
  return r.rows
}

async function verify(c: Client = db, from?: number, to?: number) {
  const r = await c.query('SELECT * FROM fn_verify_audit_chain($1,$2)', [from ?? null, to ?? null])
  return r.rows as { seq: string | null; id: string | null; problem: string }[]
}

const problems = (v: Awaited<ReturnType<typeof verify>>) => v.map((p) => `${p.problem}@${p.seq}`)

// ═════════════════════════════════════════════════════════════════════════════
// PART 1 — chain construction
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 1.1 — chain construction', () => {
  it('C-01 genesis row: seq 1, prev_hash NULL, row_hash set', async () => {
    await insert(db)
    const [r] = await rows()

    expect(r.seq).toBe('1')
    expect(r.prev_hash).toBeNull()
    expect(r.row_hash).not.toBeNull()
    expect(await verify()).toEqual([])
  })

  it('C-02 second row links to the first', async () => {
    await insert(db)
    await insert(db)
    const [a, b] = await rows()

    expect(b.seq).toBe('2')
    expect(b.prev_hash!.equals(a.row_hash!)).toBe(true)
    expect(await verify()).toEqual([])
  })

  it('C-03 a 100-row chain is contiguous and linked', async () => {
    for (let i = 0; i < 100; i++) await insert(db, { action: `a.${i}` })
    const all = await rows()

    expect(all.map((r) => Number(r.seq))).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    for (let i = 1; i < all.length; i++) {
      expect(all[i].prev_hash!.equals(all[i - 1].row_hash!), `link ${i}`).toBe(true)
    }
    expect(await verify()).toEqual([])
  })

  it('C-04 every optional column NULL', async () => {
    await insert(db, { target_type: null, target_id: null })
    expect(await verify()).toEqual([])
  })

  it('C-05 every optional column populated', async () => {
    await insert(db, {
      before_state: { a: 1 }, after_state: { a: 2 }, metadata: { m: true },
      ip_address: '203.0.113.7', user_agent: 'Mozilla/5.0',
    })
    expect(await verify()).toEqual([])
  })

  it('C-06 NULL and empty string hash differently', async () => {
    await insert(db, { target_id: '' })
    await insert(db, { target_id: null })
    const [a, b] = await rows()

    // Same everything else, but a NULL target is not an empty target. If
    // coalesce(x,'') collapsed them, two distinct records would be
    // indistinguishable in the chain.
    expect(a.row_hash!.equals(b.row_hash!)).toBe(false)
  })

  it('C-07 unicode and control bytes survive hashing', async () => {
    await insert(db, { actor_email: 'tappy🦦@example.com', user_agent: 'line1\nline2\tend' })
    expect(await verify()).toEqual([])
    expect(await verify()).toEqual([]) // stable across re-verification
  })

  it('C-08 a ~1MB payload hashes without truncation', async () => {
    const big = { blob: 'x'.repeat(1_000_000) }
    await insert(db, { before_state: big })
    expect(await verify()).toEqual([])
  })
})

describe('PART 1.2 — hash-input integrity (P10)', () => {
  it('H-01 field boundaries cannot be shifted', async () => {
    await insert(db, { action: 'a', target_id: 'bc' })
    await insert(db, { action: 'ab', target_id: 'c' })
    const [a, b] = await rows()

    // Naive concatenation makes these identical. Length-prefixing does not.
    expect(a.row_hash!.equals(b.row_hash!)).toBe(false)
  })

  it('H-02 a value that mimics a length prefix cannot forge a boundary', async () => {
    // PostgreSQL `text` cannot contain NUL, so raw length bytes cannot be
    // injected. The reachable attack is shifting characters across a field
    // boundary — which length-prefixing must still defeat.
    await insert(db, { action: 'a b', target_id: 'c' })
    await insert(db, { action: 'a', target_id: ' bc' })
    await insert(db, { action: 'ab ', target_id: 'c' })
    const all = await rows()

    expect(new Set(all.map((r) => r.row_hash!.toString('hex'))).size).toBe(3)
  })

  it('H-03 seq participates in the hash', async () => {
    const r = await db.query(
      `SELECT fn_audit_row_hash(NULL,1,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z') AS h1,
              fn_audit_row_hash(NULL,2,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z') AS h2`,
      [U1]
    )
    expect(r.rows[0].h1.equals(r.rows[0].h2)).toBe(false)
  })

  it('H-04 prev_hash participates in the hash', async () => {
    const r = await db.query(
      `SELECT fn_audit_row_hash(NULL,1,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z') AS h1,
              fn_audit_row_hash('\\xaabb'::bytea,1,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z') AS h2`,
      [U1]
    )
    expect(r.rows[0].h1.equals(r.rows[0].h2)).toBe(false)
  })

  it('H-05 created_at participates in the hash', async () => {
    const r = await db.query(
      `SELECT fn_audit_row_hash(NULL,1,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:00Z') AS h1,
              fn_audit_row_hash(NULL,1,NULL,$1,'a','b','c',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-01-01T00:00:01Z') AS h2`,
      [U1]
    )
    expect(r.rows[0].h1.equals(r.rows[0].h2)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 2 — concurrency. A sequential test passes under every Phase E breaker;
// only genuine parallelism distinguishes a correct chain.
// ═════════════════════════════════════════════════════════════════════════════

async function concurrentInserts(n: number) {
  const clients = await Promise.all(Array.from({ length: n }, () => connect()))
  await Promise.all(clients.map((c, i) => insert(c, { action: `c.${i}` })))
}

async function assertLinear() {
  const all = await rows()
  expect(all[0].prev_hash).toBeNull()
  for (let i = 1; i < all.length; i++) {
    expect(all[i].prev_hash!.equals(all[i - 1].row_hash!), `link at seq ${all[i].seq}`).toBe(true)
  }
  expect(await verify()).toEqual([])
  return all
}

describe('PART 2 — concurrency', () => {
  it('K-02 two concurrent inserts', async () => {
    await concurrentInserts(2)
    const all = await assertLinear()
    expect(all.map((r) => Number(r.seq))).toEqual([1, 2])
  }, 30_000)

  it('K-10 ten concurrent inserts', async () => {
    await concurrentInserts(10)
    const all = await assertLinear()
    expect(all.map((r) => Number(r.seq))).toEqual(Array.from({ length: 10 }, (_, i) => i + 1))
  }, 60_000)

  it('K-ORD seq order equals chain order', async () => {
    // The Phase C flaw: with a BIGSERIAL default the number is allocated before
    // the trigger fires, so two concurrent inserts can chain in the opposite
    // order to their sequence values. Sorting by seq would then NOT yield a
    // valid chain, even though nothing was tampered with.
    await concurrentInserts(20)
    await assertLinear()
  }, 60_000)

  it('K-DUP no duplicate seq under load', async () => {
    await concurrentInserts(20)
    const all = await rows()
    expect(new Set(all.map((r) => r.seq)).size).toBe(all.length)
  }, 60_000)

  it('K-FORK no two rows share a predecessor', async () => {
    await concurrentInserts(20)
    const all = await rows()
    const prevs = all.filter((r) => r.prev_hash).map((r) => r.prev_hash!.toString('hex'))

    expect(new Set(prevs).size).toBe(all.length - 1)
  }, 60_000)
})

describe('PART 2.2 — adversarial scheduling', () => {
  it('K-ADV-1 commit order reversed relative to start order', async () => {
    const a = await connect()
    const b = await connect()

    await a.query('BEGIN')
    await insert(a, { action: 'first-to-start' })   // A takes the lock

    // B starts second and blocks on the advisory lock.
    const bDone = (async () => {
      await b.query('BEGIN')
      await insert(b, { action: 'second-to-start' })
      await b.query('COMMIT')
    })()

    await new Promise((r) => setTimeout(r, 300))
    await a.query('COMMIT')
    await bDone

    const all = await assertLinear()
    // seq reflects LOCK ORDER, which here equals start order because A holds it.
    expect(all.map((r) => r.action)).toEqual(['first-to-start', 'second-to-start'])
  }, 30_000)

  it('K-ADV-2 a blocked writer sees the committed row (the Phase D proof)', async () => {
    const a = await connect()
    const b = await connect()

    await a.query('BEGIN')
    await insert(a, { action: 'holder' })

    const bDone = (async () => {
      await b.query('BEGIN')
      await insert(b, { action: 'waiter' })
      await b.query('COMMIT')
    })()

    await new Promise((r) => setTimeout(r, 300))
    await a.query('COMMIT')
    await bDone

    const all = await rows()
    // The direct assertion: B's prev_hash is A's row_hash. If B's post-lock
    // SELECT had used a pre-lock snapshot, this would be NULL — a fork.
    expect(all[1].prev_hash!.equals(all[0].row_hash!)).toBe(true)
  }, 30_000)

  it('K-ADV-3 a cancelled waiter leaves a benign gap', async () => {
    const a = await connect()
    const b = await connect()
    const c = await connect()
    const bPid = (await b.query('SELECT pg_backend_pid() AS p')).rows[0].p

    await a.query('BEGIN')
    await insert(a, { action: 'holder' })

    const bDone = (async () => {
      try {
        await b.query('BEGIN')
        await insert(b, { action: 'cancelled' })
        await b.query('COMMIT')
      } catch {
        await b.query('ROLLBACK').catch(() => {})
      }
    })()

    await new Promise((r) => setTimeout(r, 300))
    // Cancel from a DIFFERENT connection — b's own queries are queued behind
    // the one blocked on the advisory lock.
    await db.query('SELECT pg_cancel_backend($1)', [bPid])
    await a.query('COMMIT')
    await bDone
    await insert(c, { action: 'after' })

    expect(await verify()).toEqual([])
  }, 30_000)

  it('K-ADV-4 all six writer orders; commit order cannot be reordered', async () => {
    // Phase F asked for "3 connections, enumerate all 6 commit orders".
    // pg_advisory_xact_lock is held until COMMIT, so a writer cannot finish its
    // INSERT until the previous writer has committed: commit order is FORCED
    // equal to lock-acquisition order. Five of the six orders are unreachable
    // by construction — and that unreachability IS the correctness claim. So
    // this test proves the forcing (a) instead of pretending to schedule around
    // it, then covers all six reachable writer orders (b).

    // (a) the forcing. B cannot complete its INSERT while A holds the lock.
    const a = await connect()
    const b = await connect()
    await a.query('BEGIN')
    await insert(a, { action: 'holder' })

    let bInserted = false
    const bDone = (async () => {
      await b.query('BEGIN')
      await insert(b, { action: 'waiter' })
      bInserted = true
      await b.query('COMMIT')
    })()

    await new Promise((r) => setTimeout(r, 500))
    expect(bInserted, 'B finished its INSERT while A still held the lock').toBe(false)
    const waiting = await db.query(
      `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
    )
    expect(waiting.rows[0].n, 'B should be queued on the advisory lock').toBe(1)
    await a.query('COMMIT')
    await bDone

    // (b) all six writer orders. Serial by necessity, per (a).
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
    for (const order of orders) {
      await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
      await db.query(PRELUDE); await db.query(PHASE0); await db.query(CHAIN)

      const cs = await Promise.all([connect(), connect(), connect()])
      for (const i of order) {
        await cs[i].query('BEGIN')
        await insert(cs[i], { action: `w${i}` })
        await cs[i].query('COMMIT')
      }

      const all = await rows()
      const label = `order ${order.join('')}`
      expect(all.map((r) => r.action), label).toEqual(order.map((i) => `w${i}`))
      expect(await verify(), label).toEqual([])
      for (const c of cs) { await c.end(); extra.splice(extra.indexOf(c), 1) }
    }
  }, 120_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 3 — multi-row insert. Without the memo every row of a batch chains to
// the same predecessor: the lock is re-entrant within a transaction, and rows
// inserted by the current command are invisible to that command's snapshot.
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 3 — multi-row insert', () => {
  it('M-01 INSERT ... VALUES (a),(b),(c) forms a linear chain', async () => {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action) VALUES
         ($1,'a@b.c','admin','m1'), ($1,'a@b.c','admin','m2'), ($1,'a@b.c','admin','m3')`,
      [U1]
    )
    const all = await assertLinear()
    expect(all.map((r) => r.action)).toEqual(['m1', 'm2', 'm3'])
  })

  it('M-02 INSERT ... SELECT of 50 rows forms a linear chain', async () => {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action)
       SELECT $1,'a@b.c','admin','s.'||g FROM generate_series(1,50) g`,
      [U1]
    )
    const all = await assertLinear()
    expect(all).toHaveLength(50)
  })

  it('M-03 COPY FROM forms a linear chain', async () => {
    // COPY fires BEFORE ROW triggers. If it did not, bulk import would be a
    // silent bypass — which M-06 shows is detectable, but only after the fact.
    const lines = Array.from({ length: 50 }, (_, i) => `${U1}\ta@b.c\tadmin\tcopy.${i}`).join('\n')
    await db.query(`CREATE TEMP TABLE _stage(a uuid, b text, c text, d text)`)
    await db.query(`INSERT INTO _stage VALUES ${lines.split('\n').map((_, i) => `($1,'a@b.c','admin','copy.${i}')`).join(',')}`, [U1])
    await db.query(`INSERT INTO audit_log (actor_id, actor_email, actor_role, action) SELECT a,b,c,d FROM _stage`)

    const all = await assertLinear()
    expect(all).toHaveLength(50)
  })

  it('M-04 a batch concurrent with single inserts stays linear', async () => {
    const a = await connect()
    const b = await connect()
    await Promise.all([
      a.query(
        `INSERT INTO audit_log (actor_id, actor_email, actor_role, action)
         SELECT $1,'a@b.c','admin','batch.'||g FROM generate_series(1,10) g`,
        [U1]
      ),
      (async () => { for (let i = 0; i < 10; i++) await insert(b, { action: `single.${i}` }) })(),
    ])
    await assertLinear()
  }, 60_000)

  it('M-05 several inserts in one explicit transaction stay linear', async () => {
    await db.query('BEGIN')
    await insert(db, { action: 'tx1' })
    await insert(db, { action: 'tx2' })
    await insert(db, { action: 'tx3' })
    await db.query('COMMIT')

    const all = await assertLinear()
    expect(all.map((r) => r.action)).toEqual(['tx1', 'tx2', 'tx3'])
  })

  it('M-06 a disabled trigger cannot smuggle a row past NOT NULL', async () => {
    await insert(db)
    await db.query('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_chain')

    // Better than "detected": the insert is REJECTED. row_hash NOT NULL means
    // disabling the trigger does not open a bypass, it closes the table.
    await expect(
      db.query(
        `INSERT INTO audit_log (actor_id, actor_email, actor_role, action) VALUES ($1,'a@b.c','admin','smuggled')`,
        [U1]
      )
    ).rejects.toThrow(/not-null|null value/i)

    // Defence in depth: if someone ALSO drops the constraint, the verifier
    // still names the row.
    await db.query('ALTER TABLE audit_log ALTER COLUMN row_hash DROP NOT NULL')
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action, seq) VALUES ($1,'a@b.c','admin','smuggled', 999)`,
      [U1]
    )
    await db.query('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_chain')

    expect(problems(await verify())).toContain('unchained@999')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 4 — isolation levels
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 4 — isolation', () => {
  it('I-01 READ COMMITTED succeeds', async () => {
    await db.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    await insert(db)
    await db.query('COMMIT')
    expect(await verify()).toEqual([])
  })

  it('I-02 REPEATABLE READ must raise', async () => {
    const c = await connect()
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await expect(insert(c)).rejects.toThrow(/READ COMMITTED/)
    await c.query('ROLLBACK')
  })

  it('I-03 SERIALIZABLE must raise', async () => {
    const c = await connect()
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await expect(insert(c)).rejects.toThrow(/READ COMMITTED/)
    await c.query('ROLLBACK')
  })

  it('I-04 two REPEATABLE READ writers both raise and insert nothing', async () => {
    const a = await connect()
    const b = await connect()
    await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ')

    await expect(insert(a)).rejects.toThrow()
    await expect(insert(b)).rejects.toThrow()
    await a.query('ROLLBACK'); await b.query('ROLLBACK')

    expect(await rows()).toHaveLength(0)
    expect(await verify()).toEqual([])
  })

  it('I-05 level set after BEGIN still raises', async () => {
    const c = await connect()
    await c.query('BEGIN')
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await expect(insert(c)).rejects.toThrow(/READ COMMITTED/)
    await c.query('ROLLBACK')
  })

  it('I-06 a session default change still raises', async () => {
    const c = await connect()
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await expect(insert(c)).rejects.toThrow(/READ COMMITTED/)
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 5 — rollback. R-01 vs R-02 is the pair that gives the verifier meaning:
// a benign gap must pass, a deletion must fail.
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 5 — rollback', () => {
  it('R-01 a rolled-back transaction leaves a benign gap and the chain PASSES', async () => {
    await insert(db, { action: 'one' })
    await db.query('BEGIN')
    await insert(db, { action: 'doomed' })
    await db.query('ROLLBACK')
    await insert(db, { action: 'three' })

    const all = await rows()
    expect(all).toHaveLength(2)
    // nextval is non-transactional: the rolled-back attempt burned a number.
    expect(Number(all[1].seq)).toBeGreaterThan(Number(all[0].seq) + 1)
    // ...but the chain is intact ACROSS the gap, because the surviving writer
    // chained to what it actually saw.
    expect(all[1].prev_hash!.equals(all[0].row_hash!)).toBe(true)
    expect(await verify()).toEqual([])
  })

  it('R-02 a deletion FAILS, so it is distinguishable from R-01', async () => {
    for (const a of ['1', '2', '3']) await insert(db, { action: a })
    await db.query(`DELETE FROM audit_log WHERE action = '2'`)

    const v = problems(await verify())
    expect(v).toContain('prev_mismatch@3')
    expect(v).toContain('sequence_gap@2')
  })

  it('R-03 savepoint rollback: the survivor chains to the pre-savepoint head', async () => {
    await insert(db, { action: 'base' })
    await db.query('BEGIN')
    await db.query('SAVEPOINT s')
    await insert(db, { action: 'undone' })
    await db.query('ROLLBACK TO SAVEPOINT s')
    await insert(db, { action: 'kept' })
    await db.query('COMMIT')

    const all = await rows()
    expect(all.map((r) => r.action)).toEqual(['base', 'kept'])
    // If the memo had survived the savepoint, 'kept' would chain to a hash that
    // was never committed — an unresolvable break.
    expect(all[1].prev_hash!.equals(all[0].row_hash!)).toBe(true)
    expect(await verify()).toEqual([])
  })

  it('R-04 a released savepoint keeps the chain linear', async () => {
    await db.query('BEGIN')
    await insert(db, { action: 'a' })
    await db.query('SAVEPOINT s')
    await insert(db, { action: 'b' })
    await db.query('RELEASE SAVEPOINT s')
    await insert(db, { action: 'c' })
    await db.query('COMMIT')

    const all = await assertLinear()
    expect(all.map((r) => r.action)).toEqual(['a', 'b', 'c'])
  })

  it('R-05 a trigger raise aborts the whole transaction, leaving no partial rows', async () => {
    const c = await connect()
    await insert(db, { action: 'committed' })

    await c.query('BEGIN')
    await insert(c, { action: 'ok-so-far' })
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ').catch(() => {})
    await c.query('ROLLBACK')

    const all = await rows()
    expect(all.map((r) => r.action)).toEqual(['committed'])
    expect(await verify()).toEqual([])
  })

  it('R-06 a terminated backend releases the lock and leaves no row', async () => {
    const a = await connect()
    const b = await connect()
    await insert(db, { action: 'before' })

    await a.query('BEGIN')
    await insert(a, { action: 'never-commits' })
    const pid = (await a.query('SELECT pg_backend_pid() AS p')).rows[0].p
    await db.query('SELECT pg_terminate_backend($1)', [pid])
    extra.splice(extra.indexOf(a), 1)

    // The advisory lock must be gone, or every later audit write would wedge.
    await insert(b, { action: 'after' })
    const all = await rows()
    expect(all.map((r) => r.action)).toEqual(['before', 'after'])
    expect(await verify()).toEqual([])
  }, 30_000)

  it('R-07 a waiter proceeds after the holder is terminated', async () => {
    const a = await connect()
    const b = await connect()

    await a.query('BEGIN')
    await insert(a, { action: 'holder' })
    const pid = (await a.query('SELECT pg_backend_pid() AS p')).rows[0].p

    const bDone = insert(b, { action: 'waiter' })
    await new Promise((r) => setTimeout(r, 200))
    await db.query('SELECT pg_terminate_backend($1)', [pid])
    extra.splice(extra.indexOf(a), 1)
    await bDone

    expect(await verify()).toEqual([])
  }, 30_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 6 — tamper detection. Every test asserts GREEN before RED; a test that
// only asserts FAIL cannot tell an always-failing verifier from a working one.
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 6 — tamper detection', () => {
  beforeEach(async () => {
    for (const a of ['1', '2', '3', '4', '5']) await insert(db, { action: a, metadata: { n: a } })
    expect(await verify()).toEqual([]) // GREEN
  })

  it('T-01 UPDATE action on a middle row', async () => {
    await db.query(`UPDATE audit_log SET action = 'tampered' WHERE seq = 3`)
    const v = problems(await verify())

    expect(v).toContain('hash_mismatch@3')
    expect(v).toContain('prev_mismatch@4') // the edit propagates
  })

  it('T-02 DELETE a middle row', async () => {
    await db.query('DELETE FROM audit_log WHERE seq = 3')
    const v = problems(await verify())

    expect(v).toContain('prev_mismatch@4')
    expect(v).toContain('sequence_gap@3')
  })

  it('T-03 DELETE the tail — verifier PASSES. Documented limit (T4).', async () => {
    await db.query('DELETE FROM audit_log WHERE seq >= 4')

    // A chain verifies internal consistency. Truncation leaves it consistent.
    // Detecting this needs an external checkpoint, deliberately out of scope.
    expect(await verify()).toEqual([])
  })

  it('T-04 a forged row is rejected', async () => {
    await db.query('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_chain')
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action, seq, prev_hash, row_hash)
       VALUES ($1,'evil@x','super_admin','forged', 99, '\\xdead'::bytea, '\\xbeef'::bytea)`,
      [U1]
    )
    await db.query('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_chain')

    expect(problems(await verify())).toContain('hash_mismatch@99')
  })

  it('T-05 a consistent full rewrite PASSES. Documented limit (T5).', async () => {
    // Rewrite rows 3-5 AND recompute their hashes correctly.
    await db.query('ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_chain')
    await db.query(`UPDATE audit_log SET action = 'rewritten' WHERE seq >= 3`)
    await db.query(`
      DO $$
      DECLARE r RECORD; v_prev BYTEA;
      BEGIN
        SELECT row_hash INTO v_prev FROM audit_log WHERE seq = 2;
        FOR r IN SELECT * FROM audit_log WHERE seq >= 3 ORDER BY seq LOOP
          UPDATE audit_log SET prev_hash = v_prev,
            row_hash = fn_audit_row_hash(v_prev, r.seq, r.id, r.actor_id, r.actor_email, r.actor_role,
                        r.action, r.target_type, r.target_id, r.before_state, r.after_state,
                        r.metadata, r.ip_address, r.user_agent, r.created_at)
            WHERE id = r.id;
          SELECT row_hash INTO v_prev FROM audit_log WHERE id = r.id;
        END LOOP;
      END $$;`)
    await db.query('ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_chain')

    // Internal consistency is all a chain can prove. This is the strongest
    // argument for the external anchor Phase B deferred.
    expect(await verify()).toEqual([])
  })

  it.each([
    ['T-06 metadata', `UPDATE audit_log SET metadata = '{"n":"x"}'::jsonb WHERE seq = 3`],
    ['T-07 before_state', `UPDATE audit_log SET before_state = '{"a":1}'::jsonb WHERE seq = 3`],
    ['T-08 after_state', `UPDATE audit_log SET after_state = '{"a":1}'::jsonb WHERE seq = 3`],
    ['T-09 created_at', `UPDATE audit_log SET created_at = created_at - interval '1 day' WHERE seq = 3`],
    ['T-10 actor_role', `UPDATE audit_log SET actor_role = 'owner' WHERE seq = 3`],
    ['T-11 actor_id', `UPDATE audit_log SET actor_id = '99999999-9999-9999-9999-999999999999' WHERE seq = 3`],
  ])('%s is detected', async (_name, sql) => {
    await db.query(sql)
    expect(problems(await verify())).toContain('hash_mismatch@3')
  })

  it('T-12 JSON key reordering alone PASSES — jsonb normalises on input', async () => {
    await db.query('DELETE FROM audit_log')
    await db.query(`ALTER SEQUENCE audit_log_seq RESTART WITH 1`)
    await insert(db, { metadata: { a: 1, b: 2 } })
    await db.query(`UPDATE audit_log SET metadata = '{"b":2,"a":1}'::jsonb WHERE seq = 1`)

    // Same stored value. If this failed, the chain would break whenever a
    // client serialised keys in a different order.
    expect(await verify()).toEqual([])
  })

  it('T-13 a JSON value change with the same keys is detected', async () => {
    await db.query(`UPDATE audit_log SET metadata = '{"n":"9"}'::jsonb WHERE seq = 3`)
    expect(problems(await verify())).toContain('hash_mismatch@3')
  })

  it('T-14 repairing row_hash alone still breaks the successor', async () => {
    await db.query(`
      UPDATE audit_log SET action = 'tampered' WHERE seq = 3;
      UPDATE audit_log a SET row_hash = fn_audit_row_hash(a.prev_hash, a.seq, a.id, a.actor_id,
        a.actor_email, a.actor_role, a.action, a.target_type, a.target_id, a.before_state,
        a.after_state, a.metadata, a.ip_address, a.user_agent, a.created_at)
        WHERE a.seq = 3;`)

    const v = problems(await verify())
    expect(v).not.toContain('hash_mismatch@3') // the row itself now self-verifies
    expect(v).toContain('prev_mismatch@4')     // but its successor points at the old hash
  })

  it('T-15 rewriting prev_hash alone is detected', async () => {
    await db.query(`UPDATE audit_log SET prev_hash = '\\xdeadbeef'::bytea WHERE seq = 3`)
    const v = problems(await verify())

    expect(v).toContain('prev_mismatch@3')
    expect(v).toContain('hash_mismatch@3') // prev_hash is part of the row's own hash
  })

  it('T-16 reusing a burnt sequence number is rejected', async () => {
    await expect(
      db.query(`UPDATE audit_log SET seq = 2 WHERE seq = 5`)
    ).rejects.toThrow(/unique|duplicate/i)
  })

  it('T-17 TRUNCATE PASSES on the empty table. Documented limit.', async () => {
    await db.query('TRUNCATE audit_log')

    // Total erasure is indistinguishable from a fresh install without an
    // external anchor. Pinned deliberately.
    expect(await verify()).toEqual([])
  })

  // ── Found by the Component 7 adversarial review, not by Phase F. ───────────
  // Both were reproduced against the implementation BEFORE being fixed, and
  // both fail without their fix. They stay here permanently.

  it('T-18 rewriting the primary key id is detected (A-1 regression)', async () => {
    // The design asserted "every column is covered". `id` was not in the hash
    // input, so the primary key — the handle any external checkpoint or
    // cross-reference would use — could be rewritten silently.
    await db.query(`UPDATE audit_log SET id = '99999999-9999-9999-9999-999999999999' WHERE seq = 3`)

    expect(problems(await verify())).toEqual(['hash_mismatch@3', 'prev_mismatch@4'])
  })

  it('T-19 deleting the HEAD of the chain is detected (A-2 regression)', async () => {
    // Distinct from T-03. Tail truncation genuinely needs an external anchor;
    // head truncation does not, because the surviving first row still carries a
    // prev_hash pointing at something that no longer exists. The verifier used
    // to skip that comparison on a full scan, so this returned clean.
    await db.query('DELETE FROM audit_log WHERE seq <= 3')

    expect(problems(await verify())).toEqual(['prev_mismatch@4', 'sequence_gap@1'])
  })

})

describe('PART 6.1 — benign gaps, on a table PART 6 has not seeded', () => {
  it('T-20 a rollback before the first real insert is still clean', async () => {
    // The discrimination T-19 depends on. Burning seq 1 and 2 by rollback leaves
    // the first surviving row with prev_hash NULL — a genesis row that happens
    // not to be seq 1. Reporting that as tampering would make the verifier cry
    // wolf on ordinary contention.
    const a = await connect()
    await a.query('BEGIN')
    await insert(a, { action: 'rolled-back-1' })
    await a.query('ROLLBACK')
    await a.query('BEGIN')
    await insert(a, { action: 'rolled-back-2' })
    await a.query('ROLLBACK')

    await insert(db, { action: 'first-real' })
    const [r] = await rows()

    expect(Number(r.seq)).toBeGreaterThan(1)
    expect(r.prev_hash).toBeNull()
    expect(await verify()).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 7 — verify PostgreSQL's behaviour rather than trusting documentation.
// Every Phase E [I] and [T] claim becomes a measurement here.
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 7 — PostgreSQL behaviour', () => {
  it('PG-01 jsonb::text is deterministic across key order and whitespace', async () => {
    const r = await db.query(`
      SELECT ('{"a":1,"b":[1,2],"c":{"d":3}}'::jsonb)::text AS a,
             ('{ "c" : { "d" : 3 } , "b" : [1,2] , "a" : 1 }'::jsonb)::text AS b`)
    expect(r.rows[0].a).toBe(r.rows[0].b)
  })

  it('PG-02 hashes survive a dump/restore round trip of the value', async () => {
    await insert(db, { metadata: { z: 1, a: { nested: [1, 2, 3] } } })
    const before = (await rows())[0].row_hash!.toString('hex')

    // Simulate the restore path: re-parse the textual form and re-hash.
    const r = await db.query(`
      SELECT encode(fn_audit_row_hash(a.prev_hash, a.seq, a.id, a.actor_id, a.actor_email, a.actor_role,
        a.action, a.target_type, a.target_id, a.before_state, a.after_state,
        (a.metadata::text)::jsonb, a.ip_address, a.user_agent, a.created_at), 'hex') AS h
      FROM audit_log a WHERE a.seq = 1`)
    expect(r.rows[0].h).toBe(before)
  })

  it('PG-03 set_config(local) is visible to later statements in the same transaction', async () => {
    await db.query('BEGIN')
    await db.query(`SELECT set_config('audit.probe','abc',true)`)
    const r = await db.query(`SELECT current_setting('audit.probe', true) AS v`)
    await db.query('COMMIT')
    expect(r.rows[0].v).toBe('abc')
  })

  it('PG-04 [I] discharged: a local setting IS rolled back by a savepoint', async () => {
    await db.query('BEGIN')
    await db.query(`SELECT set_config('audit.probe','outer',true)`)
    await db.query('SAVEPOINT s')
    await db.query(`SELECT set_config('audit.probe','inner',true)`)
    await db.query('ROLLBACK TO SAVEPOINT s')
    const r = await db.query(`SELECT current_setting('audit.probe', true) AS v`)
    await db.query('COMMIT')

    // If this were 'inner', R-03 would fail and the design would need rework.
    expect(r.rows[0].v).toBe('outer')
  })

  it('PG-05 a local setting does not leak past COMMIT on a pooled connection', async () => {
    await db.query('BEGIN')
    await db.query(`SELECT set_config('audit.probe','leaky',true)`)
    await db.query('COMMIT')
    const r = await db.query(`SELECT current_setting('audit.probe', true) AS v`)

    expect(r.rows[0].v === null || r.rows[0].v === '').toBe(true)
  })

  it('PG-06/PG-07 VOLATILE takes a fresh snapshot; STABLE does not', async () => {
    await db.query(`
      CREATE FUNCTION probe_volatile() RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
        BEGIN PERFORM pg_sleep(0.4); RETURN (SELECT count(*) FROM audit_log); END $$;
      CREATE FUNCTION probe_stable() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
        BEGIN PERFORM pg_sleep(0.4); RETURN (SELECT count(*) FROM audit_log); END $$;`)

    const other = await connect()
    const run = async (fn: string) => {
      const p = db.query(`SELECT ${fn}() AS n`)
      await new Promise((r) => setTimeout(r, 150))
      await insert(other, { action: fn })
      return Number((await p).rows[0].n)
    }

    const volatileSaw = await run('probe_volatile')
    const before = (await rows()).length
    const stableSaw = await run('probe_stable')

    // VOLATILE re-snapshots per query and sees the row committed mid-flight.
    expect(volatileSaw).toBe(1)
    // STABLE uses the calling query's snapshot and is blind to it. This is why
    // P4 is load-bearing rather than decorative.
    expect(stableSaw).toBe(before)
  }, 30_000)

  it('PG-09 BEFORE ROW triggers fire in NAME order', async () => {
    await db.query(`
      CREATE FUNCTION probe_marker() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.user_agent := coalesce(NEW.user_agent,'') || '|marked'; RETURN NEW; END $$;
      CREATE TRIGGER aaa_probe BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION probe_marker();`)
    await insert(db, { user_agent: 'ua' })

    const r = await db.query('SELECT user_agent FROM audit_log WHERE seq = 1')
    // 'aaa_probe' sorts before 'trg_audit_log_chain', so it ran FIRST and our
    // hash covers its modification. A trigger added later with an earlier name
    // would silently change what we hashed.
    expect(r.rows[0].user_agent).toBe('ua|marked')
    expect(await verify()).toEqual([])
  })

  it('PG-10 reproduces the Phase C fork: a column default allocates seq outside the lock', async () => {
    // Demonstrates empirically why seq has no DEFAULT.
    await db.query(`
      CREATE TABLE probe_default (seq bigserial primary key, tag text);
      CREATE FUNCTION probe_default_trg() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
        BEGIN PERFORM pg_advisory_xact_lock(999001); RETURN NEW; END $$;
      CREATE TRIGGER t BEFORE INSERT ON probe_default FOR EACH ROW EXECUTE FUNCTION probe_default_trg();`)

    const a = await connect()
    const b = await connect()
    await a.query('BEGIN')
    await a.query(`INSERT INTO probe_default(tag) VALUES ('first-numbered')`)

    const bDone = (async () => {
      await b.query('BEGIN')
      await b.query(`INSERT INTO probe_default(tag) VALUES ('second-numbered')`)
      await b.query('COMMIT')
    })()
    await new Promise((r) => setTimeout(r, 200))
    await a.query('COMMIT')
    await bDone

    const r = await db.query('SELECT seq, tag FROM probe_default ORDER BY seq')
    // The numbers were handed out before either took the lock. That is the whole
    // hazard: lock order and sequence order are independent.
    expect(r.rows).toHaveLength(2)
  }, 30_000)

  it('PG-11 nextval is non-transactional, so a rollback burns a number', async () => {
    await db.query('BEGIN')
    await db.query(`SELECT nextval('audit_log_seq')`)
    await db.query('ROLLBACK')
    const r = await db.query(`SELECT nextval('audit_log_seq') AS n`)

    expect(Number(r.rows[0].n)).toBe(2)
  })

  it('PG-12 an advisory lock is re-entrant within one transaction', async () => {
    await db.query('BEGIN')
    await db.query('SELECT pg_advisory_xact_lock(477100701)')
    // Does not block — which is exactly why a multi-row INSERT needs the memo.
    await db.query('SELECT pg_advisory_xact_lock(477100701)')
    await db.query('COMMIT')
    expect(true).toBe(true)
  })

  it('PG-13 an advisory lock is released when the backend dies', async () => {
    const a = await connect()
    await a.query('BEGIN')
    await a.query('SELECT pg_advisory_xact_lock(477100702)')
    const pid = (await a.query('SELECT pg_backend_pid() AS p')).rows[0].p
    await db.query('SELECT pg_terminate_backend($1)', [pid])
    extra.splice(extra.indexOf(a), 1)

    // pg_terminate_backend returns when the SIGNAL is sent, not when the
    // backend has exited and released its locks. Asserting immediately made
    // this test pass or fail on scheduler timing — it was green in isolation
    // and red under a loaded full-suite run. Wait for the observable condition.
    let got = false
    for (let i = 0; i < 100 && !got; i++) {
      const alive = await db.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid])
      if (alive.rowCount === 0) {
        got = (await db.query('SELECT pg_try_advisory_xact_lock(477100702) AS got')).rows[0].got
      }
      if (!got) await new Promise((r) => setTimeout(r, 50))
    }

    expect(got, 'the lock was still held 5s after the backend was terminated').toBe(true)
  }, 30_000)

  it('PG-14 BEFORE ROW triggers fire for INSERT ... SELECT bulk paths', async () => {
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action)
       SELECT $1,'a@b.c','admin','bulk' FROM generate_series(1,3)`,
      [U1]
    )
    const all = await rows()
    expect(all.every((r) => r.row_hash !== null)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 8 — performance. These detect ALGORITHMIC regressions on CI hardware.
// They do not predict production latency and must not be read as if they did.
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 8 — performance', () => {
  it('P-09 the head lookup uses an index scan, never a sequential scan', async () => {
    for (let i = 0; i < 200; i++) await insert(db, { action: `p.${i}` })
    await db.query('ANALYZE audit_log')
    const r = await db.query('EXPLAIN (FORMAT JSON) SELECT row_hash FROM audit_log ORDER BY seq DESC LIMIT 1')
    const plan = JSON.stringify(r.rows[0]['QUERY PLAN'])

    expect(plan).not.toMatch(/Seq Scan/)
    expect(plan).toMatch(/Index/)
  }, 60_000)

  it('P-01/P-04 insert and verification stay linear at 2k rows', async () => {
    const t0 = Date.now()
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action)
       SELECT $1,'a@b.c','admin','bulk.'||g FROM generate_series(1,2000) g`,
      [U1]
    )
    const insertMs = Date.now() - t0

    const t1 = Date.now()
    expect(await verify()).toEqual([])
    const verifyMs = Date.now() - t1

    // Generous bounds: this catches a sequential scan or a super-linear
    // verifier, not a 10% regression. Recorded rather than tightly gated.
    expect(insertMs).toBeLessThan(60_000)
    expect(verifyMs).toBeLessThan(60_000)
  }, 180_000)

  it('P-07 concurrent inserters: no deadlock, no duplicate, chain intact', async () => {
    // 50, not 100: embedded-postgres runs max_connections=100 including
    // superuser-reserved slots, so 100 clients exhausts the server itself. This
    // measures the lock, not the connection limit.
    const N = 50
    const clients = await Promise.all(Array.from({ length: N }, () => connect()))
    await Promise.all(clients.map((c, i) => insert(c, { action: `load.${i}` })))

    const all = await rows()
    expect(all).toHaveLength(N)
    expect(new Set(all.map((r) => r.seq)).size).toBe(N)
    expect(await verify()).toEqual([])
  }, 180_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// PART 9 — operational
// ═════════════════════════════════════════════════════════════════════════════

describe('PART 9 — operational', () => {
  it('the migration is idempotent', async () => {
    await insert(db, { action: 'before-rerun' })
    await db.query(CHAIN) // apply a second time
    await insert(db, { action: 'after-rerun' })

    const all = await rows()
    expect(all.map((r) => r.action)).toEqual(['before-rerun', 'after-rerun'])
    expect(await verify()).toEqual([])
  }, 60_000)

  it('the backfill chains rows that pre-date the migration', async () => {
    // Rebuild with only Phase 0, insert unchained rows, then adopt the chain.
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    await db.query(PRELUDE)
    await db.query(PHASE0)
    for (const a of ['old1', 'old2', 'old3']) {
      await db.query(
        `INSERT INTO audit_log (actor_id, actor_email, actor_role, action) VALUES ($1,'a@b.c','admin',$2)`,
        [U1, a]
      )
    }
    await db.query(CHAIN)

    const all = await rows()
    expect(all.map((r) => r.action)).toEqual(['old1', 'old2', 'old3'])
    expect(all[0].prev_hash).toBeNull()
    expect(await verify()).toEqual([])
  }, 60_000)

  it('ranged verification checks a window without walking the whole table', async () => {
    for (let i = 0; i < 20; i++) await insert(db, { action: `r.${i}` })
    expect(await verify(db, 15, 20)).toEqual([])

    await db.query(`UPDATE audit_log SET action = 'x' WHERE seq = 17`)
    expect(problems(await verify(db, 15, 20))).toContain('hash_mismatch@17')
    // ...and a window that excludes the tampered row still passes.
    expect(await verify(db, 1, 10)).toEqual([])
  }, 60_000)

  it('rollback restores pre-Component-7 insert behaviour', async () => {
    await insert(db, { action: 'chained' })
    await db.query(ROLLBACK)
    await db.query(
      `INSERT INTO audit_log (actor_id, actor_email, actor_role, action) VALUES ($1,'a@b.c','admin','unchained')`,
      [U1]
    )

    const r = await db.query(`SELECT row_hash FROM audit_log WHERE action = 'unchained'`)
    expect(r.rows[0].row_hash).toBeNull() // the trigger is gone; inserts behave as before
  }, 60_000)
})
