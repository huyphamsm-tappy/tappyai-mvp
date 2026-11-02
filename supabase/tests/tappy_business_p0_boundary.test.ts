import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Tappy Business — P0 schema boundary, against a real PostgreSQL 17.
//
// CONTRACT
//   docs/tappy-business/PHASE_0_ARCHITECTURE.md   §5 ERD · §6 state machine ·
//                                                §8 security · §9 migration
//   ADR-019                                      the Supabase grant model
//
// 🔑 WHY THIS SUITE IS THE LOAD-BEARING ONE.
//
// Every Business table grants privileges to `service_role` alone, with RLS
// enabled and no policies. There is no RLS policy behind the application, so
// two things carry the security of the whole capability: the grants, and
// src/lib/business/authz.ts. The grants are SQL, and SQL is only proven by
// executing it — a migration can say `REVOKE` and still leave a table open,
// which is precisely the production incident ADR-019 records.
//
// So nothing here is a text assertion. The migration is applied to a real
// database and the privileges are read back from PostgreSQL's own catalogue.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260908_tappy_business_p0.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

// 54375 belongs to chat_messaging_boundary (V3); unique per suite, see portAllocation.test.ts
const PORT = 54311

const MERCHANT_PUBLIC = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const PRODUCT_PUBLIC = '01BX5ZZKBKACTAV9WEVGEMMVRZ'
const ORDER_PUBLIC = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const MERCHANT_B_PUBLIC = '01BRZ3NDEKTSV4RRFFQ69G5FAV'
const PRODUCT_B_PUBLIC = '01CX5ZZKBKACTAV9WEVGEMMVRZ'
const ORDER_B_PUBLIC = '01DRZ3NDEKTSV4RRFFQ69G5FAW'

/** A syntactically valid public id built from digits — Crockford's alphabet
 *  includes 0-9, so padding a counter is the least error-prone way to write
 *  throwaway ids of exactly the right length. */
const pid = (n: number) => String(n).padStart(26, '0')

const TABLES = [
  'business_merchants',
  'business_merchant_terms_acceptances',
  'business_products',
  'business_product_option_groups',
  'business_product_option_values',
  'business_orders',
  'business_order_items',
  'business_order_status_history',
  'business_product_reports',
] as const

/**
 * Production as Supabase ships it. Without the two ALTER DEFAULT PRIVILEGES
 * lines every REVOKE in the migration would be vacuous here and the suite would
 * pass over a table that is wide open in production — the exact shape of
 * silence ADR-019 was written about.
 */
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Control object: same open defaults, never revoked. If the assertions below
  -- passed for this table too, they would be testing nothing.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

/** Runs `sql` as `role`; returns the SQLSTATE on failure, or null on success. */
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

/** Attempts `sql` as the superuser; returns the SQLSTATE on failure. */
async function attempt(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}

const privilege = async (role: string, table: string, priv: string): Promise<boolean> =>
  (await one<{ p: boolean }>(`SELECT has_table_privilege($1, $2, $3) AS p`, [role, table, priv])).p

let merchantId: string
let productId: string
let orderId: string

// A second, entirely separate merchant. Its only purpose is to be the wrong
// owner in the cross-merchant assertions below.
let merchantBId: string
let productBId: string
let orderBId: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-tappybiz-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // ⚠️ REQUIRED ON WINDOWS, and measured here rather than assumed: initdb
    // inherits the host locale and builds a WIN1252 cluster, which then rejects
    // the entire migration file with "no equivalent in encoding WIN1252" —
    // before a single object is created — because its comment banners contain
    // box-drawing characters. `--locale=C` also makes text ordering byte-wise,
    // so a table listing does not depend on the host's collation.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  // Pinned for the reason every suite here pins it: this machine is in Vietnam,
  // so an unpinned session makes a bare cast and an explicit conversion
  // indistinguishable.
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(MIGRATION)

  // Fixtures, inserted as superuser (which bypasses the grants under test).
  merchantId = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants
         (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, gen_random_uuid(), 'CAFE', 'Lan Shop', '128 Nguyễn Văn Cừ, Q5', '0901234567')
       RETURNING id`,
      [MERCHANT_PUBLIC]
    )
  ).id

  productId = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1, $2, 'Áo thun cotton', 45000)
       RETURNING id`,
      [PRODUCT_PUBLIC, merchantId]
    )
  ).id

  orderId = (
    await one<{ id: string }>(
      `INSERT INTO business_orders
         (public_id, merchant_id, tracking_token_hash, customer_name, customer_phone,
          customer_address, total_amount, total_items, expires_at)
       VALUES ($1, $2, decode(repeat('ab',32),'hex'), 'Nguyễn Thị Lan', '0901234567',
               '128 Nguyễn Văn Cừ, Q5', 90000, 2, now() + interval '72 hours')
       RETURNING id`,
      [ORDER_PUBLIC, merchantId]
    )
  ).id

  merchantBId = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants
         (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1, gen_random_uuid(), 'FASHION', 'Bao Shop', '9 Lê Lợi, Q1', '0987654321')
       RETURNING id`,
      [MERCHANT_B_PUBLIC]
    )
  ).id

  productBId = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
       VALUES ($1, $2, 'Quần jean', 250000)
       RETURNING id`,
      [PRODUCT_B_PUBLIC, merchantBId]
    )
  ).id

  orderBId = (
    await one<{ id: string }>(
      `INSERT INTO business_orders
         (public_id, merchant_id, tracking_token_hash, customer_name, customer_phone,
          customer_address, total_amount, total_items, expires_at)
       VALUES ($1, $2, decode(repeat('cd',32),'hex'), 'Trần Văn Bảo', '0912345678',
               '9 Lê Lợi, Q1', 250000, 1, now() + interval '72 hours')
       RETURNING id`,
      [ORDER_B_PUBLIC, merchantBId]
    )
  ).id
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
    /* windows file lock */
  }
})

describe('the migration applies and creates the nine Business tables', () => {
  it('creates every table the ERD names', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'business_%'`
    )
    // Sorted in JS on both sides: PostgreSQL's ORDER BY follows the database
    // collation, which may or may not order '_' before a letter. That is not
    // what this test is about.
    expect(rows.map((r) => r.tablename).sort()).toEqual([...TABLES].sort())
  })

  it('is idempotent — re-applying changes nothing and raises nothing', async () => {
    await expect(db.query(MIGRATION)).resolves.toBeDefined()
    const { rows } = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'business_%'`
    )
    expect(rows).toHaveLength(TABLES.length)
  })
})

describe('anon and authenticated reach nothing (ADR-019)', () => {
  it('holds no privilege of any kind on any Business table', async () => {
    for (const table of TABLES) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          expect(await privilege(role, table, priv), `${role} ${priv} ${table}`).toBe(false)
        }
      }
    }
  })

  it('the control object proves the check is not vacuous', async () => {
    // Same schema, same default privileges, never revoked. If this were also
    // false, the assertions above would be measuring a broken harness.
    expect(await privilege('anon', 'harness_control', 'SELECT')).toBe(true)
    expect(await privilege('authenticated', 'harness_control', 'INSERT')).toBe(true)
  })

  it('a real SELECT as anon is refused, not merely un-granted', async () => {
    expect(await asRole('anon', `SELECT * FROM business_orders`)).toBe('42501')
    expect(await asRole('authenticated', `SELECT * FROM business_merchants`)).toBe('42501')
  })
})

describe('RLS is enabled everywhere as the second line', () => {
  it('has row level security on with no policies', async () => {
    for (const table of TABLES) {
      const row = await one<{ relrowsecurity: boolean; policies: string }>(
        `SELECT c.relrowsecurity,
                (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
           FROM pg_class c WHERE c.relname = $1`,
        [table]
      )
      expect(row.relrowsecurity, `RLS on ${table}`).toBe(true)
      expect(Number(row.policies), `policies on ${table}`).toBe(0)
    }
  })
})

describe('the service_role grant set encodes the domain invariants', () => {
  const expected: Record<string, { select: boolean; insert: boolean; update: boolean; delete: boolean }> = {
    business_merchants: { select: true, insert: true, update: true, delete: false },
    business_merchant_terms_acceptances: { select: true, insert: true, update: false, delete: false },
    business_products: { select: true, insert: true, update: true, delete: false },
    business_product_option_groups: { select: true, insert: true, update: true, delete: true },
    business_product_option_values: { select: true, insert: true, update: true, delete: true },
    business_orders: { select: true, insert: true, update: true, delete: false },
    business_order_items: { select: true, insert: true, update: false, delete: false },
    business_order_status_history: { select: true, insert: true, update: false, delete: false },
    business_product_reports: { select: true, insert: true, update: true, delete: false },
  }

  it('matches the architecture table for table', async () => {
    for (const [table, want] of Object.entries(expected)) {
      expect(await privilege('service_role', table, 'SELECT'), `SELECT ${table}`).toBe(want.select)
      expect(await privilege('service_role', table, 'INSERT'), `INSERT ${table}`).toBe(want.insert)
      expect(await privilege('service_role', table, 'UPDATE'), `UPDATE ${table}`).toBe(want.update)
      expect(await privilege('service_role', table, 'DELETE'), `DELETE ${table}`).toBe(want.delete)
    }
  })

  it('cannot hard-delete a product — the tombstone is enforced by privilege', async () => {
    // §9: public URLs outlive the product. A DELETE here would turn a link a
    // merchant posted to Facebook into a 404 with no way back.
    expect(await asRole('service_role', `DELETE FROM business_products WHERE id = '${productId}'`)).toBe(
      '42501'
    )
  })

  it('cannot rewrite or erase order status history', async () => {
    // §20 calls the history append-only. This is what makes that a fact rather
    // than a convention the application is trusted to honour.
    expect(
      await asRole('service_role', `UPDATE business_order_status_history SET reason = 'x'`)
    ).toBe('42501')
    expect(await asRole('service_role', `DELETE FROM business_order_status_history`)).toBe('42501')
  })

  it('cannot mutate an order item after the order is placed', async () => {
    // §16: the snapshot is historical truth. A merchant editing a price next
    // week must not change what last week's order says it cost.
    expect(await asRole('service_role', `UPDATE business_order_items SET quantity = 99`)).toBe('42501')
  })

  it('cannot delete an order — retention nulls PII, it never removes the row', async () => {
    expect(await asRole('service_role', `DELETE FROM business_orders WHERE id = '${orderId}'`)).toBe(
      '42501'
    )
  })
})

describe('PII — no path enumerates orders by phone (§16)', () => {
  it('has no index on customer_phone', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'business_orders'`
    )
    const phoneIndexes = rows.filter((r) => /customer_phone/i.test(r.indexdef))
    expect(phoneIndexes).toEqual([])
  })

  it('indexes only the two access paths the architecture defines', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename='business_orders' ORDER BY indexname`
    )
    const names = rows.map((r) => r.indexname)
    expect(names).toContain('business_orders_merchant_idx')
    expect(names).toContain('business_orders_pending_expiry_idx')
    // Everything else is a uniqueness constraint, not a lookup path.
    const lookups = names.filter((n) => n.endsWith('_idx'))
    expect(lookups.sort()).toEqual([
      'business_orders_merchant_idx',
      'business_orders_pending_expiry_idx',
    ])
  })

  it('never stores a raw tracking token — only a 32-byte digest (§21)', async () => {
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='business_orders'`
    )
    const names = columns.rows.map((r) => r.column_name)
    expect(names).toContain('tracking_token_hash')
    expect(names).not.toContain('tracking_token')

    expect(
      await attempt(
        `INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, expires_at)
         VALUES ($2, $1, decode('abcd','hex'), 'x','1','y',1,1, now())`,
        [merchantId, pid(1)]
      )
    ).toBe('23514')
  })

  it('rejects two orders sharing a tracking token', async () => {
    expect(
      await attempt(
        `INSERT INTO business_orders (public_id, merchant_id, tracking_token_hash, customer_name,
           customer_phone, customer_address, total_amount, total_items, expires_at)
         VALUES ($2, $1, decode(repeat('ab',32),'hex'), 'x','1','y',1,1, now())`,
        [merchantId, pid(2)]
      )
    ).toBe('23505')
  })
})

describe('the state machine is enforced by the schema (§18, §20)', () => {
  it('accepts the four legal transitions', async () => {
    const legal: Array<[string | null, string, string]> = [
      [null, 'PENDING', 'CUSTOMER'],
      ['PENDING', 'ACCEPTED', 'MERCHANT'],
      ['PENDING', 'REJECTED', 'SYSTEM'],
      ['PENDING', 'REJECTED', 'ADMIN'],
    ]
    for (const [from, to, actor] of legal) {
      expect(
        await attempt(
          `INSERT INTO business_order_status_history (order_id, from_status, to_status, actor_type, reason)
           VALUES ($1,$2,$3,$4,'test')`,
          [orderId, from, to, actor]
        ),
        `${from} -> ${to} by ${actor}`
      ).toBeNull()
    }
  })

  it('makes a transition OUT of a terminal state unrecordable', async () => {
    // ACCEPTED and REJECTED are terminal and immutable. The CHECK on
    // `from_status` means the history physically cannot describe leaving one,
    // which is stronger than making it unreachable in application code.
    for (const from of ['ACCEPTED', 'REJECTED']) {
      for (const to of ['PENDING', 'ACCEPTED', 'REJECTED']) {
        expect(
          await attempt(
            `INSERT INTO business_order_status_history (order_id, from_status, to_status, actor_type, reason)
             VALUES ($1,$2,$3,'MERCHANT','undo')`,
            [orderId, from, to]
          ),
          `${from} -> ${to} must be rejected`
        ).toBe('23514')
      }
    }
  })

  it('allows PENDING only as the creation transition', async () => {
    expect(
      await attempt(
        `INSERT INTO business_order_status_history (order_id, from_status, to_status, actor_type, reason)
         VALUES ($1,'PENDING','PENDING','SYSTEM','loop')`,
        [orderId]
      )
    ).toBe('23514')
    expect(
      await attempt(
        `INSERT INTO business_order_status_history (order_id, from_status, to_status, actor_type, reason)
         VALUES ($1,NULL,'ACCEPTED','MERCHANT','skip')`,
        [orderId]
      )
    ).toBe('23514')
  })

  it('constrains order status to the three customer-facing values', async () => {
    expect(
      await attempt(`UPDATE business_orders SET status='COMPLETED' WHERE id=$1`, [orderId])
    ).toBe('23514')
    expect(
      await attempt(`UPDATE business_orders SET status='DELIVERED' WHERE id=$1`, [orderId])
    ).toBe('23514')
  })
})

describe('money is integer minor units with VND at exponent 0 (§10, §41)', () => {
  it('stores 45000 and reads back 45000', async () => {
    const row = await one<{ price_amount: string; currency: string }>(
      `SELECT price_amount, currency FROM business_products WHERE id=$1`,
      [productId]
    )
    // pg returns BIGINT as a string to avoid precision loss — the value must be
    // exactly what went in, neither 450 nor 4500000.
    expect(row.price_amount).toBe('45000')
    expect(row.currency).toBe('VND')
  })

  it('is a BIGINT column, not numeric or double precision', async () => {
    const row = await one<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name='business_products' AND column_name='price_amount'`
    )
    expect(row.data_type).toBe('bigint')
  })

  it('refuses a negative amount', async () => {
    expect(await attempt(`UPDATE business_products SET price_amount=-1 WHERE id=$1`, [productId])).toBe(
      '23514'
    )
  })

  it('refuses a line total that is not unit price times quantity', async () => {
    expect(
      await attempt(
        `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES ($1,$2,$4,$3,'Áo thun cotton',45000,2,80000)`,
        [orderId, productId, PRODUCT_PUBLIC, merchantId]
      )
    ).toBe('23514')

    expect(
      await attempt(
        `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES ($1,$2,$4,$3,'Áo thun cotton',45000,2,90000)`,
        [orderId, productId, PRODUCT_PUBLIC, merchantId]
      )
    ).toBeNull()
  })
})

describe('merchant isolation is structural — cross-merchant order items (HIGH-1)', () => {
  const insertItem = (order: string, product: string, merchant: string, publicId: string) =>
    attempt(
      `INSERT INTO business_order_items (order_id, product_id, merchant_id, product_public_id,
         product_name_snapshot, unit_price_amount, quantity, line_total_amount)
       VALUES ($1,$2,$3,$4,'snapshot',1000,1,1000)`,
      [order, product, merchant, publicId]
    )

  it('accepts an item whose order and product belong to the same merchant', () => {
    // The control. Every rejection below is only meaningful because this passes.
    return expect(insertItem(orderId, productId, merchantId, PRODUCT_PUBLIC)).resolves.toBeNull()
  })

  it('accepts the same for the second merchant', async () => {
    expect(await insertItem(orderBId, productBId, merchantBId, PRODUCT_B_PUBLIC)).toBeNull()
  })

  it("🔑 rejects merchant A's order carrying merchant B's product", async () => {
    // The leak this constraint exists to prevent: B's product name and price
    // would sit beside A's customer's real name, phone and address.
    //
    // Neither composite key can be satisfied at once — claiming merchant A
    // breaks the product key, claiming merchant B breaks the order key — so
    // both attempts are rejected, whichever owner the row asserts.
    expect(await insertItem(orderId, productBId, merchantId, PRODUCT_B_PUBLIC)).toBe('23503')
    expect(await insertItem(orderId, productBId, merchantBId, PRODUCT_B_PUBLIC)).toBe('23503')
  })

  it("🔑 rejects merchant B's order carrying merchant A's product", async () => {
    expect(await insertItem(orderBId, productId, merchantBId, PRODUCT_PUBLIC)).toBe('23503')
    expect(await insertItem(orderBId, productId, merchantId, PRODUCT_PUBLIC)).toBe('23503')
  })

  it('rejects an item claiming a merchant that owns neither the order nor the product', async () => {
    const stranger = (
      await one<{ id: string }>(
        `INSERT INTO business_merchants
           (public_id, controller_user_id, business_category, shop_name, address, phone)
         VALUES ($1, gen_random_uuid(), 'OTHER', 'Stranger', 'x', '1') RETURNING id`,
        [pid(9)]
      )
    ).id
    expect(await insertItem(orderId, productId, stranger, PRODUCT_PUBLIC)).toBe('23503')
  })

  it('carries the two composite foreign keys, not two independent ones', async () => {
    const { rows } = await db.query<{ conname: string; def: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'business_order_items'::regclass AND contype = 'f'
        ORDER BY conname`
    )
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      // Each key must name merchant_id on BOTH sides; a single-column key would
      // silently reopen the hole.
      expect(r.def, r.conname).toMatch(/FOREIGN KEY \((order_id|product_id), merchant_id\)/)
      expect(r.def, r.conname).toMatch(/REFERENCES business_(orders|products)\(id, merchant_id\)/)
    }
  })

  it('the parent tables expose the composite unique key the FKs require', async () => {
    for (const table of ['business_orders', 'business_products']) {
      const { rows } = await db.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = $1::regclass AND contype = 'u'`,
        [table]
      )
      expect(rows.some((r) => /UNIQUE \(id, merchant_id\)/.test(r.def)), table).toBe(true)
    }
  })

  it('still refuses an item pointing at an order or product that does not exist', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000'
    expect(await insertItem(ghost, productId, merchantId, PRODUCT_PUBLIC)).toBe('23503')
    expect(await insertItem(orderId, ghost, merchantId, PRODUCT_PUBLIC)).toBe('23503')
  })

  it('requires merchant_id — it cannot be left out and defaulted', async () => {
    expect(
      await attempt(
        `INSERT INTO business_order_items (order_id, product_id, product_public_id,
           product_name_snapshot, unit_price_amount, quantity, line_total_amount)
         VALUES ($1,$2,$3,'snapshot',1000,1,1000)`,
        [orderId, productId, PRODUCT_PUBLIC]
      )
    ).toBe('23502')
  })
})

describe('identifiers', () => {
  it('rejects a public_id that is not a 26-character Crockford ULID', async () => {
    for (const bad of ['not-a-ulid', '01ARZ3NDEKTSV4RRFFQ69G5FA', '01arz3ndektsv4rrffq69g5fav']) {
      expect(
        await attempt(
          `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
           VALUES ($1,$2,'x',1)`,
          [bad, merchantId]
        ),
        bad
      ).toBe('23514')
    }
  })

  it('rejects a duplicate public_id', async () => {
    expect(
      await attempt(
        `INSERT INTO business_products (public_id, merchant_id, name, price_amount)
         VALUES ($1,$2,'x',1)`,
        [PRODUCT_PUBLIC, merchantId]
      )
    ).toBe('23505')
  })

  it('binds one Controller identity to at most one merchant', async () => {
    const uid = (await one<{ controller_user_id: string }>(
      `SELECT controller_user_id FROM business_merchants WHERE id=$1`,
      [merchantId]
    )).controller_user_id

    expect(
      await attempt(
        `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
         VALUES ($2, $1, 'CAFE', 'Second Shop', 'x', '1')`,
        [uid, pid(3)]
      )
    ).toBe('23505')
  })
})

describe('lifecycle consistency', () => {
  it('will not record a DELETED product without a deletion timestamp', async () => {
    expect(await attempt(`UPDATE business_products SET status='DELETED' WHERE id=$1`, [productId])).toBe(
      '23514'
    )
    expect(
      await attempt(`UPDATE business_products SET status='DELETED', deleted_at=now() WHERE id=$1`, [
        productId,
      ])
    ).toBeNull()
    // Restore for any later assertion.
    await db.query(`UPDATE business_products SET status='ACTIVE', deleted_at=NULL WHERE id=$1`, [
      productId,
    ])
  })

  it('will not record a SUSPENDED merchant without a suspension timestamp', async () => {
    expect(await attempt(`UPDATE business_merchants SET status='SUSPENDED' WHERE id=$1`, [merchantId])).toBe(
      '23514'
    )
  })

  it('has no stock quantity column anywhere — §13 forbids an inventory engine', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_name LIKE 'business_%'
          AND (column_name LIKE '%stock%' OR column_name LIKE '%inventory%')`
    )
    expect(rows).toEqual([])
  })

  it('touches updated_at on every update', async () => {
    const before = await one<{ updated_at: Date }>(
      `SELECT updated_at FROM business_products WHERE id=$1`,
      [productId]
    )
    await db.query(`UPDATE business_products SET name='Áo thun cotton 2' WHERE id=$1`, [productId])
    const after = await one<{ updated_at: Date }>(
      `SELECT updated_at FROM business_products WHERE id=$1`,
      [productId]
    )
    expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime())
  })
})
