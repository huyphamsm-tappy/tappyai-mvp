import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// A message becomes a third target of user_reports (20261108). Real migrations executed verbatim on a minimal fixture.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const REPORTS = mig('20261001b_user_reports.sql')
const WIDEN = mig('20261108_user_reports_message_target.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261108_user_reports_message_target_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY);
`
const REPORTER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MSG = '99999999-9999-4999-8999-999999999999'
const PORT = 54341 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function codeAs(role: string, sub: string | null, sql: string): Promise<string | null> {
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
const file = (type: string, target = MSG, reason = 'harassment') =>
  codeAs('service_role', null, `INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${REPORTER}','${type}','${target}','${reason}')`)

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgurmsg-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)
beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(`INSERT INTO auth.users (id) VALUES ('${REPORTER}'), ('${OTHER}')`)
  await db.query(REPORTS)
})

describe('before the migration a message is not a report target', () => {
  it('the 20261001b CHECK refuses target_type "message"', async () => {
    expect(await file('message')).toBe('23514')
  })
})

describe('after 20261108', () => {
  beforeEach(async () => { await db.query(WIDEN) })

  it('a message can be reported (by the service role, the only writer) with the usual reasons', async () => {
    expect(await file('message')).toBeNull()
    expect(await file('message', '88888888-8888-4888-8888-888888888888', 'sexual')).toBeNull()
  })

  it('still one report per (reporter, target): the second report of the same message is a unique violation (the route answers "already reported")', async () => {
    expect(await file('message')).toBeNull()
    expect(await file('message')).toBe('23505')
  })

  it('comment and user targets still work, and any other target type is still refused', async () => {
    expect(await file('comment', '77777777-7777-4777-8777-777777777777')).toBeNull()
    expect(await file('user', OTHER)).toBeNull()
    expect(await file('thread')).toBe('23514')
    expect(await file('')).toBe('23514')
  })

  it('a client role still cannot write a report (the route is the only writer), message target included', async () => {
    expect(await codeAs('authenticated', REPORTER, `INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${REPORTER}','message','${MSG}','spam')`)).toBe('42501')
    expect(await codeAs('anon', null, `INSERT INTO public.user_reports (reporter_id, target_type, target_id, reason) VALUES ('${REPORTER}','message','${MSG}','spam')`)).toBe('42501')
  })

  it('the reporter reads their own message report and nobody else\'s', async () => {
    await file('message')
    const read = async (sub: string) => {
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub])
      await db.query('SET ROLE authenticated')
      try { return (await db.query(`SELECT count(*)::int AS n FROM public.user_reports WHERE target_type = 'message'`)).rows[0].n as number } finally { await db.query('RESET ROLE') }
    }
    expect(await read(REPORTER)).toBe(1)
    expect(await read(OTHER)).toBe(0)
  })

  it('applying it twice is harmless', async () => {
    await db.query(WIDEN); await db.query(WIDEN)
    expect(await file('message')).toBeNull()
  })

  it('the rollback keeps the stored message reports as evidence and refuses NEW ones; it re-applies cleanly', async () => {
    expect(await file('message')).toBeNull()
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT count(*)::int AS n FROM public.user_reports WHERE target_type = 'message'`)).rows[0].n).toBe(1)
    expect(await file('message', '88888888-8888-4888-8888-888888888888')).toBe('23514')
    await db.query(WIDEN)
    expect(await file('message', '88888888-8888-4888-8888-888888888888')).toBeNull()
  })
})
