import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Tappy Business — P4: the complete lifecycle, and the schema-level state machine.
//
// TWO THINGS LIVE HERE.
//
// 1. THE END-TO-END LIFECYCLE, against a real database and with no mocks in the
//    state-machine path: a guest orders, the merchant sees it, answers it, and
//    the customer's tracking link reflects the answer. Every previous suite
//    tests one hop; this one is the only place the hops are proved to connect.
//
// 2. THE P4 TRIGGER. Until P4 the state machine was enforced by the two SQL
//    FUNCTIONS — which is to say, by every caller remembering to use them.
//    `service_role` holds UPDATE on the table, so a direct
//    `UPDATE business_orders SET status='PENDING'` on an accepted order would
//    have succeeded. Nothing did that, but "no code does it" is a property of
//    today's code, not of the schema.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATIONS = [
  'supabase/migrations/20260908_tappy_business_p0.sql',
  'supabase/migrations/20260909_tappy_business_p2_order_invariants.sql',
  'supabase/migrations/20260910_tappy_business_p3_order_transitions.sql',
  'supabase/migrations/20260911_tappy_business_p4_order_immutability.sql',
].map((f) => readFileSync(join(REPO, f), 'utf8'))

const PORT = 54381

const pid = (n: number) => String(n).padStart(26, '0')
const hashOf = (token: string) =>
  String.raw`\x` + createHash('sha256').update(token, 'utf8').digest('hex')

const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'

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

/** The guest order path, exactly as POST /api/public/business/orders calls it. */
async function placeOrder(publicId: string, merchant: string, product: string, productPublic: string) {
  const token = randomBytes(32).toString('base64url')
  await db.query(
    `SELECT fn_business_create_order($1, $2::uuid, $3::bytea, 'Nguyễn Thị Lan', '0901234567',
       '128 Nguyễn Văn Cừ, Q5', 'Giao sau 18h', 'CLIP', NULL, now() + interval '72 hours',
       $4::uuid, $5, 'Áo thun cotton', 45000::bigint, 2::integer,
       '[{"group":"Màu","value":"Đỏ"}]'::jsonb)`,
    [publicId, merchant, hashOf(token), product, productPublic]
  )
  return token
}

const transition = (merchant: string, publicId: string, to: string, actor: string, reason: string) =>
  db.query<{ transitioned: boolean; status: string }>(
    `SELECT * FROM fn_business_transition_order($1::uuid,$2::text,$3::text,$4::text,$5::text)`,
    [merchant, publicId, to, actor, reason]
  )

/** The customer's tracking read: by token digest, and by nothing else. */
const trackByToken = (token: string) =>
  db
    .query(
      `SELECT public_id, status, customer_name, customer_phone, customer_address, merchant_id
         FROM business_orders WHERE tracking_token_hash = $1::bytea`,
      [hashOf(token)]
    )
    .then((r) => r.rows[0])

/** The merchant's inbox read: merchant-scoped, newest first. */
const inbox = (merchant: string) =>
  db
    .query(
      `SELECT public_id, status FROM business_orders
        WHERE merchant_id = $1 ORDER BY created_at DESC, public_id DESC`,
      [merchant]
    )
    .then((r) => r.rows)

const historyOf = (publicId: string) =>
  db
    .query(
      `SELECT h.from_status, h.to_status, h.actor_type, h.reason FROM business_order_status_history h
         JOIN business_orders o ON o.id = h.order_id WHERE o.public_id = $1 ORDER BY h.created_at`,
      [publicId]
    )
    .then((r) => r.rows)

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-tbp4-'))
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

  merchantA = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1,$2::uuid,'CAFE','Lan Shop','128 Nguyễn Văn Cừ, Q5','0908887777') RETURNING id`,
      [pid(1), OWNER_A]
    )
  ).id
  merchantB = (
    await one<{ id: string }>(
      `INSERT INTO business_merchants (public_id, controller_user_id, business_category, shop_name, address, phone)
       VALUES ($1,$2::uuid,'FASHION','Bao Shop','9 Lê Lợi','0912223333') RETURNING id`,
      [pid(2), OWNER_B]
    )
  ).id
  productA = (
    await one<{ id: string }>(
      `INSERT INTO business_products (public_id, merchant_id, name, price_amount, is_available)
       VALUES ($1,$2,'Áo thun cotton',45000,true) RETURNING id`,
      [pid(11), merchantA]
    )
  ).id
}, 180_000)

beforeEach(async () => {
  await db.query('ROLLBACK').catch(() => {})
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

// ═══════════════════════════════════════════════════════════════════════════
describe('end to end — the accept path', () => {
  it('🔑 merchant → product → guest order → tracking → inbox → accept → tracking', async () => {
    // 1-3. A merchant with an available product exists (fixtures above).
    const product = await one<{ is_available: boolean; status: string }>(
      `SELECT is_available, status FROM business_products WHERE id=$1`,
      [productA]
    )
    expect(product).toEqual({ is_available: true, status: 'ACTIVE' })

    // 4-5. The guest places an order. It is PENDING.
    const token = await placeOrder(pid(100), merchantA, productA, pid(11))
    expect(await trackByToken(token)).toMatchObject({ public_id: pid(100), status: 'PENDING' })

    // 6. The creation history row exists and has no predecessor.
    expect(await historyOf(pid(100))).toEqual([
      { from_status: null, to_status: 'PENDING', actor_type: 'CUSTOMER', reason: 'CREATED' },
    ])

    // 7. The merchant sees it — and merchant B does not.
    expect(await inbox(merchantA)).toEqual([{ public_id: pid(100), status: 'PENDING' }])
    expect(await inbox(merchantB)).toEqual([])

    // 8-9. The merchant accepts.
    const accepted = await transition(merchantA, pid(100), 'ACCEPTED', OWNER_A, 'MERCHANT_ACCEPTED')
    expect(accepted.rows[0]).toMatchObject({ transitioned: true, status: 'ACCEPTED' })

    // 10. Exactly one transition row, from the right actor.
    const history = await historyOf(pid(100))
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      from_status: 'PENDING',
      to_status: 'ACCEPTED',
      actor_type: 'MERCHANT',
      reason: 'MERCHANT_ACCEPTED',
    })

    // 11. The customer's SAME token now reads ACCEPTED.
    const tracked = await trackByToken(token)
    expect(tracked.status).toBe('ACCEPTED')

    // 12. THE HANDOFF. The shop's phone is available to show the customer —
    // this is the whole of what Tappy does after ACCEPTED (P0 §29).
    const shop = await one<{ shop_name: string; phone: string }>(
      `SELECT shop_name, phone FROM business_merchants WHERE id = $1`,
      [tracked.merchant_id]
    )
    expect(shop).toEqual({ shop_name: 'Lan Shop', phone: '0908887777' })

    // 13. The merchant cannot move it again — through the function, or around it.
    const again = await transition(merchantA, pid(100), 'REJECTED', OWNER_A, 'MERCHANT_REJECTED')
    expect(again.rows[0].transitioned).toBe(false)
    expect(
      await attempt(`UPDATE business_orders SET status='REJECTED' WHERE public_id=$1`, [pid(100)])
    ).toBe('23514')

    // 14. Nor can expiry.
    await db.query(
      `UPDATE business_orders SET created_at = now() - interval '80 hours',
                                  expires_at = now() - interval '8 hours' WHERE public_id=$1`,
      [pid(100)]
    )
    expect(
      (await one<{ fn_business_expire_orders: number }>(`SELECT fn_business_expire_orders(500)`))
        .fn_business_expire_orders
    ).toBe(0)

    expect(await historyOf(pid(100))).toHaveLength(2)
    expect((await trackByToken(token)).status).toBe('ACCEPTED')
  })
})

describe('end to end — the reject path', () => {
  it('🔑 guest order → PENDING → merchant rejects → tracking shows REJECTED → no later accept', async () => {
    const token = await placeOrder(pid(200), merchantA, productA, pid(11))
    expect((await trackByToken(token)).status).toBe('PENDING')

    const rejected = await transition(
      merchantA, pid(200), 'REJECTED', OWNER_A, 'MERCHANT_REJECTED:OUT_OF_STOCK'
    )
    expect(rejected.rows[0]).toMatchObject({ transitioned: true, status: 'REJECTED' })
    expect((await trackByToken(token)).status).toBe('REJECTED')

    const history = await historyOf(pid(200))
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({ to_status: 'REJECTED', actor_type: 'MERCHANT' })

    // No later accept, by any route.
    expect(
      (await transition(merchantA, pid(200), 'ACCEPTED', OWNER_A, 'MERCHANT_ACCEPTED')).rows[0]
        .transitioned
    ).toBe(false)
    expect(
      await attempt(`UPDATE business_orders SET status='ACCEPTED' WHERE public_id=$1`, [pid(200)])
    ).toBe('23514')
    expect(await historyOf(pid(200))).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('P4 — the state machine is now the schema’s, not the callers’', () => {
  it('🔑 a DIRECT update cannot move a terminal order, in any direction', async () => {
    await placeOrder(pid(300), merchantA, productA, pid(11))
    await transition(merchantA, pid(300), 'ACCEPTED', OWNER_A, 'MERCHANT_ACCEPTED')

    // Before P4 every one of these would have succeeded: the CHECK constrains
    // the VALUE of `status`, never the transition, and service_role holds UPDATE.
    for (const to of ['PENDING', 'REJECTED', 'ACCEPTED']) {
      expect(
        await attempt(`UPDATE business_orders SET status=$2 WHERE public_id=$1`, [pid(300), to]),
        to
      ).toBe(to === 'ACCEPTED' ? null : '23514') // a no-op self-update is not a transition
    }
    expect((await one<{ status: string }>(
      `SELECT status FROM business_orders WHERE public_id=$1`, [pid(300)]
    )).status).toBe('ACCEPTED')
  })

  it('🔑 a REJECTED order cannot be reopened by a direct update', async () => {
    await placeOrder(pid(301), merchantA, productA, pid(11))
    await transition(merchantA, pid(301), 'REJECTED', OWNER_A, 'MERCHANT_REJECTED')
    for (const to of ['PENDING', 'ACCEPTED']) {
      expect(
        await attempt(`UPDATE business_orders SET status=$2 WHERE public_id=$1`, [pid(301), to]),
        to
      ).toBe('23514')
    }
  })

  it('still allows the two legal transitions by direct update', async () => {
    // The trigger must not simply block everything — that would pass every
    // rejection assertion above while breaking the product.
    await placeOrder(pid(302), merchantA, productA, pid(11))
    expect(
      await attempt(`UPDATE business_orders SET status='ACCEPTED' WHERE public_id=$1`, [pid(302)])
    ).toBeNull()

    await placeOrder(pid(303), merchantA, productA, pid(11))
    expect(
      await attempt(`UPDATE business_orders SET status='REJECTED' WHERE public_id=$1`, [pid(303)])
    ).toBeNull()
  })

  it('🔑 the identity, token digest and money columns are frozen after creation', async () => {
    await placeOrder(pid(304), merchantA, productA, pid(11))
    const frozen: [string, string][] = [
      ['public_id', `'${pid(999)}'`],
      ['merchant_id', `'${merchantB}'`],
      ['tracking_token_hash', `decode(repeat('ff',32),'hex')`],
      ['total_amount', '1'],
      ['total_items', '99'],
      ['currency', `'VND'`], // same value is fine; a DIFFERENT one is impossible anyway
      ['source', `'QR'`],
    ]
    for (const [column, value] of frozen) {
      const code = await attempt(
        `UPDATE business_orders SET ${column} = ${value} WHERE public_id = $1`,
        [pid(304)]
      )
      // `currency` set to its own value is not a change, so it passes — every
      // other one is a rewrite of a load-bearing field.
      expect(code, column).toBe(column === 'currency' ? null : '23514')
    }
  })

  it('🔑 changing merchant_id is impossible — the isolation boundary cannot be moved', async () => {
    await placeOrder(pid(305), merchantA, productA, pid(11))
    expect(
      await attempt(`UPDATE business_orders SET merchant_id=$2 WHERE public_id=$1`, [
        pid(305),
        merchantB,
      ])
    ).toBe('23514')
    expect(await inbox(merchantB)).toEqual([])
  })

  it('claimed_by_user_id is write-once — the deferred finding, now enforced', async () => {
    await placeOrder(pid(306), merchantA, productA, pid(11))
    // First write is allowed (the claim flow is Phase 1.5; this proves the
    // column is not simply frozen).
    expect(
      await attempt(
        `UPDATE business_orders SET claimed_by_user_id=$2::uuid, claimed_at=now() WHERE public_id=$1`,
        [pid(306), OWNER_B]
      )
    ).toBeNull()
    // A second, different one is not.
    expect(
      await attempt(`UPDATE business_orders SET claimed_by_user_id=$2::uuid WHERE public_id=$1`, [
        pid(306),
        OWNER_A,
      ])
    ).toBe('23514')
  })

  it('🔑 the retention job can still null the customer PII', async () => {
    // The one legitimate write to those columns (§37). Freezing them would
    // have made the retention policy unimplementable.
    await placeOrder(pid(307), merchantA, productA, pid(11))
    await transition(merchantA, pid(307), 'REJECTED', OWNER_A, 'MERCHANT_REJECTED')
    expect(
      await attempt(
        `UPDATE business_orders SET customer_name='—', customer_phone='—',
                                    customer_address='—', customer_note=NULL
          WHERE public_id=$1`,
        [pid(307)]
      )
    ).toBeNull()

    // And the order itself survives: §37 keeps the non-PII record for audit.
    const row = await one<{ status: string; total_amount: string }>(
      `SELECT status, total_amount FROM business_orders WHERE public_id=$1`,
      [pid(307)]
    )
    expect(row).toEqual({ status: 'REJECTED', total_amount: '90000' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('P4 — final production audit of the schema', () => {
  it('🔑 no privileged Business function is reachable by anon or authenticated', async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; auth: boolean }>(
      `SELECT p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'fn_business%'`
    )
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const r of rows) {
      expect(r.anon, `${r.proname} anon`).toBe(false)
      expect(r.auth, `${r.proname} authenticated`).toBe(false)
    }
  })

  it('every SECURITY DEFINER Business function pins its search_path', async () => {
    const { rows } = await db.query<{ proname: string; config: string[] | null }>(
      `SELECT p.proname, p.proconfig AS config FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'fn_business%' AND p.prosecdef`
    )
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const r of rows) {
      expect((r.config ?? []).join(','), r.proname).toContain('search_path=public')
    }
  })

  it('🔑 no index exposes a PII column on any Business table', async () => {
    const { rows } = await db.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes WHERE tablename LIKE 'business_%'`
    )
    const pii = /customer_phone|customer_name|customer_address|customer_note|tax_or_identity_number|legal_name/i
    expect(rows.filter((r) => pii.test(r.indexdef))).toEqual([])
  })

  it('money is integer VND on every table that carries it', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_name LIKE 'business_%' AND column_name LIKE '%_amount'`
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.data_type, `${r.table_name}.${r.column_name}`).toBe('bigint')
  })

  it('🔑 no public identifier is sequential', async () => {
    const { rows } = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name LIKE 'business_%' AND column_name = 'public_id'`
    )
    expect(rows.length).toBeGreaterThanOrEqual(3)
    // ULIDs are minted by the application; nothing here defaults to a sequence.
    for (const r of rows) expect(r.column_default).toBeNull()
    const { rows: seqs } = await db.query(
      `SELECT c.relname FROM pg_class c WHERE c.relkind='S' AND c.relname LIKE 'business_%'`
    )
    expect(seqs).toEqual([])
  })

  it('the nine tables all still deny anon and authenticated entirely', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'business_%'`
    )
    expect(rows).toHaveLength(9)
    for (const { tablename } of rows) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const r = await one<{ p: boolean }>(`SELECT has_table_privilege($1,$2,$3) AS p`, [
            role,
            tablename,
            priv,
          ])
          expect(r.p, `${role} ${priv} ${tablename}`).toBe(false)
        }
      }
    }
  })
})
