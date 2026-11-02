import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Tappy Business — P2.1 order invariants, against a real PostgreSQL 17.
//
// The four invariants this migration adds are all things the APPLICATION could
// also check, and that is exactly why they are here instead: an application
// check is skipped by the next code path someone writes, and the totals on an
// order are the number a customer reads.
//
//   1. an item cannot join an order that has reached a terminal state
//   2. total_amount / total_items must equal the sums over the items
//   3. expires_at must be after created_at
//   4. MVP is VND only
//
// Plus the reason `fn_business_create_order` exists at all: the order, its item
// and its opening history row are ONE transaction, so a failure anywhere leaves
// no order rather than half of one.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const P0 = readFileSync(join(REPO, 'supabase/migrations/20260908_tappy_business_p0.sql'), 'utf8')
const P2 = readFileSync(
  join(REPO, 'supabase/migrations/20260909_tappy_business_p2_order_invariants.sql'),
  'utf8'
)

// 54377 belongs to phase6_messenger (V3); unique per suite, see portAllocation.test.ts
const PORT = 54312

const pid = (n: number) => String(n).padStart(26, '0')
const HASH = (seed: string) => `decode(repeat('${seed}',32),'hex')`

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
let dataDir: string
let merchantA: string
let merchantB: string
let productA: string
let productB: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

async function attempt(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params)
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

/** Call the creation function the way the repository does. */
const createOrder = (over: Partial<Record<string, unknown>> = {}) => {
  const args = {
    order: pid(100 + Math.floor(Math.random() * 800000)),
    merchant: merchantA,
    hash: null as string | null,
    quantity: 2,
    unit: 45000,
    product: productA,
    productPublic: pid(11),
    options: JSON.stringify([{ group: 'Màu', value: 'Đỏ' }]),
    expires: "now() + interval '72 hours'",
    ...over,
  }
  return db.query(
    `SELECT * FROM fn_business_create_order(
       $1, $2::uuid, ${args.hash ?? HASH('ab')}, 'Nguyễn Thị Lan', '0901234567',
       '128 Nguyễn Văn Cừ, Q5', NULL, 'DIRECT', NULL, ${args.expires},
       $3::uuid, $4, 'Áo thun cotton', $5::bigint, $6::integer, $7::jsonb)`,
    [args.order, args.merchant, args.product, args.productPublic, args.unit, args.quantity, args.options]
  )
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-tbp2-'))
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
  await db.query(P0)
  await db.query(P2)

  merchantA = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, gen_random_uuid(), 'CAFE', 'Lan Shop', 'x', '1') RETURNING id`,
      [pid(1)]
    )
  ).id
  merchantB = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, gen_random_uuid(), 'FASHION', 'Bao Shop', 'y', '2') RETURNING id`,
      [pid(2)]
    )
  ).id
  productA = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1, $2, 'Áo thun cotton', 45000) RETURNING id`,
      [pid(11), merchantA]
    )
  ).id
  productB = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1, $2, 'Quần jean', 250000) RETURNING id`,
      [pid(12), merchantB]
    )
  ).id
}, 180_000)

/** Each test starts with no orders. Children first — every FK is RESTRICT. */
beforeEach(async () => {
  await db.query('DELETE FROM business_order_status_history')
  await db.query('DELETE FROM business_order_items')
  await db.query('DELETE FROM business_orders')
})

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
    /* windows file lock */
  }
})

describe('fn_business_create_order writes three rows as one transaction', () => {
  it('creates the order, its item and its opening history row', async () => {
    const { rows } = await createOrder()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('PENDING')
    // 45000 × 2 — integer đồng, computed by the function, not by the caller.
    expect(rows[0].total_amount).toBe('90000')
    expect(rows[0].total_items).toBe(2)

    const items = await db.query(`SELECT * FROM business_order_items`)
    expect(items.rows).toHaveLength(1)
    expect(items.rows[0].line_total_amount).toBe('90000')
    expect(items.rows[0].product_name_snapshot).toBe('Áo thun cotton')

    const history = await db.query(`SELECT * FROM business_order_status_history`)
    expect(history.rows).toHaveLength(1)
    expect(history.rows[0].from_status).toBeNull()
    expect(history.rows[0].to_status).toBe('PENDING')
    expect(history.rows[0].actor_type).toBe('CUSTOMER')
  })

  it('🔑 leaves NOTHING behind when any part fails', async () => {
    // A cross-merchant item: merchant A's order, merchant B's product. The
    // composite foreign key rejects the item, and the order must go with it —
    // an order row with no item is the state that could never be repaired.
    const code = await attempt(
      `SELECT * FROM fn_business_create_order(
         $1, $2::uuid, ${HASH('cd')}, 'x','1','y', NULL, 'DIRECT', NULL, now() + interval '72 hours',
         $3::uuid, $4, 'Quần jean', 250000::bigint, 1::integer, '[]'::jsonb)`,
      [pid(200), merchantA, productB, pid(12)]
    )
    expect(code).toBe('23503')

    expect((await db.query(`SELECT * FROM business_orders`)).rows).toHaveLength(0)
    expect((await db.query(`SELECT * FROM business_order_items`)).rows).toHaveLength(0)
    expect((await db.query(`SELECT * FROM business_order_status_history`)).rows).toHaveLength(0)
  })

  it('is closed to anon and authenticated, open to service_role (ADR-019)', async () => {
    const sql = `SELECT fn_business_create_order($1,$2::uuid,${HASH('ef')},'x','1','y',NULL,'DIRECT',NULL,
      now() + interval '72 hours',$3::uuid,$4,'n',1::bigint,1::integer,'[]'::jsonb)`
    for (const role of ['anon', 'authenticated']) {
      const code = await asRole(
        role,
        sql.replace('$1', `'${pid(301)}'`).replace('$2', `'${merchantA}'`)
           .replace('$3', `'${productA}'`).replace('$4', `'${pid(11)}'`)
      )
      expect(code, role).toBe('42501')
    }
    expect(
      await one<{ p: boolean }>(
        `SELECT has_function_privilege('service_role', p.oid, 'EXECUTE') AS p
           FROM pg_proc p WHERE p.proname = 'fn_business_create_order'`
      )
    ).toEqual({ p: true })
  })
})

describe('deferred finding 1 — items cannot join a terminal order', () => {
  it('🔑 refuses an item once the order is ACCEPTED or REJECTED', async () => {
    for (const terminal of ['ACCEPTED', 'REJECTED']) {
      await db.query('DELETE FROM business_order_status_history')
      await db.query('DELETE FROM business_order_items')
      await db.query('DELETE FROM business_orders')
      await createOrder()
      const orderId = (await one<{ id: string }>(`SELECT id FROM business_orders LIMIT 1`)).id
      // Totals are updated with the status so the deferred totals trigger is
      // satisfied by the state this test is actually about.
      await db.query(`UPDATE business_orders SET status=$2 WHERE id=$1`, [orderId, terminal])

      const code = await attempt(
        `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES ($1,$2,$3,$4,'sneaked in',1000,1,1000)`,
        [orderId, productA, merchantA, pid(11)]
      )
      // Adding to an accepted order would change what the merchant agreed to,
      // after they agreed to it.
      expect(code, terminal).toBe('23514')
    }
  })

  it('still allows an item while the order is PENDING', async () => {
    await createOrder()
    const orderId = (await one<{ id: string }>(`SELECT id FROM business_orders LIMIT 1`)).id
    const code = await attempt(
      `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
         product_name_snapshot, unit_price_amount, quantity, line_total_amount)
       VALUES ($1,$2,$3,$4,'second line',1000,1,1000)`,
      [orderId, productA, merchantA, pid(11)]
    )
    // The schema supports many items (P0 §15); only the UI creates one.
    expect(code).toBeNull()
  })
})

describe('deferred finding 2 — totals must equal the items', () => {
  it('🔑 rejects an order whose total_amount disagrees with its item', async () => {
    const code = await attempt(
      `DO $$
       DECLARE v_order UUID;
       BEGIN
         INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, expires_at)
         VALUES ('${pid(400)}', '${merchantA}', ${HASH('11')}, 'x','1','y',
                 999999, 2, now() + interval '72 hours')
         RETURNING id INTO v_order;
         INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES (v_order, '${productA}', '${merchantA}', '${pid(11)}', 'n', 45000, 2, 90000);
       END $$;`
    )
    expect(code).toBe('23514')
  })

  it('🔑 rejects an order whose total_items disagrees with its item', async () => {
    const code = await attempt(
      `DO $$
       DECLARE v_order UUID;
       BEGIN
         INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, expires_at)
         VALUES ('${pid(401)}', '${merchantA}', ${HASH('22')}, 'x','1','y',
                 90000, 7, now() + interval '72 hours')
         RETURNING id INTO v_order;
         INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES (v_order, '${productA}', '${merchantA}', '${pid(11)}', 'n', 45000, 2, 90000);
       END $$;`
    )
    expect(code).toBe('23514')
  })

  it('🔑 rejects an order with NO items at all', async () => {
    // Only a deferred check can see this: at INSERT time every order has zero
    // items, so an immediate constraint would reject every legitimate order.
    const code = await attempt(
      `INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
         customer_phone, customer_address, total_amount, total_items, expires_at)
       VALUES ($1, $2, ${HASH('33')}, 'x','1','y', 1000, 1, now() + interval '72 hours')`,
      [pid(402), merchantA]
    )
    expect(code).toBe('23514')
    expect((await db.query(`SELECT * FROM business_orders`)).rows).toHaveLength(0)
  })

  it('accepts totals that match, including a multi-item order', async () => {
    const code = await attempt(
      `DO $$
       DECLARE v_order UUID;
       BEGIN
         INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, expires_at)
         VALUES ('${pid(403)}', '${merchantA}', ${HASH('44')}, 'x','1','y',
                 92000, 3, now() + interval '72 hours')
         RETURNING id INTO v_order;
         INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES (v_order, '${productA}', '${merchantA}', '${pid(11)}', 'a', 45000, 2, 90000),
                (v_order, '${productA}', '${merchantA}', '${pid(11)}', 'b', 2000, 1, 2000);
       END $$;`
    )
    expect(code).toBeNull()
  })
})

describe('deferred findings 3 and 4 — expiry and currency', () => {
  it('🔑 refuses an order that expires before it was created', async () => {
    const code = await attempt(
      `INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
         customer_phone, customer_address, total_amount, total_items, expires_at)
       VALUES ($1, $2, ${HASH('55')}, 'x','1','y', 1000, 1, now() - interval '1 hour')`,
      [pid(500), merchantA]
    )
    expect(code).toBe('23514')
  })

  it('🔑 refuses a currency other than VND on every money-bearing table', async () => {
    expect(
      await attempt(
        `INSERT INTO business_products (public_id, merchant_id, name, price_amount, currency)
         VALUES ($1,$2,'x',1,'USD')`,
        [pid(501), merchantA]
      )
    ).toBe('23514')

    expect(
      await attempt(
        `INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, currency, expires_at)
         VALUES ($1,$2,${HASH('66')},'x','1','y',1000,1,'USD', now() + interval '1 hour')`,
        [pid(502), merchantA]
      )
    ).toBe('23514')
  })

  it('still accepts VND, so the constraint is not simply blocking everything', async () => {
    const { rows } = await createOrder()
    expect(rows[0].status).toBe('PENDING')
  })
})

describe('what the order snapshots, and what it stops depending on', () => {
  it('🔑 a later product change does not alter the order', async () => {
    await createOrder()
    await db.query(`UPDATE business_products SET name='Renamed', price_amount=999999 WHERE id=$1`, [
      productA,
    ])

    const item = await one<{ product_name_snapshot: string; unit_price_amount: string }>(
      `SELECT product_name_snapshot, unit_price_amount FROM business_order_items LIMIT 1`
    )
    expect(item.product_name_snapshot).toBe('Áo thun cotton')
    expect(item.unit_price_amount).toBe('45000')

    const order = await one<{ total_amount: string }>(`SELECT total_amount FROM business_orders LIMIT 1`)
    expect(order.total_amount).toBe('90000')

    await db.query(`UPDATE business_products SET name='Áo thun cotton', price_amount=45000 WHERE id=$1`, [
      productA,
    ])
  })

  it('🔑 the options snapshot cannot be edited afterwards', async () => {
    await createOrder()
    // service_role holds no UPDATE on order items (P0), so the snapshot is
    // immutable by privilege, not by convention.
    expect(
      await asRole('service_role', `UPDATE business_order_items SET selected_options_snapshot='[]'::jsonb`)
    ).toBe('42501')
  })

  it('stores the option snapshot the customer chose', async () => {
    await createOrder()
    const item = await one<{ selected_options_snapshot: unknown }>(
      `SELECT selected_options_snapshot FROM business_order_items LIMIT 1`
    )
    expect(item.selected_options_snapshot).toEqual([{ group: 'Màu', value: 'Đỏ' }])
  })

  it('the tracking token hash is unique, so a collision cannot be written', async () => {
    await createOrder()
    // Two orders sharing a token would make one customer's link open the
    // other's order. 256 random bits make this unreachable; the constraint is
    // what makes it impossible rather than merely unlikely.
    const code = await attempt(
      `SELECT fn_business_create_order($1,$2::uuid,${HASH('ab')},'x','1','y',NULL,'DIRECT',NULL,
         now() + interval '72 hours',$3::uuid,$4,'n',1::bigint,1::integer,'[]'::jsonb)`,
      [pid(600), merchantA, productA, pid(11)]
    )
    expect(code).toBe('23505')
  })
})

describe('expiry — PENDING becomes REJECTED after 72 hours', () => {
  /** An order already past its expiry, written with the clock rolled back. */
  const expiredOrder = async (publicId: string) => {
    await createOrder({ order: publicId, expires: "now() + interval '1 second'" })
    // Move it into the past. `expires_at > created_at` still holds, so this
    // exercises expiry rather than the constraint.
    await db.query(
      `UPDATE business_orders SET created_at = now() - interval '80 hours',
                                  expires_at = now() - interval '8 hours'
       WHERE public_id = $1`,
      [publicId]
    )
  }

  it('🔑 closes an expired PENDING order as REJECTED by SYSTEM', async () => {
    await expiredOrder(pid(700))
    const count = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`
    )
    expect(count.fn_business_expire_orders).toBe(1)

    const order = await one<{ status: string }>(`SELECT status FROM business_orders LIMIT 1`)
    expect(order.status).toBe('REJECTED')

    const history = await db.query(
      `SELECT from_status, to_status, actor_type, reason FROM business_order_status_history
        WHERE to_status = 'REJECTED'`
    )
    expect(history.rows).toHaveLength(1)
    expect(history.rows[0]).toMatchObject({
      from_status: 'PENDING',
      to_status: 'REJECTED',
      actor_type: 'SYSTEM',
      reason: 'EXPIRED',
    })
  })

  it('leaves an order that has not expired alone', async () => {
    await createOrder({ order: pid(701) })
    const count = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`
    )
    expect(count.fn_business_expire_orders).toBe(0)
    expect((await one<{ status: string }>(`SELECT status FROM business_orders LIMIT 1`)).status).toBe(
      'PENDING'
    )
  })

  it('🔑 is idempotent — a second run changes nothing and writes no second history row', async () => {
    await expiredOrder(pid(702))
    await db.query(`SELECT fn_business_expire_orders(500)`)
    const again = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`
    )
    expect(again.fn_business_expire_orders).toBe(0)

    const rejected = await db.query(
      `SELECT 1 FROM business_order_status_history WHERE to_status = 'REJECTED'`
    )
    expect(rejected.rows).toHaveLength(1)
  })

  it('🔑 cannot reject an order a merchant already accepted', async () => {
    // The race this guards: the merchant accepts at hour 71:59 while the job
    // runs. `WHERE status = 'PENDING'` is part of the UPDATE, so the job matches
    // nothing rather than rejecting an accepted order out from under them.
    await expiredOrder(pid(703))
    await db.query(`UPDATE business_orders SET status = 'ACCEPTED'`)

    const count = await one<{ fn_business_expire_orders: number }>(
      `SELECT fn_business_expire_orders(500)`
    )
    expect(count.fn_business_expire_orders).toBe(0)
    expect((await one<{ status: string }>(`SELECT status FROM business_orders LIMIT 1`)).status).toBe(
      'ACCEPTED'
    )
  })

  it('is closed to anon and authenticated', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await asRole(role, `SELECT fn_business_expire_orders(1)`), role).toBe('42501')
    }
  })
})

describe('P2.2 — tracking token lookup', () => {
  /** Exactly what src/lib/business/tracking.ts produces. */
  const mintToken = () => randomBytes(32).toString('base64url')
  // PostgREST/pg take bytea as a hex escape: a literal backslash, then `x`.
  // `String.raw` so the backslash is not a JS escape sequence.
  const hashOf = (token: string) =>
    String.raw`\x` + createHash('sha256').update(token, 'utf8').digest('hex')

  /** Create an order whose tracking token we know, the way the route does. */
  async function orderWithToken(publicId: string) {
    const token = mintToken()
    await db.query(
      `SELECT fn_business_create_order($1, $2::uuid, $3::bytea, 'Nguyễn Thị Lan', '0901234567',
         '128 Nguyễn Văn Cừ, Q5', NULL, 'DIRECT', NULL, now() + interval '72 hours',
         $4::uuid, $5, 'Áo thun cotton', 45000::bigint, 2::integer, '[]'::jsonb)`,
      [publicId, merchantA, hashOf(token), productA, pid(11)]
    )
    return token
  }

  const lookup = (token: string) =>
    db.query(
      `SELECT public_id, status FROM business_orders WHERE tracking_token_hash = $1::bytea`,
      [hashOf(token)]
    )

  it('🔑 a valid token resolves exactly its own order', async () => {
    const token = await orderWithToken(pid(800))
    const { rows } = await lookup(token)
    expect(rows).toHaveLength(1)
    expect(rows[0].public_id).toBe(pid(800))
    expect(rows[0].status).toBe('PENDING')
  })

  it('🔑 order A’s token cannot reach order B', async () => {
    const tokenA = await orderWithToken(pid(801))
    const tokenB = await orderWithToken(pid(802))

    expect((await lookup(tokenA)).rows[0].public_id).toBe(pid(801))
    expect((await lookup(tokenB)).rows[0].public_id).toBe(pid(802))
    // Each digest is unique to one row. There is no shared prefix to exploit:
    // the column is compared whole, by a UNIQUE index.
    expect((await lookup(tokenA)).rows[0].public_id).not.toBe(pid(802))
  })

  it('🔑 an unknown token matches nothing — no partial match to observe', async () => {
    await orderWithToken(pid(803))
    expect((await lookup(mintToken())).rows).toHaveLength(0)
  })

  it('🔑 the RAW token is absent from every column of the stored order', async () => {
    const token = await orderWithToken(pid(804))
    // Cast the whole row to text and search it. If the token were stored
    // anywhere — a note field, an audit column added later — this finds it.
    const { rows } = await db.query(
      `SELECT business_orders::text AS whole FROM business_orders WHERE public_id = $1`,
      [pid(804)]
    )
    expect(rows[0].whole).not.toContain(token)

    const history = await db.query(`SELECT business_order_status_history::text AS whole
                                      FROM business_order_status_history`)
    for (const r of history.rows) expect(r.whole).not.toContain(token)

    const items = await db.query(`SELECT business_order_items::text AS whole FROM business_order_items`)
    for (const r of items.rows) expect(r.whole).not.toContain(token)
  })

  it('the stored value is a 32-byte digest, not the token', async () => {
    const token = await orderWithToken(pid(805))
    const { rows } = await db.query(
      `SELECT octet_length(tracking_token_hash) AS len FROM business_orders WHERE public_id = $1`,
      [pid(805)]
    )
    expect(rows[0].len).toBe(32)
    expect(token.length).toBe(43)
  })

  it('🔑 tracking works across all three states, and only those three', async () => {
    const token = await orderWithToken(pid(806))
    expect((await lookup(token)).rows[0].status).toBe('PENDING')

    await db.query(`UPDATE business_orders SET status='ACCEPTED' WHERE public_id=$1`, [pid(806)])
    expect((await lookup(token)).rows[0].status).toBe('ACCEPTED')

    await db.query(`UPDATE business_orders SET status='REJECTED' WHERE public_id=$1`, [pid(806)])
    expect((await lookup(token)).rows[0].status).toBe('REJECTED')

    // The token keeps working after a terminal state — a customer must still be
    // able to read the outcome.
    expect((await lookup(token)).rows).toHaveLength(1)
  })

  it('🔑 an expired PENDING order tracks as REJECTED after expiry processing', async () => {
    const token = await orderWithToken(pid(807))
    await db.query(
      `UPDATE business_orders SET created_at = now() - interval '80 hours',
                                  expires_at = now() - interval '8 hours'
        WHERE public_id = $1`,
      [pid(807)]
    )
    await db.query(`SELECT fn_business_expire_orders(500)`)

    expect((await lookup(token)).rows[0].status).toBe('REJECTED')
  })

  it('🔑 the phone is not a way in — no index exists to make one efficient', async () => {
    await orderWithToken(pid(808))
    const { rows } = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename='business_orders'`
    )
    expect(rows.filter((r) => /customer_phone/i.test(r.indexdef))).toEqual([])
  })
})
