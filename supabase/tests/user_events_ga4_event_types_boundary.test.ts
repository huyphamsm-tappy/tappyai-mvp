import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Migration #7 (user_events GA4 event types) is deliberately CONDITIONAL and
// ADDITIVE. This proves both branches on a real Postgres:
//   • constraint PRESENT  → the three new types are added and NOTHING existing is
//     lost (another branch's growth types survive the union);
//   • constraint ABSENT   → a true no-op: no constraint is created, so prod (which
//     has no such CHECK) stays forward-compatible and nothing it accepts is dropped.

const REPO = join(__dirname, '..', '..')
const FORWARD = readFileSync(join(REPO, 'supabase/migrations/20260921_user_events_ga4_event_types.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260921_user_events_ga4_event_types_rollback.sql'), 'utf8')
const PORT = 54371

const NEW_TYPES = ['recommendation_click', 'scam_check', 'chat_opened']
// A representative "already allowed" set: base app types + a growth type that lives
// only on ANOTHER branch (the exact skew this migration must not clobber).
const EXISTING = ['page_view', 'report', 'review_search', 'share_out', 'action_started']

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const constraintDef = async (): Promise<string | null> =>
  (await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'public.user_events'::regclass AND conname = 'user_events_event_type_check'`,
  )).rows[0]?.def ?? null

const allowedValues = (def: string | null): string[] =>
  def ? (def.match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1)) : []

/** Insert one event_type; returns true if it was accepted by the table. */
const inserts = async (eventType: string): Promise<boolean> => {
  try {
    await db.query(`INSERT INTO public.user_events (event_type) VALUES ($1)`, [eventType])
    return true
  } catch {
    return false
  }
}

async function resetTable(withConstraint: boolean) {
  await db.query(`DROP TABLE IF EXISTS public.user_events`)
  await db.query(`CREATE TABLE public.user_events (id bigserial PRIMARY KEY, event_type text NOT NULL)`)
  if (withConstraint) {
    const list = [...EXISTING].map((t) => `'${t}'`).join(', ')
    await db.query(
      `ALTER TABLE public.user_events ADD CONSTRAINT user_events_event_type_check CHECK (event_type IN (${list})) NOT VALID`,
    )
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-ga4-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('migration #7 — constraint PRESENT: types added, nothing lost', () => {
  beforeEach(async () => { await resetTable(true) })

  it('the three new types become allowed and every existing type survives', async () => {
    const before = allowedValues(await constraintDef())
    expect(before.sort()).toEqual([...EXISTING].sort())
    // Baseline: the new types are rejected before the migration.
    for (const t of NEW_TYPES) expect(await inserts(t)).toBe(false)

    await db.query(FORWARD)

    const after = allowedValues(await constraintDef())
    // Union: exactly the existing set plus the three new ones, nothing dropped.
    expect([...after].sort()).toEqual([...new Set([...EXISTING, ...NEW_TYPES])].sort())
    for (const t of EXISTING) expect(after).toContain(t)
    // And it is enforced: new types now insert, a genuinely unknown type still fails.
    for (const t of NEW_TYPES) expect(await inserts(t)).toBe(true)
    for (const t of EXISTING) expect(await inserts(t)).toBe(true)
    expect(await inserts('definitely_not_a_type')).toBe(false)
  })

  it('is idempotent — re-running changes nothing', async () => {
    await db.query(FORWARD)
    const first = allowedValues(await constraintDef()).sort()
    await db.query(FORWARD)
    expect(allowedValues(await constraintDef()).sort()).toEqual(first)
  })

  it('the rollback removes only the three new types, keeping the rest', async () => {
    await db.query(FORWARD)
    await db.query(ROLLBACK)
    const after = allowedValues(await constraintDef())
    expect([...after].sort()).toEqual([...EXISTING].sort())
    for (const t of NEW_TYPES) expect(await inserts(t)).toBe(false)
    for (const t of EXISTING) expect(await inserts(t)).toBe(true)
  })
})

describe('migration #7 — constraint ABSENT: a true no-op', () => {
  beforeEach(async () => { await resetTable(false) })

  it('creates no constraint and leaves the column forward-compatible', async () => {
    expect(await constraintDef()).toBeNull()

    await db.query(FORWARD)

    // No gate was introduced…
    expect(await constraintDef()).toBeNull()
    // …so any event_type — including a growth type and a brand-new one — still inserts.
    for (const t of [...NEW_TYPES, 'share_out', 'whatever_prod_sends']) expect(await inserts(t)).toBe(true)
  })

  it('the rollback is also a no-op when there is no constraint', async () => {
    await db.query(ROLLBACK)
    expect(await constraintDef()).toBeNull()
  })
})
