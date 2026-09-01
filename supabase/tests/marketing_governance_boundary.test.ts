import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// V2.2-2 Marketing Phase 2 — governance foundation schema.
//
// CONTRACT: docs/controller-v2/V2.2_MARKETING_PHASE2_CONTRACT.md
//   M-1    absence of a consent row means OPTED OUT — and there is NO BACKFILL
//   M-5    category is structural; an author cannot declare itself transactional
//   M-14   exactly three tables
//   M-15   REVOKE from PUBLIC/anon/authenticated · RLS explicit · rollback file
//   M-16   lifecycle values draft → active → completed
//   M-27a  a delivery can never be orphaned by pruning its campaign
//   M-34   per-recipient idempotency, keyed (campaign, recipient)
//
// 🚨 THE MOST IMPORTANT TEST IN THIS FILE IS "the migration inserts NOTHING".
// Owner decision 2026-09-01 is that marketing consent is opt-in and every
// existing user defaults to opted OUT. One `INSERT ... SELECT id FROM
// auth.users` in the migration would invert that — quietly, and with a diff
// that looks like a reasonable default. The test seeds users FIRST so that a
// backfill would have something to find.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260901_marketing_governance_foundation.sql'
const ROLLBACK_PATH = 'supabase/migrations/rollback/20260901_marketing_governance_foundation_rollback.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')
const ROLLBACK = readFileSync(join(REPO, ROLLBACK_PATH), 'utf8')

const PORT = 54373
const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33333333-3333-4333-8333-333333333333'

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- ADR-019: a new table in this schema is BORN fully open on Supabase.
  -- Without these default privileges every REVOKE assertion below would pass
  -- vacuously — the table would have had no grants to remove in the first place.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- CONTROL OBJECT: same open defaults, never revoked. If this table shows no
  -- grants either, the harness is broken rather than the migration being good.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

/** Run `sql` as `role`, returning the SQLSTATE on failure and null on success. */
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

/** Insert fails? Return the SQLSTATE; succeeded? null. */
async function insertFails(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}

const campaign = async (status = 'draft') =>
  (
    await db.query<{ id: string }>(
      `INSERT INTO marketing_campaigns (title, body, created_by, status)
       VALUES ('Spring', 'Hello there', $1, $2) RETURNING id`,
      [ADMIN, status],
    )
  ).rows[0].id

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-mkt-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false,
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  // Pinned: this machine is in Vietnam, so an unpinned session would make a UTC
  // cast and an explicit conversion indistinguishable.
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)

  // 🚨 SEEDED BEFORE THE MIGRATION RUNS, deliberately. A backfill inside the
  // migration would find these three users and create consent rows for them.
  await db.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3)`, [USER_A, USER_B, ADMIN])

  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  // Deliveries first — the FK to campaigns is ON DELETE RESTRICT.
  await db.query('TRUNCATE notification_deliveries, marketing_campaigns, marketing_consent')
})

// ===========================================================================
describe('schema — M-14: exactly three tables', () => {
  it('creates all three', async () => {
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class
        WHERE relkind='r'
          AND relname IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(r.n).toBe('3')
  })

  it('is idempotent — re-running the migration changes nothing', async () => {
    await db.query(MIGRATION)
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relkind='r'
        AND relname IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(r.n).toBe('3')
  })
})

// ===========================================================================
describe('🚨 M-1 — opt-in means NO BACKFILL', () => {
  it('the migration inserts nothing into marketing_consent, though three users exist', async () => {
    // The users were seeded BEFORE the migration ran, so a backfill would have
    // found them. This is the assertion that keeps "silence is not consent"
    // true for every account that already exists.
    const users = await one<{ n: string }>(`SELECT count(*) n FROM auth.users`)
    expect(users.n).toBe('3')

    const consent = await one<{ n: string }>(`SELECT count(*) n FROM marketing_consent`)
    expect(consent.n).toBe('0')
  })

  it('the migration file contains no INSERT and no UPDATE at all', async () => {
    // A behavioural check would not notice a backfill added to a DIFFERENT
    // table, and the emptiness above is only measured for one. Strip comments
    // first: the file discusses backfills at length in prose.
    const code = MIGRATION.replace(/--.*$/gm, '')
    expect(code).not.toMatch(/\bINSERT\b/i)
    expect(code).not.toMatch(/\bUPDATE\b/i)
  })

  it('the other two tables are empty too', async () => {
    const c = await one<{ n: string }>(`SELECT count(*) n FROM marketing_campaigns`)
    const d = await one<{ n: string }>(`SELECT count(*) n FROM notification_deliveries`)
    expect([c.n, d.n]).toEqual(['0', '0'])
  })
})

// ===========================================================================
describe('M-15 — grants and RLS', () => {
  it('CONTROL: the un-revoked harness table IS reachable by anon', async () => {
    // Proves the prelude's open defaults are real. Without this the three
    // assertions below could all pass on a database that grants nobody anything.
    const { rows } = await db.query<{ grantee: string }>(
      `SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_name='harness_control' AND grantee IN ('anon','authenticated','PUBLIC')`,
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('anon, authenticated and PUBLIC hold NO privilege on any of the three', async () => {
    const { rows } = await db.query<{ table_name: string; grantee: string; privilege_type: string }>(
      `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_name IN ('marketing_consent','marketing_campaigns','notification_deliveries')
          AND grantee IN ('anon','authenticated','PUBLIC')`,
    )
    expect(rows).toEqual([])
  })

  it('service_role retains access — it is the only legitimate writer', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.role_table_grants
        WHERE table_name IN ('marketing_consent','marketing_campaigns','notification_deliveries')
          AND grantee='service_role'`,
    )
    expect(rows.map((r) => r.table_name).sort()).toEqual([
      'marketing_campaigns', 'marketing_consent', 'notification_deliveries',
    ])
  })

  it('🚨 anon cannot read the consent set', async () => {
    // Behavioural, not catalogue-shaped: this is the query an attacker runs.
    const code = await asRole('anon', `SELECT * FROM public.marketing_consent`)
    expect(code).toBe('42501') // insufficient_privilege
  })

  it('🚨 a signed-in user cannot read who was messaged', async () => {
    const code = await asRole('authenticated', `SELECT * FROM public.notification_deliveries`)
    expect(code).toBe('42501')
  })

  it('a signed-in user cannot write themselves a consent row', async () => {
    const code = await asRole(
      'authenticated',
      `INSERT INTO public.marketing_consent (user_id, channel, opted_in)
       VALUES ('${USER_A}', 'push', true)`,
    )
    expect(code).toBe('42501')
  })

  it('RLS is enabled on all three, with zero policies', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)

    const p = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_policies
        WHERE tablename IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(p.n).toBe('0')
  })
})

// ===========================================================================
describe('M-5 — category is structural, not authorial', () => {
  it('🚨 a campaign cannot declare itself transactional', async () => {
    // An author who could store 'system' here would be exempt from every cap,
    // quiet-hours rule and consent check, because all of them key on category.
    const code = await insertFails(
      `INSERT INTO marketing_campaigns (title, body, created_by, category)
       VALUES ('x','y',$1,'system')`,
      [ADMIN],
    )
    expect(code).toBe('23514') // check_violation
  })

  it('the default is marketing, and marketing is accepted', async () => {
    const id = await campaign()
    const r = await one<{ category: string }>(
      `SELECT category FROM marketing_campaigns WHERE id=$1`, [id],
    )
    expect(r.category).toBe('marketing')
  })

  it('a delivery cannot be recorded under another category either', async () => {
    const id = await campaign()
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, category, status)
       VALUES ($1,$2,'system','sent')`,
      [id, USER_A],
    )
    expect(code).toBe('23514')
  })
})

// ===========================================================================
describe('M-16 — lifecycle values', () => {
  it('accepts draft, active and completed', async () => {
    for (const s of ['draft', 'active', 'completed']) {
      const id = await campaign(s)
      expect(id).toBeTruthy()
    }
  })

  it('rejects anything else', async () => {
    const code = await insertFails(
      `INSERT INTO marketing_campaigns (title, body, created_by, status)
       VALUES ('x','y',$1,'sending')`,
      [ADMIN],
    )
    expect(code).toBe('23514')
  })

  it('rejects an absolute link — a campaign reaches many people at once', async () => {
    const code = await insertFails(
      `INSERT INTO marketing_campaigns (title, body, link, created_by)
       VALUES ('x','y','https://evil.example/phish',$1)`,
      [ADMIN],
    )
    expect(code).toBe('23514')
  })

  it('rejects a protocol-relative link', async () => {
    const code = await insertFails(
      `INSERT INTO marketing_campaigns (title, body, link, created_by)
       VALUES ('x','y','//evil.example',$1)`,
      [ADMIN],
    )
    expect(code).toBe('23514')
  })

  it('accepts a relative path — positive control', async () => {
    const code = await insertFails(
      `INSERT INTO marketing_campaigns (title, body, link, created_by)
       VALUES ('x','y','/deals',$1)`,
      [ADMIN],
    )
    expect(code).toBeNull()
  })
})

// ===========================================================================
describe('M-34 — per-recipient idempotency', () => {
  it('🚨 the same recipient cannot be recorded twice for one campaign', async () => {
    const id = await campaign()
    await db.query(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [id, USER_A],
    )
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [id, USER_A],
    )
    expect(code).toBe('23505') // unique_violation
  })

  it('the same recipient CAN appear in a different campaign', async () => {
    const a = await campaign()
    const b = await campaign()
    await db.query(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [a, USER_A],
    )
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [b, USER_A],
    )
    expect(code).toBeNull()
  })
})

// ===========================================================================
describe('delivery rows explain themselves', () => {
  it('a skipped row must carry a reason', async () => {
    const id = await campaign()
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'skipped')`,
      [id, USER_A],
    )
    expect(code).toBe('23514')
  })

  it('a sent row must NOT carry a reason', async () => {
    const id = await campaign()
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status, skip_reason)
       VALUES ($1,$2,'sent','consent')`,
      [id, USER_A],
    )
    expect(code).toBe('23514')
  })

  it('accepts each governance skip reason the engine can produce', async () => {
    const id = await campaign()
    const reasons = ['consent', 'unsubscribed', 'frequency_24h', 'frequency_7d', 'quiet_hours', 'ineligible']
    for (const [i, reason] of reasons.entries()) {
      // A distinct campaign per row: (campaign_id, user_id) is unique.
      const c = i === 0 ? id : await campaign()
      const code = await insertFails(
        `INSERT INTO notification_deliveries (campaign_id, user_id, status, skip_reason)
         VALUES ($1,$2,'skipped',$3)`,
        [c, USER_A, reason],
      )
      expect(code, `reason ${reason} should be storable`).toBeNull()
    }
  })

  it('rejects an unknown skip reason', async () => {
    const id = await campaign()
    const code = await insertFails(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status, skip_reason)
       VALUES ($1,$2,'skipped','because')`,
      [id, USER_A],
    )
    expect(code).toBe('23514')
  })
})

// ===========================================================================
describe('M-27a — pruning cannot orphan a delivery', () => {
  it('🚨 deleting a campaign that still has deliveries is REFUSED', async () => {
    const id = await campaign()
    await db.query(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [id, USER_A],
    )
    const code = await insertFails(`DELETE FROM marketing_campaigns WHERE id=$1`, [id])
    expect(code).toBe('23503') // foreign_key_violation — RESTRICT, not CASCADE
  })

  it('deleting deliveries first, then the campaign, succeeds — the prune order', async () => {
    const id = await campaign()
    await db.query(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [id, USER_A],
    )
    expect(await insertFails(`DELETE FROM notification_deliveries WHERE campaign_id=$1`, [id])).toBeNull()
    expect(await insertFails(`DELETE FROM marketing_campaigns WHERE id=$1`, [id])).toBeNull()
  })

  it('deleting a USER cascades their consent and deliveries', async () => {
    // The person is gone; their consent and their delivery history go with
    // them. That direction is required by erasure (33 §6), and is the opposite
    // of the campaign case above.
    const id = await campaign()
    await db.query(`INSERT INTO auth.users (id) VALUES ($1)`, [
      '44444444-4444-4444-8444-444444444444',
    ])
    const doomed = '44444444-4444-4444-8444-444444444444'
    await db.query(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'push',true)`, [doomed],
    )
    await db.query(
      `INSERT INTO notification_deliveries (campaign_id, user_id, status) VALUES ($1,$2,'sent')`,
      [id, doomed],
    )
    await db.query(`DELETE FROM auth.users WHERE id=$1`, [doomed])

    const c = await one<{ n: string }>(`SELECT count(*) n FROM marketing_consent WHERE user_id=$1`, [doomed])
    const d = await one<{ n: string }>(`SELECT count(*) n FROM notification_deliveries WHERE user_id=$1`, [doomed])
    expect([c.n, d.n]).toEqual(['0', '0'])
  })
})

// ===========================================================================
describe('consent shape', () => {
  it('one row per (user, channel)', async () => {
    await db.query(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'push',true)`, [USER_A],
    )
    const code = await insertFails(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'push',false)`, [USER_A],
    )
    expect(code).toBe('23505')
  })

  it('accepts the three channels plus the reserved `global` row', async () => {
    for (const ch of ['push', 'email', 'in_app', 'global']) {
      const code = await insertFails(
        `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,$2,true)`,
        [USER_A, ch],
      )
      expect(code, `channel ${ch}`).toBeNull()
    }
  })

  it('rejects an invented channel', async () => {
    const code = await insertFails(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'sms',true)`, [USER_A],
    )
    expect(code).toBe('23514')
  })

  it('different users may each hold the same channel', async () => {
    await db.query(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'push',true)`, [USER_A],
    )
    const code = await insertFails(
      `INSERT INTO marketing_consent (user_id, channel, opted_in) VALUES ($1,'push',true)`, [USER_B],
    )
    expect(code).toBeNull()
  })
})

// ===========================================================================
describe('rollback', () => {
  it('drops all three tables, then the migration restores them', async () => {
    await db.query(ROLLBACK)
    const gone = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relkind='r'
        AND relname IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(gone.n).toBe('0')

    await db.query(MIGRATION)
    const back = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relkind='r'
        AND relname IN ('marketing_consent','marketing_campaigns','notification_deliveries')`,
    )
    expect(back.n).toBe('3')

    // 🔑 AND IT COMES BACK EMPTY. Re-applying after a rollback must not
    // resurrect consent, because there is nothing to resurrect it from — which
    // is the safe direction: everyone reads as opted out again.
    const consent = await one<{ n: string }>(`SELECT count(*) n FROM marketing_consent`)
    expect(consent.n).toBe('0')
  })
})
