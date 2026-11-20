import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Owner 20/11: the vote of a private group is private too. Votes are written by the SERVER only; the creator and the accepted members read them; a pending person, a stranger and anon read nothing.
const REPO = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const FILES = ['add_groups.sql', 'add_group_members_auth.sql', '20260904_group_read_boundary.sql', '20261204_group_join_approval.sql', '20261205_group_suggestion_votes.sql'].map(read)

const PORT = 54393
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
  dataDir = mkdtempSync(join(tmpdir(), 'pg-group-votes-'))
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
  await db.query('TRUNCATE public.group_votes, public.group_members, public.groups CASCADE')
  const g = await db.query(`INSERT INTO public.groups (creator_id, name, suggestion_options) VALUES ($1,'Bua toi', '[{"id":"1","name":"A"},{"id":"2","name":"B"}]'::jsonb) RETURNING id`, [CREATOR])
  groupId = g.rows[0].id
  await db.query(`INSERT INTO public.group_members (group_id, user_id, name, area, status) VALUES ($1,$2,'Linh','Q1','member'),($1,$3,'Bao','Q1','pending')`, [groupId, MEMBER, PENDING])
  await db.query(`INSERT INTO public.group_votes (group_id, user_id, option_id) VALUES ($1,$2,'1'),($1,$3,'2')`, [groupId, CREATOR, MEMBER])
})

const VOTES = 'SELECT option_id FROM public.group_votes ORDER BY option_id'

describe('who reads the votes', () => {
  it('the creator and an accepted member read them', async () => {
    expect((await as('authenticated', CREATOR, VOTES)).rows).toHaveLength(2)
    expect((await as('authenticated', MEMBER, VOTES)).rows).toHaveLength(2)
  })
  it('a pending person, a stranger and anon read nothing', async () => {
    expect((await as('authenticated', PENDING, VOTES)).rows).toEqual([])
    expect((await as('authenticated', OUTSIDER, VOTES)).rows).toEqual([])
    expect((await as('anon', null, VOTES)).rows).toEqual([])
  })
})

describe('who writes the votes: the server only', () => {
  it('no caller can insert, change or delete a vote, a participant included', async () => {
    for (const uid of [CREATOR, MEMBER, PENDING, OUTSIDER]) {
      expect((await as('authenticated', uid, `INSERT INTO public.group_votes (group_id, user_id, option_id) VALUES ('${groupId}', '${uid}', '1')`)).error, `insert ${uid}`).toBeDefined()
      expect((await as('authenticated', uid, `UPDATE public.group_votes SET option_id = '2' WHERE user_id = '${uid}' RETURNING id`)).rows, `update ${uid}`).toEqual([])
      expect((await as('authenticated', uid, `DELETE FROM public.group_votes WHERE user_id = '${uid}' RETURNING id`)).rows, `delete ${uid}`).toEqual([])
    }
    expect((await as('anon', null, `INSERT INTO public.group_votes (group_id, user_id, option_id) VALUES ('${groupId}', '${OUTSIDER}', '1')`)).error).toBeDefined()
  })
  it('one vote per person per group (the server updates it when the person changes their mind)', async () => {
    await expect(db.query(`INSERT INTO public.group_votes (group_id, user_id, option_id) VALUES ('${groupId}', '${CREATOR}', '2')`)).rejects.toMatchObject({ code: '23505' })
  })
  it('the votes leave with the group', async () => {
    await db.query('DELETE FROM public.groups WHERE id = $1', [groupId])
    expect((await db.query('SELECT count(*)::int AS n FROM public.group_votes')).rows[0].n).toBe(0)
  })
})

describe('the decision columns', () => {
  it('the group keeps its cards and, once decided, the chosen place and the time', async () => {
    await db.query(`UPDATE public.groups SET chosen_option = '2', decided_at = now() WHERE id = $1`, [groupId])
    const r = await as('authenticated', MEMBER, 'SELECT chosen_option, jsonb_array_length(suggestion_options) AS n FROM public.groups')
    expect(r.rows).toEqual([{ chosen_option: '2', n: 2 }])
  })
})
