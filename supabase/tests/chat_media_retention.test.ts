import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Picture retention + orphan listing (20261110_chat_media_retention.sql) proven at the DATABASE, the real migrations executed verbatim in production order.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const CHAT = mig('20260905_chat_messaging_phase1.sql')
const REACH = mig('20260906_phase6_messenger_reachability.sql')
const CLIENT_ID = mig('20261105_chat_messages_client_id.sql')
const HARDEN = mig('20261107_chat_hardening.sql')
const MEDIA = mig('20261109_chat_media.sql')
const RETENTION = mig('20261110_chat_media_retention.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261110_chat_media_retention_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
  CREATE TABLE public.user_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (follower_id, following_id), CHECK (follower_id <> following_id));
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
  END $$;
`
/** What Supabase has and plain PostgreSQL does not: the storage schema with buckets and objects. */
const STORAGE = `
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
`

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const PORT = 54347 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string
let T: string

async function asSession(uid: string | null) {
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: false })])
}
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params as never[]); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
async function orphansAs(role: string, hours: number, limit: number): Promise<string[]> {
  await db.query(`SET ROLE ${role}`)
  try { return (await db.query('SELECT name FROM public.chat_media_orphans($1,$2)', [hours, limit])).rows.map(r => r.name as string) } finally { await db.query('RESET ROLE') }
}
const obj = (name: string, ageHours: number) =>
  db.query(`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('chat-media', $1, now() - make_interval(hours => $2))`, [name, ageHours])

async function setup(withStorage = true) {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP PUBLICATION IF EXISTS supabase_realtime')
  await db.query(PRELUDE)
  if (withStorage) await db.query(STORAGE)
  await db.query(CHAT); await db.query(REACH); await db.query(CLIENT_ID); await db.query(HARDEN); await db.query(MEDIA); await db.query(RETENTION)
  for (const id of [A, B]) await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
  for (const [x, y] of [[A, B], [B, A]]) await db.query('INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2)', [x, y])
  await asSession(A)
  await db.query('SET ROLE authenticated')
  try { T = (await db.query('SELECT public.chat_start_direct($1) AS id', [B])).rows[0].id as string } finally { await db.query('RESET ROLE') }
  await asSession(null)
}
const pictureRow = (name: string, ageDays: number) =>
  db.query(
    `INSERT INTO public.chat_messages (thread_id, sender_id, body, media_path, media_type, created_at) VALUES ($1,$2,'',$3,'image', now() - make_interval(days => $4))`,
    [T, A, `${T}/${A}/${name}`, ageDays])

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgchatretention-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('media_expired_at and its index', () => {
  beforeEach(async () => { await setup() })

  it('the column exists, is nullable, and existing rows stay unexpired', async () => {
    await pictureRow('a.webp', 0)
    const r = await db.query('SELECT media_expired_at FROM public.chat_messages WHERE media_path IS NOT NULL')
    expect(r.rows).toEqual([{ media_expired_at: null }])
  })

  it('the due-picture index exists and is partial (only pictures not yet expired)', async () => {
    const r = await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname='chat_messages_media_due_idx'`)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].indexdef).toMatch(/media_path IS NOT NULL/)
    expect(r.rows[0].indexdef).toMatch(/media_expired_at IS NULL/)
  })

  it('a participant cannot set it through the API role (no update right on chat_messages for clients)', async () => {
    await pictureRow('b.webp', 40)
    await asSession(A)
    const code = await errorAs('authenticated', `UPDATE public.chat_messages SET media_expired_at = now() WHERE thread_id = $1`, [T])
    // either refused (42501) or silently updates nothing (no UPDATE policy): in neither case is it set
    expect(code === null || code === '42501').toBe(true)
    const r = await db.query('SELECT count(*)::int AS n FROM public.chat_messages WHERE media_expired_at IS NOT NULL')
    expect(r.rows[0].n).toBe(0)
  })
})

describe('chat_media_orphans', () => {
  beforeEach(async () => { await setup() })

  it('lists objects no message refers to and that are old enough; never one a message refers to; never a young one', async () => {
    await obj(`${T}/${A}/used.webp`, 100); await pictureRow('used.webp', 5)
    await obj(`${T}/${A}/old-orphan.webp`, 48)
    await obj(`${T}/${A}/young-orphan.webp`, 2)
    expect(await orphansAs('service_role', 24, 100)).toEqual([`${T}/${A}/old-orphan.webp`])
  })

  it('an expired picture\'s object that is somehow still there is NOT an orphan (its message still refers to it): the retention job owns it', async () => {
    await obj(`${T}/${A}/x.webp`, 500); await pictureRow('x.webp', 40)
    await db.query('UPDATE public.chat_messages SET media_expired_at = now()')
    expect(await orphansAs('service_role', 24, 100)).toEqual([])
  })

  it('only the chat-media bucket is looked at', async () => {
    await db.query(`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('review-photos', 'other/x.webp', now() - interval '100 hours')`)
    expect(await orphansAs('service_role', 24, 100)).toEqual([])
  })

  it('the limit is applied and clamped (1..1000), the age is at least one hour', async () => {
    for (let i = 0; i < 5; i++) await obj(`${T}/${A}/o${i}.webp`, 48 + i)
    expect(await orphansAs('service_role', 24, 2)).toHaveLength(2)
    expect(await orphansAs('service_role', 24, 0)).toHaveLength(1)
    await obj(`${T}/${A}/fresh.webp`, 0)
    expect(await orphansAs('service_role', 0, 100)).not.toContain(`${T}/${A}/fresh.webp`)
  })

  it('only the service role may call it: anon and authenticated are refused (42501)', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(await errorAs(role, 'SELECT * FROM public.chat_media_orphans(24, 10)')).toBe('42501')
    }
  })

  it('without the storage schema (plain PostgreSQL) it returns nothing instead of failing', async () => {
    await setup(false)
    expect(await orphansAs('service_role', 24, 10)).toEqual([])
  })
})

describe('rollback', () => {
  it('drops the function and the index, keeps the column and every row', async () => {
    await setup()
    await pictureRow('keep.webp', 40)
    await db.query(ROLLBACK)
    expect((await db.query(`SELECT to_regprocedure('public.chat_media_orphans(integer,integer)') AS f`)).rows[0].f).toBeNull()
    expect((await db.query(`SELECT to_regclass('public.chat_messages_media_due_idx') AS i`)).rows[0].i).toBeNull()
    expect((await db.query('SELECT count(*)::int AS n FROM public.chat_messages WHERE media_path IS NOT NULL')).rows[0].n).toBe(1)
    await db.query('SELECT media_expired_at FROM public.chat_messages')
  })
})
