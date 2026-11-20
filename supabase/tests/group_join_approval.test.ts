import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Owner 20/11 (group dining is PRIVATE, not public information): a person needs a Tappy account AND the group leader's acceptance. Opening the invite link only files a REQUEST (status
// 'pending'); the leader accepts or declines; only the creator and ACCEPTED members read the group and its members. A pending person sees their own request and nothing else; nobody can accept
// themselves. These are the four callers that exist: creator, accepted member, pending person, outsider.
const REPO = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const BASE = read('add_groups.sql')
const AUTH = read('add_group_members_auth.sql')
const BOUNDARY = read('20260904_group_read_boundary.sql')
const APPROVAL = read('20261204_group_join_approval.sql')

const PORT = 54300
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

/** One caller, one statement, in one transaction that is always rolled back; returns rows, or the error code when the database refuses. */
async function as(role: string, uid: string | null, sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; error?: string }> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    return { rows: (await db.query(sql, params)).rows }
  } catch (e) {
    return { rows: [], error: (e as { code?: string }).code ?? 'error' }
  } finally {
    await db.query('ROLLBACK')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-group-approval-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3),($4)`, [CREATOR, MEMBER, PENDING, OUTSIDER])
  await db.query(BASE)
  await db.query(AUTH)
  await db.query(BOUNDARY)
  // a member who joined BEFORE this migration: must stay a member
  const g = await db.query(`INSERT INTO public.groups (creator_id, name) VALUES ($1,'Bua toi thu 6') RETURNING id`, [CREATOR])
  groupId = g.rows[0].id
  await db.query(`INSERT INTO public.group_members (group_id, user_id, name, budget, food_preferences, dietary_restrictions, area) VALUES ($1,$2,'Linh','200k','lau','di ung hai san','Binh Thanh')`, [groupId, MEMBER])
  await db.query(APPROVAL)
}, 240_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query(`DELETE FROM public.group_members WHERE user_id = $1`, [PENDING])
  await db.query(`INSERT INTO public.group_members (group_id, user_id, name, budget, food_preferences, dietary_restrictions, area, status) VALUES ($1,$2,'Bao','150k','bun','chay','Quan 1','pending')`, [groupId, PENDING])
})

const NAMES = `SELECT name, status FROM public.group_members ORDER BY name`

describe('a member who joined before the migration stays a member', () => {
  it('the old row has status member and still reads the group', async () => {
    expect((await as('authenticated', MEMBER, `SELECT status FROM public.group_members WHERE user_id = '${MEMBER}'`)).rows).toEqual([{ status: 'member' }])
    expect((await as('authenticated', MEMBER, 'SELECT id FROM public.groups')).rows).toHaveLength(1)
  })
})

describe('opening the link only files a request', () => {
  it('a new joiner inserts a row for themselves and it is ALWAYS pending, whatever status they write', async () => {
    const ins = (status: string | null) => `INSERT INTO public.group_members (group_id, user_id, name, area${status ? ', status' : ''}) VALUES ('${groupId}', '${OUTSIDER}', 'Cuong', 'Quan 3'${status ? `, '${status}'` : ''}) RETURNING status`
    for (const s of ['pending', 'member', null]) {
      const r = await as('authenticated', OUTSIDER, ins(s))
      expect(r.error, String(s)).toBeUndefined()
      expect(r.rows, String(s)).toEqual([{ status: 'pending' }]) // can not accept themselves, and the default 'member' is not a way in
    }
  })
  it('a row for ANOTHER person is still refused (the existing self-only rule is untouched)', async () => {
    const r = await as('authenticated', OUTSIDER, `INSERT INTO public.group_members (group_id, user_id, name, area) VALUES ('${groupId}', '${PENDING}', 'Gia', 'Quan 3')`)
    expect(r.error).toBeDefined()
  })
  it('the server (owner role) may still write an accepted member', async () => {
    const r = await db.query(`INSERT INTO public.group_members (group_id, user_id, name, area, status) VALUES ('${groupId}', '${OUTSIDER}', 'Cuong', 'Quan 3', 'member') RETURNING status`)
    expect(r.rows).toEqual([{ status: 'member' }])
    await db.query(`DELETE FROM public.group_members WHERE user_id = $1`, [OUTSIDER])
  })
  it('nobody can turn their own request into a membership (no update path for a caller)', async () => {
    const r = await as('authenticated', PENDING, `UPDATE public.group_members SET status = 'member' WHERE user_id = '${PENDING}' RETURNING id`)
    expect(r.rows).toHaveLength(0)
  })
  it('a pending person can withdraw their own request', async () => {
    const r = await as('authenticated', PENDING, `DELETE FROM public.group_members WHERE user_id = '${PENDING}' RETURNING id`)
    expect(r.rows).toHaveLength(1)
  })
})

describe('a pending person sees their own request and nothing else', () => {
  it('not the group, not the other members', async () => {
    expect((await as('authenticated', PENDING, 'SELECT id FROM public.groups')).rows).toEqual([])
    expect((await as('authenticated', PENDING, NAMES)).rows).toEqual([{ name: 'Bao', status: 'pending' }])
    expect((await as('authenticated', PENDING, `SELECT public.fn_group_participant('${groupId}') AS ok`)).rows).toEqual([{ ok: false }])
  })
  it('an outsider sees nothing at all', async () => {
    expect((await as('authenticated', OUTSIDER, NAMES)).rows).toEqual([])
    expect((await as('authenticated', OUTSIDER, 'SELECT id FROM public.groups')).rows).toEqual([])
    expect((await as('anon', null, NAMES)).rows).toEqual([])
  })
})

describe('accepted members and the creator', () => {
  it('an accepted member reads the group and the ACCEPTED members only, never another pending request', async () => {
    expect((await as('authenticated', MEMBER, 'SELECT id FROM public.groups')).rows).toHaveLength(1)
    expect((await as('authenticated', MEMBER, NAMES)).rows).toEqual([{ name: 'Linh', status: 'member' }])
  })
  it('the creator reads everything, pending requests included (to decide on them)', async () => {
    expect((await as('authenticated', CREATOR, NAMES)).rows).toEqual([{ name: 'Bao', status: 'pending' }, { name: 'Linh', status: 'member' }])
  })
  it('once the leader accepts (service side), the person becomes a participant', async () => {
    await db.query(`UPDATE public.group_members SET status = 'member' WHERE user_id = $1`, [PENDING])
    expect((await as('authenticated', PENDING, 'SELECT id FROM public.groups')).rows).toHaveLength(1)
    expect((await as('authenticated', PENDING, `SELECT public.fn_group_participant('${groupId}') AS ok`)).rows).toEqual([{ ok: true }])
    expect((await as('authenticated', MEMBER, NAMES)).rows).toHaveLength(2)
  })
})
