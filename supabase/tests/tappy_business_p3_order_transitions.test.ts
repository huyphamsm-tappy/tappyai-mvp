import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'
import { Client } from 'pg'

// ---------------------------------------------------------------------------
// Tappy Business — P3 merchant order transitions, against real PostgreSQL 17.
//
// 🔑 WHY REAL POSTGRESQL AND TWO CONNECTIONS.
//
// The correctness of Accept and Reject is a CONCURRENCY property, and a
// concurrency property cannot be tested against a stub. The requirement is that
// two merchants' tabs, or a merchant and the expiry job, cannot both transition
// the same order — and the thing that makes that true is `SELECT … FOR UPDATE`
// inside `fn_business_transition_order`, which only a real database has.
//
// So this suite opens a SECOND connection and deliberately interleaves two
// transactions with the lock held, rather than firing two promises and hoping
// the scheduler produces a race. A test that "usually" races proves nothing on
// the run where it does not.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATIONS = [
  'supabase/migrations/20260908_tappy_business_p0.sql',
  'supabase/migrations/20260909_tappy_business_p2_order_invariants.sql',
  'supabase/migrations/20260910_tappy_business_p3_order_transitions.sql',
].map((f) => readFileSync(join(REPO, f), 'utf8'))

// 54379 belongs to plan_shares_boundary (RC); unique per suite, see portAllocation.test.ts
const PORT = 54313

const pid = (n: number) => String(n).padStart(26, '0')
const hashOf = (token: string) =>
  String.raw`\x` + createHash('sha256').update(token, 'utf8').digest('hex')

const ACTOR_A = '11111111-1111-4111-8111-111111111111'
const ACTOR_B = '22222222-2222-4222-8222-222222222222'

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

let pg: EmbeddedPostgres
let db: Client
/** A genuinely separate session, for the lock-contention tests. */
let other: Client
let dataDir: string
let merchantA: string
let merchantB: string
let productA: string
let productB: string

const one = async <T>(sql: string, params: unknown[] = [], c: Client = db): Promise<T> =>
  (await c.query(sql, params)).rows[0] as T

async function attempt(sql: string, params: unknown[] = [], c: Client = db): Promise<string | null> {
  try {
    await c.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}

async function asRole(role: string, sql: string): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

/** Create a PENDING order for a merchant, the way P2.1 does. */
async function makeOrder(publicId: string, merchant: string, product: string, productPublic: string) {
  await db.query(
    `SELECT fn_business_create_order($1, $2::uuid, $3::bytea, 'Nguyễn Thị Lan', '0901234567',
       '128 Nguyễn Văn Cừ, Q5', NULL, 'DIRECT', NULL, now() + interval '72 hours',
       $4::uuid, $5, 'Áo thun cotton', 45000::bigint, 2::integer,
       '[{"group":"Màu","value":"Đỏ"}]'::jsonb)`,
    [publicId, merchant, hashOf(randomBytes(32).toString('base64url')), product, productPublic]
  )
}

type Outcome = { transitioned: boolean; status: string; updated_at: string }

const transition = (
  merchant: string,
  publicId: string,
  to: string,
  actor: string,
  reason = 'MERCHANT_ACCEPTED',
  c: Client = db
) =>
  // Every parameter is cast. Without them PostgreSQL sees five `unknown`
  // arguments and cannot resolve the overload — which surfaces on whichever
  // connection parses the statement first, so it looked like a second-session
  // problem rather than a missing cast.
  c.query<Outcome>(
    `SELECT * FROM fn_business_transition_order($1::uuid, $2::text, $3::text, $4::text, $5::text)`,
    [merchant, publicId, to, actor, reason]
  )

const historyOf = (publicId: string) =>
  db
    .query(
      `SELECT h.from_status, h.to_status, h.actor_type, h.actor_id, h.reason
         FROM business_order_status_history h
         JOIN business_orders o ON o.id = h.order_id
        WHERE o.public_id = $1 ORDER BY h.created_at`,
      [publicId]
    )
    .then((r) => r.rows)

const statusOf = (publicId: string) =>
  one<{ status: string }>(`SELECT status FROM business_orders WHERE public_id = $1`, [publicId]).then(
    (r) => r?.status
  )

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-tbp3-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  for (const sql of MIGRATIONS) await db.query(sql)

  // ⚠️ MEASURED, not assumed: `pg.getPgClient()` does not necessarily connect
  // to the database `createDatabase()` just made, and the migrations ran on
  // whatever `db` is attached to. Hard-coding 'test' here put the second
  // session on a different database, where the function genuinely did not
  // exist — which reported as "function does not exist" and looked like a
  // missing cast. Ask the first connection where it is.
  const { rows: dbName } = await db.query<{ current_database: string }>('SELECT current_database()')
  other = new Client({
    host: 'localhost',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: dbName[0].current_database,
  })
  await other.connect()
  await other.query(`SET TimeZone = 'UTC'`)

  merchantA = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, $2::uuid, 'CAFE', 'Lan Shop', 'x', '1') RETURNING id`,
      [pid(1), ACTOR_A]
    )
  ).id
  merchantB = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, $2::uuid, 'FASHION', 'Bao Shop', 'y', '2') RETURNING id`,
      [pid(2), ACTOR_B]
    )
  ).id
  productA = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1,$2,'Áo thun cotton',45000) RETURNING id`,
      [pid(11), merchantA]
    )
  ).id
  productB = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1,$2,'Quần jean',250000) RETURNING id`,
      [pid(12), merchantB]
    )
  ).id
}, 180_000)

beforeEach(async () => {
  // A test that left a transaction open — or aborted one — would otherwise
  // poison this connection for every test after it, turning one real failure
  // into twenty misleading ones. Harmless when no transaction is open.
  await db.query('ROLLBACK').catch(() => {})
  await other.query('ROLLBACK').catch(() => {})
  await db.query('DELETE FROM business_order_status_history')
  await db.query('DELETE FROM business_order_items')
  await db.query('DELETE FROM business_orders')
})

afterAll(async () => {
  await other?.end()
  await db?.end()
  await pg?.stop()
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
    /* windows file lock */
  }
})

// ═══════════════════════════════════════════════════════════════════════════
describe('authorization — merchant isolation', () => {
  it('🔑 merchant A cannot accept merchant B’s order', async () => {
    await makeOrder(pid(100), merchantB, productB, pid(12))
    const { rows } = await transition(merchantA, pid(100), 'ACCEPTED', ACTOR_A)

    // Zero rows: the merchant scope is part of the lookup, so B's order is
    // indistinguishable from one that does not exist.
    expect(rows).toHaveLength(0)
    expect(await statusOf(pid(100))).toBe('PENDING')
    expect(await historyOf(pid(100))).toHaveLength(1) // the creation row only
  })

  it('🔑 merchant A cannot reject merchant B’s order', async () => {
    await makeOrder(pid(101), merchantB, productB, pid(12))
    const { rows } = await transition(merchantA, pid(101), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')

    expect(rows).toHaveLength(0)
    expect(await statusOf(pid(101))).toBe('PENDING')
  })

  it('🔑 knowing the public id does not bypass isolation', async () => {
    // The public id is correct and real; only the merchant is wrong.
    await makeOrder(pid(102), merchantB, productB, pid(12))
    expect((await transition(merchantA, pid(102), 'ACCEPTED', ACTOR_A)).rows).toHaveLength(0)
    // And the owner still can, so the zero-rows above is isolation, not a bug.
    expect((await transition(merchantB, pid(102), 'ACCEPTED', ACTOR_B)).rows[0].transitioned).toBe(true)
  })

  it('a merchant’s own order lists only their own', async () => {
    await makeOrder(pid(103), merchantA, productA, pid(11))
    await makeOrder(pid(104), merchantB, productB, pid(12))

    const mine = await db.query(
      `SELECT public_id FROM business_orders WHERE merchant_id = $1 ORDER BY created_at DESC, public_id DESC`,
      [merchantA]
    )
    expect(mine.rows.map((r) => r.public_id)).toEqual([pid(103)])
  })

  it('the function is closed to anon and authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      const code = await asRole(
        role,
        `SELECT fn_business_transition_order('${merchantA}'::uuid, '${pid(103)}', 'ACCEPTED', '${ACTOR_A}', 'r')`
      )
      expect(code, role).toBe('42501')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('accept', () => {
  it('PENDING → ACCEPTED succeeds and writes exactly one history row', async () => {
    await makeOrder(pid(200), merchantA, productA, pid(11))
    const { rows } = await transition(merchantA, pid(200), 'ACCEPTED', ACTOR_A)

    expect(rows[0].transitioned).toBe(true)
    expect(rows[0].status).toBe('ACCEPTED')
    expect(await statusOf(pid(200))).toBe('ACCEPTED')

    const history = await historyOf(pid(200))
    expect(history).toHaveLength(2) // creation + this transition
    expect(history[1]).toMatchObject({
      from_status: 'PENDING',
      to_status: 'ACCEPTED',
      actor_type: 'MERCHANT',
      actor_id: ACTOR_A,
      reason: 'MERCHANT_ACCEPTED',
    })
  })

  it('🔑 an already-ACCEPTED order does not transition again', async () => {
    await makeOrder(pid(201), merchantA, productA, pid(11))
    await transition(merchantA, pid(201), 'ACCEPTED', ACTOR_A)
    const again = await transition(merchantA, pid(201), 'ACCEPTED', ACTOR_A)

    expect(again.rows[0].transitioned).toBe(false)
    expect(again.rows[0].status).toBe('ACCEPTED')
    // 🔑 No second history row. A retry must not leave a trail claiming the
    // order was accepted twice.
    expect(await historyOf(pid(201))).toHaveLength(2)
  })

  it('🔑 a REJECTED order cannot be accepted', async () => {
    await makeOrder(pid(202), merchantA, productA, pid(11))
    await transition(merchantA, pid(202), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')
    const late = await transition(merchantA, pid(202), 'ACCEPTED', ACTOR_A)

    expect(late.rows[0].transitioned).toBe(false)
    expect(late.rows[0].status).toBe('REJECTED')
    expect(await statusOf(pid(202))).toBe('REJECTED')
    expect(await historyOf(pid(202))).toHaveLength(2)
  })

  it('the actor is whatever the caller resolved from the session, and is recorded', async () => {
    await makeOrder(pid(203), merchantA, productA, pid(11))
    await transition(merchantA, pid(203), 'ACCEPTED', ACTOR_A)
    const history = await historyOf(pid(203))
    expect(history[1].actor_id).toBe(ACTOR_A)
    expect(history[1].actor_type).toBe('MERCHANT')
  })

  it('refuses an illegal target status outright', async () => {
    await makeOrder(pid(204), merchantA, productA, pid(11))
    // Not a business outcome — a caller bug. It raises rather than returning a
    // polite false that could be mistaken for "already terminal".
    for (const bad of ['PENDING', 'COMPLETED', 'DELIVERED', 'accepted']) {
      const code = await attempt(
        `SELECT fn_business_transition_order($1::uuid,$2,$3,$4,'r')`,
        [merchantA, pid(204), bad, ACTOR_A]
      )
      expect(code, bad).toBe('23514')
    }
    expect(await statusOf(pid(204))).toBe('PENDING')
  })

  it('refuses a transition with no reason', async () => {
    await makeOrder(pid(205), merchantA, productA, pid(11))
    expect(
      await attempt(`SELECT fn_business_transition_order($1::uuid,$2,'ACCEPTED',$3,'  ')`, [
        merchantA,
        pid(205),
        ACTOR_A,
      ])
    ).toBe('23514')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('reject', () => {
  it('PENDING → REJECTED succeeds and writes exactly one history row', async () => {
    await makeOrder(pid(300), merchantA, productA, pid(11))
    const { rows } = await transition(
      merchantA, pid(300), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED:OUT_OF_STOCK'
    )

    expect(rows[0].transitioned).toBe(true)
    const history = await historyOf(pid(300))
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      from_status: 'PENDING',
      to_status: 'REJECTED',
      actor_type: 'MERCHANT',
      reason: 'MERCHANT_REJECTED:OUT_OF_STOCK',
    })
  })

  it('🔑 an ACCEPTED order cannot be rejected', async () => {
    await makeOrder(pid(301), merchantA, productA, pid(11))
    await transition(merchantA, pid(301), 'ACCEPTED', ACTOR_A)
    const late = await transition(merchantA, pid(301), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')

    expect(late.rows[0].transitioned).toBe(false)
    expect(late.rows[0].status).toBe('ACCEPTED')
    expect(await historyOf(pid(301))).toHaveLength(2)
  })

  it('🔑 an already-REJECTED order does not transition again', async () => {
    await makeOrder(pid(302), merchantA, productA, pid(11))
    await transition(merchantA, pid(302), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')
    const again = await transition(merchantA, pid(302), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')

    expect(again.rows[0].transitioned).toBe(false)
    expect(await historyOf(pid(302))).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('concurrency — two sessions, a real row lock', () => {
  /**
   * Run `first` inside an open transaction on `db`, then start `second` on the
   * other connection while the lock is still held, then commit.
   *
   * This is a deterministic interleaving, not a hopeful one: `second` cannot
   * proceed until the COMMIT releases the row.
   */
  async function interleave(
    publicId: string,
    firstTo: string,
    secondTo: string
  ): Promise<{ first: Outcome; second: Outcome }> {
    await db.query('BEGIN')
    let first: Outcome
    let pending: ReturnType<typeof transition>
    try {
      first = (await transition(merchantA, publicId, firstTo, ACTOR_A, `M_${firstTo}`, db)).rows[0]
      // Starts, blocks on the lock, and only completes after the COMMIT below.
      pending = transition(merchantA, publicId, secondTo, ACTOR_A, `M_${secondTo}`, other)
      await new Promise((r) => setTimeout(r, 120))
    } finally {
      // Always ends the transaction. Leaving it open would block the next test
      // on the same row and report a timeout instead of the real failure.
      await db.query('COMMIT').catch(() => db.query('ROLLBACK').catch(() => {}))
    }
    return { first, second: (await pending).rows[0] }
  }

  it('🔑 accept vs accept — exactly one transitions', async () => {
    await makeOrder(pid(400), merchantA, productA, pid(11))
    const { first, second } = await interleave(pid(400), 'ACCEPTED', 'ACCEPTED')

    expect(first.transitioned).toBe(true)
    expect(second.transitioned).toBe(false)
    expect(second.status).toBe('ACCEPTED')
    expect(await statusOf(pid(400))).toBe('ACCEPTED')
    // One creation row plus ONE transition. Not two.
    expect(await historyOf(pid(400))).toHaveLength(2)
  })

  it('🔑 reject vs reject — exactly one transitions', async () => {
    await makeOrder(pid(401), merchantA, productA, pid(11))
    const { first, second } = await interleave(pid(401), 'REJECTED', 'REJECTED')

    expect(first.transitioned).toBe(true)
    expect(second.transitioned).toBe(false)
    expect(await historyOf(pid(401))).toHaveLength(2)
  })

  it('🔑 accept vs reject — one terminal state, no contradictory history', async () => {
    await makeOrder(pid(402), merchantA, productA, pid(11))
    const { first, second } = await interleave(pid(402), 'ACCEPTED', 'REJECTED')

    expect(first.transitioned).toBe(true)
    expect(second.transitioned).toBe(false)
    expect(second.status).toBe('ACCEPTED')
    expect(await statusOf(pid(402))).toBe('ACCEPTED')

    const history = await historyOf(pid(402))
    expect(history).toHaveLength(2)
    // The losing side wrote nothing at all — no "PENDING → REJECTED" sitting
    // beside a "PENDING → ACCEPTED" for the same order.
    expect(history.filter((h) => h.to_status === 'REJECTED')).toHaveLength(0)
  })

  it('🔑 reject vs accept — the same, in the other order', async () => {
    await makeOrder(pid(403), merchantA, productA, pid(11))
    const { first, second } = await interleave(pid(403), 'REJECTED', 'ACCEPTED')

    expect(first.transitioned).toBe(true)
    expect(second.transitioned).toBe(false)
    expect(await statusOf(pid(403))).toBe('REJECTED')
    expect(await historyOf(pid(403))).toHaveLength(2)
  })

  it('🔑 a rolled-back transition leaves NO partial state', async () => {
    await makeOrder(pid(404), merchantA, productA, pid(11))
    await db.query('BEGIN')
    await transition(merchantA, pid(404), 'ACCEPTED', ACTOR_A)
    await db.query('ROLLBACK')

    // The status change and its history row are one unit: both or neither.
    expect(await statusOf(pid(404))).toBe('PENDING')
    expect(await historyOf(pid(404))).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('the expiry race', () => {
  const expire = (publicId: string) =>
    db.query(
      `UPDATE business_orders SET created_at = now() - interval '80 hours',
                                  expires_at = now() - interval '8 hours'
        WHERE public_id = $1`,
      [publicId]
    )

  it('🔑 expiry cannot reject an already ACCEPTED order', async () => {
    await makeOrder(pid(500), merchantA, productA, pid(11))
    await transition(merchantA, pid(500), 'ACCEPTED', ACTOR_A)
    await expire(pid(500))

    const closed = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`
    )
    // The expiry job's UPDATE carries `status = 'PENDING'`, so an accepted
    // order is simply not among the rows it matches.
    expect(closed.fn_business_expire_orders).toBe(0)
    expect(await statusOf(pid(500))).toBe('ACCEPTED')
    expect(await historyOf(pid(500))).toHaveLength(2)
  })

  it('🔑 expiry cannot alter an already REJECTED order', async () => {
    await makeOrder(pid(501), merchantA, productA, pid(11))
    await transition(merchantA, pid(501), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')
    await expire(pid(501))

    expect(
      (await one<{ fn_business_expire_orders: number }>(`SELECT fn_business_expire_orders(500)`))
        .fn_business_expire_orders
    ).toBe(0)
    // Still the merchant's rejection, not the system's — the history must not
    // gain a second, contradictory account of why the order closed.
    const history = await historyOf(pid(501))
    expect(history).toHaveLength(2)
    expect(history[1].actor_type).toBe('MERCHANT')
  })

  it('🔑 a merchant accepting after expiry has already run is refused', async () => {
    await makeOrder(pid(502), merchantA, productA, pid(11))
    await expire(pid(502))
    await db.query(`SELECT fn_business_expire_orders(500)`)

    const late = await transition(merchantA, pid(502), 'ACCEPTED', ACTOR_A)
    expect(late.rows[0].transitioned).toBe(false)
    expect(late.rows[0].status).toBe('REJECTED')
    expect(await statusOf(pid(502))).toBe('REJECTED')
    // The SYSTEM row stands alone; the merchant's late attempt wrote nothing.
    const history = await historyOf(pid(502))
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({ actor_type: 'SYSTEM', reason: 'EXPIRED' })
  })

  it('🔑 expiry skips a row a merchant is holding, rather than blocking on it', async () => {
    await makeOrder(pid(503), merchantA, productA, pid(11))
    await expire(pid(503))

    await db.query('BEGIN')
    await transition(merchantA, pid(503), 'ACCEPTED', ACTOR_A)
    // `FOR UPDATE SKIP LOCKED` in the expiry function: it passes over the
    // locked row instead of waiting, so a slow merchant cannot stall the job.
    const closed = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`,
      [],
      other
    )
    expect(closed.fn_business_expire_orders).toBe(0)
    await db.query('COMMIT')

    expect(await statusOf(pid(503))).toBe('ACCEPTED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('integrity — P0/P2.1 invariants survive P3', () => {
  it('🔑 accepting does not touch the item, its snapshots or the totals', async () => {
    await makeOrder(pid(600), merchantA, productA, pid(11))
    const before = await one<{ whole: string }>(
      `SELECT business_order_items::text AS whole FROM business_order_items`
    )
    const totalsBefore = await one<{ total_amount: string; total_items: number }>(
      `SELECT total_amount, total_items FROM business_orders WHERE public_id = $1`,
      [pid(600)]
    )

    await transition(merchantA, pid(600), 'ACCEPTED', ACTOR_A)

    const after = await one<{ whole: string }>(
      `SELECT business_order_items::text AS whole FROM business_order_items`
    )
    const totalsAfter = await one<{ total_amount: string; total_items: number }>(
      `SELECT total_amount, total_items FROM business_orders WHERE public_id = $1`,
      [pid(600)]
    )
    expect(after.whole).toBe(before.whole)
    expect(totalsAfter).toEqual(totalsBefore)
  })

  it('🔑 a terminal order still refuses a new item', async () => {
    await makeOrder(pid(601), merchantA, productA, pid(11))
    await transition(merchantA, pid(601), 'ACCEPTED', ACTOR_A)
    const orderId = (
      await one<{ id: string }>(`SELECT id FROM business_orders WHERE public_id=$1`, [pid(601)])
    ).id

    expect(
      await attempt(
        `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES ($1,$2,$3,$4,'sneaked in',1000,1,1000)`,
        [orderId, productA, merchantA, pid(11)]
      )
    ).toBe('23514')
  })

  it('🔑 a later product change still does not alter the accepted order', async () => {
    await makeOrder(pid(602), merchantA, productA, pid(11))
    await transition(merchantA, pid(602), 'ACCEPTED', ACTOR_A)
    await db.query(`UPDATE business_products SET name='Renamed', price_amount=999999 WHERE id=$1`, [
      productA,
    ])

    const item = await one<{ product_name_snapshot: string; unit_price_amount: string }>(
      `SELECT product_name_snapshot, unit_price_amount FROM business_order_items LIMIT 1`
    )
    expect(item.product_name_snapshot).toBe('Áo thun cotton')
    expect(item.unit_price_amount).toBe('45000')

    await db.query(`UPDATE business_products SET name='Áo thun cotton', price_amount=45000 WHERE id=$1`, [
      productA,
    ])
  })

  it('🔑 the customer snapshots are untouched by a transition', async () => {
    await makeOrder(pid(603), merchantA, productA, pid(11))
    await transition(merchantA, pid(603), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')

    const order = await one<{ customer_name: string; customer_phone: string; customer_address: string }>(
      `SELECT customer_name, customer_phone, customer_address FROM business_orders WHERE public_id=$1`,
      [pid(603)]
    )
    expect(order).toEqual({
      customer_name: 'Nguyễn Thị Lan',
      customer_phone: '0901234567',
      customer_address: '128 Nguyễn Văn Cừ, Q5',
    })
  })

  it('history remains append-only — service_role holds no UPDATE or DELETE', async () => {
    await makeOrder(pid(604), merchantA, productA, pid(11))
    await transition(merchantA, pid(604), 'ACCEPTED', ACTOR_A)

    expect(
      await asRole('service_role', `UPDATE business_order_status_history SET reason = 'rewritten'`)
    ).toBe('42501')
    expect(await asRole('service_role', `DELETE FROM business_order_status_history`)).toBe('42501')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('public tracking still reflects the final state (P2.2 regression)', () => {
  it('🔑 an accepted order tracks as ACCEPTED by its token, and a rejected one as REJECTED', async () => {
    const token = randomBytes(32).toString('base64url')
    await db.query(
      `SELECT fn_business_create_order($1, $2::uuid, $3::bytea, 'Nguyễn Thị Lan', '0901234567',
         '128 Nguyễn Văn Cừ, Q5', NULL, 'DIRECT', NULL, now() + interval '72 hours',
         $4::uuid, $5, 'Áo thun cotton', 45000::bigint, 2::integer, '[]'::jsonb)`,
      [pid(700), merchantA, hashOf(token), productA, pid(11)]
    )

    const byToken = () =>
      one<{ status: string }>(
        `SELECT status FROM business_orders WHERE tracking_token_hash = $1::bytea`,
        [hashOf(token)]
      )

    expect((await byToken()).status).toBe('PENDING')
    await transition(merchantA, pid(700), 'ACCEPTED', ACTOR_A)
    expect((await byToken()).status).toBe('ACCEPTED')
  })

  it('the tracking token is unchanged by a transition', async () => {
    const token = randomBytes(32).toString('base64url')
    await db.query(
      `SELECT fn_business_create_order($1, $2::uuid, $3::bytea, 'x', '0901234567', 'y',
         NULL, 'DIRECT', NULL, now() + interval '72 hours',
         $4::uuid, $5, 'Áo thun cotton', 45000::bigint, 1::integer, '[]'::jsonb)`,
      [pid(701), merchantA, hashOf(token), productA, pid(11)]
    )
    await transition(merchantA, pid(701), 'REJECTED', ACTOR_A, 'MERCHANT_REJECTED')

    // A customer's link must keep working after the merchant answers — that is
    // when they most need to read the outcome.
    const found = await one<{ status: string }>(
      `SELECT status FROM business_orders WHERE tracking_token_hash = $1::bytea`,
      [hashOf(token)]
    )
    expect(found.status).toBe('REJECTED')
  })
})
