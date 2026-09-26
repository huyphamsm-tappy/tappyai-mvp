import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// F-096 — what deleting an account takes with it (owner decisions 2026-09-25).
//
//   DELETE     shared_results the user owns (public /r/<slug> pages)      SET NULL → CASCADE
//   DELETE     notifications the user caused in OTHER people's inboxes    SET NULL → CASCADE
//   QUEUE      files + Google grant: one account_deletion_jobs row per deleted user, filled by a
//              BEFORE DELETE trigger on auth.users (so a dashboard deletion is covered too)
//   ANONYMISE  chat messages to other people — sender SET NULL, unchanged
//
// The tables are minimal shapes carrying the SAME foreign keys production has (measured on the
// audit catalog 2026-09-25: shared_results.owner_id, notifications.actor_id, chat_messages.
// sender_id all SET NULL; groups.creator_id and user_integrations.user_id CASCADE).
// Synthetic users only (RUNBOOK §A R11).
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const MIGRATION = read('supabase/migrations/20260925c_account_deletion_f096.sql')
const ROLLBACK = read('supabase/migrations/rollback/20260925c_account_deletion_f096_rollback.sql')

const PORT = 54395
const U = '11111111-1111-4111-8111-111111111111'      // the account being deleted
const OTHER = '22222222-2222-4222-8222-222222222222'
const THIRD = '33333333-3333-4333-8333-333333333333'
const BARE = '44444444-4444-4444-8444-444444444444'   // no groups, no integration
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001'      // created by U
const G2 = 'aaaaaaaa-0000-4000-8000-000000000002'      // created by OTHER
const S1 = 'bbbbbbbb-0000-4000-8000-000000000001'      // U's public share
const S2 = 'bbbbbbbb-0000-4000-8000-000000000002'      // OTHER's re-share of S1

const SHAPE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT);
  CREATE TABLE public.groups (id UUID PRIMARY KEY, creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, name TEXT NOT NULL);
  CREATE TABLE public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, access_token TEXT, refresh_token TEXT, UNIQUE (user_id, provider));
  CREATE TABLE public.shared_results (
    id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES public.shared_results(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}');
  CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT, body TEXT);
  CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, body TEXT NOT NULL);
`

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${U}', 'u@example.test'), ('${OTHER}', 'o@example.test'), ('${THIRD}', 't@example.test'), ('${BARE}', 'b@example.test');
  INSERT INTO public.groups (id, creator_id, name) VALUES ('${G1}', '${U}', 'U group'), ('${G2}', '${OTHER}', 'Other group');
  INSERT INTO public.user_integrations (user_id, provider, access_token, refresh_token) VALUES
    ('${U}', 'google_calendar', 'ya29.access-U', '1//refresh-U'),
    ('${OTHER}', 'google_calendar', 'ya29.access-O', '1//refresh-O');
  INSERT INTO public.shared_results (id, slug, owner_id, parent_id) VALUES
    ('${S1}', 'abc1234567', '${U}', NULL), ('${S2}', 'def1234567', '${OTHER}', '${S1}');
  INSERT INTO public.notifications (user_id, actor_id, title, body) VALUES
    ('${OTHER}', '${U}', 'Uyen binh luan review cua ban', '"quan nay ngon"'),
    ('${OTHER}', '${THIRD}', 'Tam thich review cua ban', NULL),
    ('${U}', '${OTHER}', 'Other thich review cua ban', NULL);
  INSERT INTO public.chat_messages (sender_id, body) VALUES ('${U}', 'hen gap o quan 1'), ('${OTHER}', 'ok');
`

let pg: EmbeddedPostgres
let dataDir: string
let before: Client
let after: Client

async function newClient(database: string): Promise<Client> {
  const { Client: PgClient } = await import('pg')
  const c = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database })
  await c.connect()
  return c
}
const count = async (db: Client, sql: string) => Number((await db.query(sql)).rows[0].c)
async function asRole(db: Client, role: string, sql: string): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' }
  finally { await db.query('RESET ROLE') }
}
const deltype = async (db: Client, table: string, col: string) => (await db.query(`
  SELECT c.confdeltype FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND a.attname = $2`, [table, col])).rows[0]?.confdeltype

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'account-deletion-f096-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'] })
  await pg.initialise()
  await pg.start()
  for (const name of ['before', 'after']) {
    await pg.createDatabase(name)
    const db = await newClient(name)
    await db.query(SHAPE)
    await db.query(SEED)
    if (name === 'after') { await db.query(MIGRATION); after = db } else before = db
  }
}, 180_000)

afterAll(async () => {
  try { await before?.end() } catch { /* closed */ }
  try { await after?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* file locks */ }
})

describe('the defect, reproduced on the production foreign keys', () => {
  it("deleting the account leaves the public share page and the notification carrying the user's name", async () => {
    await before.query(`DELETE FROM auth.users WHERE id = '${U}'`)
    expect(await count(before, `SELECT count(*) c FROM public.shared_results WHERE id = '${S1}' AND owner_id IS NULL`)).toBe(1)
    expect(await count(before, `SELECT count(*) c FROM public.notifications WHERE title LIKE 'Uyen%' AND actor_id IS NULL`)).toBe(1)
  })
})

describe('after the migration — deleting the account', () => {
  beforeAll(async () => { await after.query(`DELETE FROM auth.users WHERE id = '${U}'`) })

  it('both owner columns now cascade', async () => {
    expect(await deltype(after, 'public.shared_results', 'owner_id')).toBe('c')
    expect(await deltype(after, 'public.notifications', 'actor_id')).toBe('c')
  })

  it("DELETES the user's public share page; someone else's re-share keeps its own content", async () => {
    expect(await count(after, `SELECT count(*) c FROM public.shared_results WHERE id = '${S1}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.shared_results WHERE id = '${S2}' AND parent_id IS NULL AND owner_id = '${OTHER}'`)).toBe(1)
  })

  it("DELETES the notifications the user caused in other people's inboxes, and only those", async () => {
    expect(await count(after, `SELECT count(*) c FROM public.notifications WHERE title LIKE 'Uyen%'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.notifications WHERE actor_id = '${THIRD}'`)).toBe(1)
  })

  it('ANONYMISES messages sent to other people — unchanged: kept, sender removed', async () => {
    expect(await count(after, `SELECT count(*) c FROM public.chat_messages WHERE body = 'hen gap o quan 1' AND sender_id IS NULL`)).toBe(1)
  })

  it("QUEUES the files and the Google grant: one job with the user's groups and their token", async () => {
    const jobs = (await after.query(`SELECT user_id, group_ids, google_tokens, done_at FROM public.account_deletion_jobs`)).rows
    expect(jobs).toHaveLength(1)
    expect(jobs[0].user_id).toBe(U)
    expect(jobs[0].group_ids).toEqual([G1])
    expect(jobs[0].google_tokens).toEqual(['1//refresh-U'])
    expect(jobs[0].done_at).toBeNull()
  })

  it("the cascades still ran: the user's group and integration are gone, OTHER's are not", async () => {
    expect(await count(after, `SELECT count(*) c FROM public.groups WHERE id = '${G1}'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM public.groups WHERE id = '${G2}'`)).toBe(1)
    expect(await count(after, `SELECT count(*) c FROM public.user_integrations WHERE user_id = '${OTHER}'`)).toBe(1)
  })

  it('a user with no groups and no integration still gets a job (their uploads must go too)', async () => {
    await after.query(`DELETE FROM auth.users WHERE id = '${BARE}'`)
    const job = (await after.query(`SELECT group_ids, google_tokens FROM public.account_deletion_jobs WHERE user_id = '${BARE}'`)).rows
    expect(job).toEqual([{ group_ids: [], google_tokens: [] }])
  })

  it('🚨 the queue holds tokens: anon and authenticated cannot read it, service_role can', async () => {
    expect(await asRole(after, 'anon', 'SELECT * FROM public.account_deletion_jobs')).toBe('42501')
    expect(await asRole(after, 'authenticated', 'SELECT * FROM public.account_deletion_jobs')).toBe('42501')
    expect(await asRole(after, 'service_role', 'SELECT * FROM public.account_deletion_jobs')).toBeNull()
  })

  it('is idempotent', async () => {
    await after.query(MIGRATION)
    expect(await deltype(after, 'public.shared_results', 'owner_id')).toBe('c')
    expect(await count(after, `SELECT count(*) c FROM pg_trigger WHERE tgname = 'trg_enqueue_account_deletion'`)).toBe(1)
  })
})

describe('rollback', () => {
  it('restores SET NULL and removes the queue and its trigger', async () => {
    await after.query(ROLLBACK)
    expect(await deltype(after, 'public.shared_results', 'owner_id')).toBe('n')
    expect(await deltype(after, 'public.notifications', 'actor_id')).toBe('n')
    expect(await count(after, `SELECT count(*) c FROM pg_trigger WHERE tgname = 'trg_enqueue_account_deletion'`)).toBe(0)
    expect(await count(after, `SELECT count(*) c FROM pg_class WHERE relname = 'account_deletion_jobs'`)).toBe(0)
    await after.query(`DELETE FROM auth.users WHERE id = '${THIRD}'`) // no trigger left to fail
  })
})
