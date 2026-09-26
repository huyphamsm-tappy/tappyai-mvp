import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// F-093 — the per-user stores that outlived account deletion.
//
// Account deletion is an operator deleting the Auth user; every per-user store
// must follow through its foreign key. `decision_evidence.owner_id` and
// `anon_chat_usage.user_id` carried none, so both kept the deleted user's rows
// (measured on the audit database in a rolled-back transaction, 2026-09-25).
// `user_memory` is the same class and is covered by user_memory_auth_fk.test.ts.
//
// The tables are built from their REAL creation migrations, so this suite tests
// the fix against the schema that ships — including decision_evidence_save,
// the only writer, which takes the owner from auth.uid().
//
// Two databases:
//   clean    no orphan rows — the migration must validate both constraints.
//   orphaned rows whose owner is already gone — the migration must still add
//            the cascade, must NOT delete those rows, and must leave the
//            constraint NOT VALID until the Owner-run purge.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const MIGRATION = read('supabase/migrations/20260925_account_deletion_cascade_gaps.sql')
const ROLLBACK = read('supabase/migrations/rollback/20260925_account_deletion_cascade_gaps_rollback.sql')
const DECISION_EVIDENCE = read('supabase/migrations/20260824_decision_evidence_state.sql')
const ANON_CHAT_USAGE = read('supabase/migrations/20260711_anon_chat_usage.sql')

const PORT = 54393

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
/** Deleted from Auth before the migration runs — the leftover the defect creates. */
const GHOST = '33333333-3333-4333-8333-333333333333'
/** Never inserted anywhere. */
const NOBODY = '55555555-5555-4555-8555-555555555555'

const PLATFORM = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255), is_anonymous BOOLEAN NOT NULL DEFAULT false);
  INSERT INTO auth.users (id, email) VALUES
    ('${SELF}', 'self@example.test'), ('${OTHER}', 'other@example.test'), ('${GHOST}', 'ghost@example.test');
`

/** One evidence row per owner, written through the real definer function, plus a usage row. */
const seed = (ids: string[]) => ids.map(id => `
  SELECT set_config('request.jwt.claim.sub', '${id}', false);
  SELECT public.decision_evidence_save(gen_random_uuid(), '{"v":1}'::jsonb);
  INSERT INTO public.anon_chat_usage (user_id, day, count) VALUES ('${id}', current_date, 3);
`).join('\n') + `SELECT set_config('request.jwt.claim.sub', '', false);`

let pg: EmbeddedPostgres
let dataDir: string
let clean: Client
let orphaned: Client

async function newClient(database: string): Promise<Client> {
  const { Client: PgClient } = await import('pg')
  const c = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database })
  await c.connect()
  return c
}

const count = async (db: Client, sql: string, params: unknown[] = []) => Number((await db.query(sql, params)).rows[0].c)
const rowsFor = async (db: Client, id: string) => ({
  evidence: await count(db, 'SELECT count(*) c FROM public.decision_evidence WHERE owner_id = $1', [id]),
  usage: await count(db, 'SELECT count(*) c FROM public.anon_chat_usage WHERE user_id = $1', [id]),
})
const fk = async (db: Client, name: string) =>
  (await db.query(`SELECT convalidated, confdeltype, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname = $1`, [name])).rows[0]

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'account-deletion-gaps-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()

  for (const name of ['clean', 'orphaned']) {
    await pg.createDatabase(name)
    const db = await newClient(name)
    await db.query(PLATFORM)
    await db.query(DECISION_EVIDENCE)
    await db.query(ANON_CHAT_USAGE)
    await db.query(seed([SELF, OTHER, GHOST]))
    if (name === 'clean') clean = db
    else orphaned = db
  }
  // The clean database never had the ghost's rows; the orphaned one keeps them
  // after the operator deletes the Auth user — exactly how the audit DB got its 9.
  await clean.query(`DELETE FROM public.decision_evidence WHERE owner_id = '${GHOST}'; DELETE FROM public.anon_chat_usage WHERE user_id = '${GHOST}'; DELETE FROM auth.users WHERE id = '${GHOST}'`)
  await orphaned.query(`DELETE FROM auth.users WHERE id = '${GHOST}'`)
}, 180_000)

afterAll(async () => {
  try { await clean?.end() } catch { /* closed */ }
  try { await orphaned?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* file locks */ }
})

describe('the defect, reproduced on the shipped schema', () => {
  it('deleting an Auth user leaves both stores behind before the migration', async () => {
    expect(await rowsFor(orphaned, GHOST)).toEqual({ evidence: 1, usage: 1 })
  })

  it('neither table has a foreign key yet — otherwise the assertions below are vacuous', async () => {
    expect(await count(clean, `SELECT count(*) c FROM pg_constraint WHERE contype='f'
      AND conrelid IN ('public.decision_evidence'::regclass, 'public.anon_chat_usage'::regclass)`)).toBe(0)
  })
})

describe('clean database — both constraints added and validated', () => {
  beforeAll(async () => { await clean.query(MIGRATION) })

  it('both foreign keys exist, reference auth.users, cascade, and are validated', async () => {
    for (const name of ['decision_evidence_owner_id_fkey', 'anon_chat_usage_user_id_fkey']) {
      const c = await fk(clean, name)
      expect(c, name).toBeDefined()
      expect(c.def).toContain('REFERENCES auth.users(id) ON DELETE CASCADE')
      expect(c.convalidated, name).toBe(true)
    }
  })

  it('deleting the account now removes every row of that account and nobody else’s', async () => {
    expect(await rowsFor(clean, SELF)).toEqual({ evidence: 1, usage: 1 })
    await clean.query(`DELETE FROM auth.users WHERE id = '${SELF}'`)
    expect(await rowsFor(clean, SELF)).toEqual({ evidence: 0, usage: 0 })
    expect(await rowsFor(clean, OTHER)).toEqual({ evidence: 1, usage: 1 })
  })

  it('a row for an owner that does not exist is refused (23503)', async () => {
    await expect(clean.query(`INSERT INTO public.anon_chat_usage (user_id, day, count) VALUES ('${NOBODY}', current_date, 1)`))
      .rejects.toMatchObject({ code: '23503' })
    await expect(clean.query(`INSERT INTO public.decision_evidence (id, owner_id, evidence, expires_at) VALUES (gen_random_uuid(), '${NOBODY}', '{}', now())`))
      .rejects.toMatchObject({ code: '23503' })
  })

  it('the real writer still works for a live owner', async () => {
    await clean.query(`SELECT set_config('request.jwt.claim.sub', '${OTHER}', false)`)
    await clean.query(`SELECT public.decision_evidence_save(gen_random_uuid(), '{"v":2}'::jsonb)`)
    await clean.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    expect((await rowsFor(clean, OTHER)).evidence).toBeGreaterThanOrEqual(1)
  })

  it('is idempotent — a second run changes nothing and does not fail', async () => {
    await clean.query(MIGRATION)
    expect(await count(clean, `SELECT count(*) c FROM pg_constraint WHERE conname IN
      ('decision_evidence_owner_id_fkey', 'anon_chat_usage_user_id_fkey')`)).toBe(2)
  })
})

describe('orphaned database — cascade added, existing leftovers NOT deleted by the schema change', () => {
  beforeAll(async () => { await orphaned.query(MIGRATION) })

  it('the migration deletes no row: the pre-existing leftovers are still there', async () => {
    expect(await rowsFor(orphaned, GHOST)).toEqual({ evidence: 1, usage: 1 })
  })

  it('the constraints exist but stay NOT VALID until the Owner-run purge', async () => {
    expect((await fk(orphaned, 'decision_evidence_owner_id_fkey')).convalidated).toBe(false)
    expect((await fk(orphaned, 'anon_chat_usage_user_id_fkey')).convalidated).toBe(false)
  })

  it('a NOT VALID constraint still cascades every future deletion', async () => {
    await orphaned.query(`DELETE FROM auth.users WHERE id = '${SELF}'`)
    expect(await rowsFor(orphaned, SELF)).toEqual({ evidence: 0, usage: 0 })
    expect(await rowsFor(orphaned, OTHER)).toEqual({ evidence: 1, usage: 1 })
  })

  it('the documented purge + VALIDATE (quoted from the migration header) completes the fix', async () => {
    const purge = MIGRATION.split('\n')
      .filter(l => /^--\s+(DELETE FROM|WHERE NOT|ALTER TABLE)/.test(l))
      .map(l => l.replace(/^--\s+/, ''))
      .join('\n')
    expect(purge).toContain('VALIDATE CONSTRAINT decision_evidence_owner_id_fkey')
    await orphaned.query(purge)
    expect(await rowsFor(orphaned, GHOST)).toEqual({ evidence: 0, usage: 0 })
    expect((await fk(orphaned, 'decision_evidence_owner_id_fkey')).convalidated).toBe(true)
    expect((await fk(orphaned, 'anon_chat_usage_user_id_fkey')).convalidated).toBe(true)
  })
})

describe('rollback', () => {
  it('drops exactly the two constraints and no data', async () => {
    const before = await count(clean, 'SELECT count(*) c FROM public.decision_evidence')
    await clean.query(ROLLBACK)
    expect(await count(clean, `SELECT count(*) c FROM pg_constraint WHERE conname IN
      ('decision_evidence_owner_id_fkey', 'anon_chat_usage_user_id_fkey')`)).toBe(0)
    expect(await count(clean, 'SELECT count(*) c FROM public.decision_evidence')).toBe(before)
  })
})
