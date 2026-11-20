import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Owner 20/11: the bill of a private group is private too. Written by the SERVER only; the creator and the accepted members read it; a pending person, a stranger and anon read nothing.
// The table itself refuses nonsense money (zero, negative, over a billion dong, more than 20 items).
const REPO = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const FILES = ['add_groups.sql', 'add_group_members_auth.sql', '20260904_group_read_boundary.sql', '20261204_group_join_approval.sql', '20261205_group_suggestion_votes.sql', '20261206_group_bills.sql'].map(read)

const PORT = 54394
const CREATOR = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const PENDING = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '44444444-4444-4444-8444-444444444444'

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let groupId: string

async function as(role: string, uid: string | null, sql: string): Promise<{ rows: Array<Record<string, unknown>>; error?: string }> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    return { rows: (await db.query(sql)).rows }
  } catch (e) {
    return { rows: [], error: (e as { code?: string }).code ?? 'error' }
  } finally {
    await db.query('ROLLBACK')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-group-bills-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3),($4)`, [CREATOR, MEMBER, PENDING, OUTSIDER])
  for (const f of FILES) await db.query(f)
}, 240_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query('TRUNCATE public.group_bills, public.group_votes, public.group_members, public.groups CASCADE')
  const g = await db.query(`INSERT INTO public.groups (creator_id, name) VALUES ($1,'Bua toi') RETURNING id`, [CREATOR])
  groupId = g.rows[0].id
  await db.query(`INSERT INTO public.group_members (group_id, user_id, name, area, status) VALUES ($1,$2,'Linh','Q1','member'),($1,$3,'Bao','Q1','pending')`, [groupId, MEMBER, PENDING])
  await db.query(`INSERT INTO public.group_bills (group_id, payer_id, total_vnd, tip_vnd, items) VALUES ($1,$2,400000,40000,'[{"name":"Bia","amountVnd":60000,"forId":"x"}]')`, [groupId, MEMBER])
})

const BILLS = 'SELECT total_vnd FROM public.group_bills'

describe('who reads the bill', () => {
  it('the creator and an accepted member read it; a pending person, a stranger and anon read nothing', async () => {
    expect((await as('authenticated', CREATOR, BILLS)).rows).toEqual([{ total_vnd: '400000' }])
    expect((await as('authenticated', MEMBER, BILLS)).rows).toHaveLength(1)
    expect((await as('authenticated', PENDING, BILLS)).rows).toEqual([])
    expect((await as('authenticated', OUTSIDER, BILLS)).rows).toEqual([])
    expect((await as('anon', null, BILLS)).rows).toEqual([])
  })
})

describe('who writes the bill: the server only', () => {
  it('no caller can insert, change or delete a bill, the payer and the creator included', async () => {
    for (const uid of [CREATOR, MEMBER, PENDING, OUTSIDER]) {
      expect((await as('authenticated', uid, `UPDATE public.group_bills SET total_vnd = 1 RETURNING id`)).rows, `update ${uid}`).toEqual([])
      expect((await as('authenticated', uid, `DELETE FROM public.group_bills RETURNING id`)).rows, `delete ${uid}`).toEqual([])
      expect((await as('authenticated', uid, `INSERT INTO public.group_bills (group_id, payer_id, total_vnd) VALUES ('${groupId}', '${uid}', 1000)`)).error, `insert ${uid}`).toBeDefined()
    }
    expect((await as('anon', null, `INSERT INTO public.group_bills (group_id, payer_id, total_vnd) VALUES ('${groupId}', '${OUTSIDER}', 1000)`)).error).toBeDefined()
  })
})

describe('the table refuses nonsense', () => {
  const ins = (cols: string, vals: string) => db.query(`INSERT INTO public.group_bills (group_id, payer_id, ${cols}) VALUES ('${groupId}', '${CREATOR}', ${vals})`)
  beforeEach(async () => { await db.query('DELETE FROM public.group_bills') })
  it('zero, negative or over-a-billion totals and tips are refused; a normal bill is accepted', async () => {
    await expect(ins('total_vnd', '0')).rejects.toMatchObject({ code: '23514' })
    await expect(ins('total_vnd', '-5')).rejects.toMatchObject({ code: '23514' })
    await expect(ins('total_vnd', '1000000001')).rejects.toMatchObject({ code: '23514' })
    await expect(ins('total_vnd, tip_vnd', '1000, -1')).rejects.toMatchObject({ code: '23514' })
    await expect(ins('total_vnd', '250000')).resolves.toBeDefined()
  })
  it('one bill per group, at most 20 items, items must be an array', async () => {
    await ins('total_vnd', '1000')
    await expect(ins('total_vnd', '2000')).rejects.toMatchObject({ code: '23505' })
    await db.query('DELETE FROM public.group_bills')
    const many = JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ name: `i${i}`, amountVnd: 1, forId: 'x' })))
    await expect(ins('total_vnd, items', `1000, '${many}'::jsonb`)).rejects.toMatchObject({ code: '23514' })
    await expect(ins('total_vnd, items', `1000, '{"a":1}'::jsonb`)).rejects.toMatchObject({ code: '23514' })
  })
  it('the bill leaves with the group', async () => {
    await ins('total_vnd', '1000')
    await db.query('DELETE FROM public.groups WHERE id = $1', [groupId])
    expect((await db.query('SELECT count(*)::int AS n FROM public.group_bills')).rows[0].n).toBe(0)
  })
})
