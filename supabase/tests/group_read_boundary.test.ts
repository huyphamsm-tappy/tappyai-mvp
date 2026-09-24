import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// S-1 — group membership must not be readable in bulk by the open internet.
//
// `group_members` holds `name`, `area`, `budget`, `food_preferences` and
// `dietary_restrictions`, tied to a `user_id`. `add_groups.sql` published all of
// it with `FOR SELECT USING (true)`.
//
// 🚨 THE ANON KEY IS PUBLIC. It ships in the browser bundle and the iOS app, so
// RLS is the only boundary, and `USING (true)` is not "readable by whoever holds
// the link" — PostgREST takes the filter from the caller, so it is "readable by
// anyone, all rows at once". The same mechanism was MEASURED against `reviews`
// on 2026-08-18.
//
// These tests are written as the four callers that actually exist:
//   anon        — an unauthenticated stranger with the public key
//   outsider    — a real account with no relationship to the group
//   member      — someone who joined
//   creator     — who made it
//
// The first two must see NOTHING. The last two must still see everything, or
// this is a feature deletion rather than a boundary.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const BASE = readFileSync(join(REPO, 'supabase/migrations/add_groups.sql'), 'utf8')
const AUTH = readFileSync(join(REPO, 'supabase/migrations/add_group_members_auth.sql'), 'utf8')
const BOUNDARY = readFileSync(join(REPO, 'supabase/migrations/20260904_group_read_boundary.sql'), 'utf8')

const PORT = 54391
const CREATOR = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const OUTSIDER = '33333333-3333-4333-8333-333333333333'

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- ADR-019: objects in this schema are BORN fully open. Without this the
  -- boundary assertions below would pass vacuously.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);

  -- auth.uid() reads the same session GUC PostgREST sets, so the policy text
  -- under test is the policy text that runs in production.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let groupId: string

/** Become one caller and read a table. Returns rows, or [] when RLS refuses. */
// One transaction, so `SET LOCAL ROLE` and the transaction-scoped JWT claim both
// survive to the statement under test. Set outside a transaction they are gone
// by the next query, which silently turns every caller into an anonymous one —
// the deny assertions would still pass and the allow assertions would fail for
// the wrong reason.
async function readAs(role: string, uid: string | null, sql: string): Promise<unknown[]> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    return (await db.query(sql)).rows
  } catch {
    return [] // a permission error is also "sees nothing"
  } finally {
    await db.query('ROLLBACK')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-groups-'))
  // --encoding=UTF8 for the same reason publication_boundary_rls.test.ts sets
  // it: the migrations carry 🚨 markers in their comments, and the default
  // WIN1252 cluster on this machine cannot represent them, so the file fails to
  // apply for a reason that has nothing to do with the policy under test.
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3)`, [CREATOR, MEMBER, OUTSIDER])
  await db.query(BASE)
  await db.query(AUTH)
  await db.query(BOUNDARY)
}, 240_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query('TRUNCATE public.group_members, public.groups CASCADE')
  const g = await db.query(
    `INSERT INTO public.groups (creator_id, name) VALUES ($1,'Bua toi thu 6') RETURNING id`, [CREATOR])
  groupId = g.rows[0].id
  await db.query(
    `INSERT INTO public.group_members (group_id, user_id, name, budget, food_preferences, dietary_restrictions, area)
     VALUES ($1,$2,'Linh','200k','lau','di ung hai san','Binh Thanh')`, [groupId, MEMBER])
})

const ALL_MEMBERS = 'SELECT name, area, dietary_restrictions FROM public.group_members'
const ALL_GROUPS = 'SELECT id, name, suggestion FROM public.groups'

describe('S-1 · the open internet cannot enumerate group membership', () => {
  it('🚨 anon reads NO member rows — the bulk PostgREST path is closed', async () => {
    expect(await readAs('anon', null, ALL_MEMBERS)).toEqual([])
  })

  it('🚨 anon reads NO group rows', async () => {
    expect(await readAs('anon', null, ALL_GROUPS)).toEqual([])
  })

  it("🚨 anon cannot read dietary_restrictions even when it names the group's id", async () => {
    // Knowing an id must not help: the policy, not the filter, decides.
    const rows = await readAs('anon', null,
      `SELECT dietary_restrictions FROM public.group_members WHERE group_id = '${groupId}'`)
    expect(rows).toEqual([])
  })

  it('🚨 an authenticated OUTSIDER reads nothing — an account is not a relationship', async () => {
    expect(await readAs('authenticated', OUTSIDER, ALL_MEMBERS)).toEqual([])
    expect(await readAs('authenticated', OUTSIDER, ALL_GROUPS)).toEqual([])
  })

  it('anon cannot probe membership through the helper either', async () => {
    const rows = await readAs('anon', null, `SELECT public.fn_group_participant('${groupId}') AS ok`)
    expect(rows).toEqual([]) // EXECUTE was revoked from anon
  })
})

describe('S-1 · the people the feature is for still see it', () => {
  it('the creator reads the group and its members', async () => {
    expect(await readAs('authenticated', CREATOR, ALL_GROUPS)).toHaveLength(1)
    const members = await readAs('authenticated', CREATOR, ALL_MEMBERS) as Array<{ name: string }>
    expect(members).toHaveLength(1)
    expect(members[0].name).toBe('Linh')
  })

  it('a member reads the group and its members', async () => {
    expect(await readAs('authenticated', MEMBER, ALL_GROUPS)).toHaveLength(1)
    expect(await readAs('authenticated', MEMBER, ALL_MEMBERS)).toHaveLength(1)
  })

  it('a member sees ONLY their own group, not every group', async () => {
    // The second group has no relationship to MEMBER; scoping must be per-group,
    // not "any authenticated user sees all groups".
    const other = await db.query(
      `INSERT INTO public.groups (creator_id, name) VALUES ($1,'Nhom khac') RETURNING id`, [OUTSIDER])
    await db.query(
      `INSERT INTO public.group_members (group_id, user_id, name, area) VALUES ($1,$2,'Nam','Q1')`,
      [other.rows[0].id, OUTSIDER])

    expect(await readAs('authenticated', MEMBER, ALL_GROUPS)).toHaveLength(1)
    expect(await readAs('authenticated', MEMBER, ALL_MEMBERS)).toHaveLength(1)
  })

  it('service_role still reads everything — the route path the product relies on', async () => {
    // `/api/group?id=…` serves the link holder through this role, keyed by the
    // id it was given. The capability is the UUID, not "everyone".
    const rows = await readAs('service_role', null, ALL_MEMBERS)
    expect(rows).toHaveLength(1)
  })
})

describe('S-1 · the write boundary from add_group_members_auth.sql still holds', () => {
  it('anon cannot insert a member row', async () => {
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', true)`)
    await db.query('SET ROLE anon')
    let code: string | null = null
    try {
      await db.query(
        `INSERT INTO public.group_members (group_id, user_id, name, area) VALUES ($1,$2,'X','Y')`,
        [groupId, OUTSIDER])
    } catch (e) { code = (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
    expect(code).not.toBeNull()
  })

  it('an authenticated user cannot insert a membership attributed to someone else', async () => {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [OUTSIDER])
    await db.query('SET ROLE authenticated')
    let code: string | null = null
    try {
      await db.query(
        `INSERT INTO public.group_members (group_id, user_id, name, area) VALUES ($1,$2,'X','Y')`,
        [groupId, MEMBER])
    } catch (e) { code = (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
    expect(code).not.toBeNull()
  })
})
