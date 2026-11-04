import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Messenger images (20261109_chat_media.sql) proven at the DATABASE, the real migrations executed verbatim in the order production has them.
const REPO = join(__dirname, '..', '..')
const mig = (f: string) => readFileSync(join(REPO, 'supabase/migrations', f), 'utf8')
const CHAT = mig('20260905_chat_messaging_phase1.sql')
const REACH = mig('20260906_phase6_messenger_reachability.sql')
const CLIENT_ID = mig('20261105_chat_messages_client_id.sql')
const HARDEN = mig('20261107_chat_hardening.sql')
const MEDIA = mig('20261109_chat_media.sql')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261109_chat_media_rollback.sql'), 'utf8')

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
/** What Supabase has and plain PostgreSQL does not: the storage schema with its buckets table. */
const STORAGE = `CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);`

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const PORT = 54342 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function asSession(uid: string | null) {
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [uid === null ? '' : JSON.stringify({ sub: uid, role: 'authenticated', is_anonymous: false })])
}
async function errorAs(role: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try { await db.query(`SET ROLE ${role}`); await db.query(sql, params as never[]); return null }
  catch (e) { return (e as { code?: string }).code ?? 'unknown' } finally { await db.query('RESET ROLE') }
}
const follow = (x: string, y: string) => db.query('INSERT INTO public.user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [x, y])
async function threadAB(): Promise<string> {
  await follow(A, B); await follow(B, A)
  await asSession(A)
  await db.query('SET ROLE authenticated')
  try { return (await db.query('SELECT public.chat_start_direct($1) AS id', [B])).rows[0].id as string } finally { await db.query('RESET ROLE') }
}
const send = (t: string, sender: string, body: string, media?: { path: string; type?: string | null; w?: number | null; h?: number | null }) =>
  errorAs('authenticated',
    `INSERT INTO public.chat_messages (thread_id, sender_id, body, media_path, media_type, media_width, media_height) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [t, sender, body, media?.path ?? null, media ? (media.type === undefined ? 'image' : media.type) : null, media?.w ?? null, media?.h ?? null])

async function setup(withStorage = false) {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query('DROP PUBLICATION IF EXISTS supabase_realtime')
  await db.query(PRELUDE)
  if (withStorage) await db.query(STORAGE)
  await db.query(CHAT); await db.query(REACH); await db.query(CLIENT_ID); await db.query(HARDEN)
  for (const id of [A, B]) await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2)', [id, `${id}@example.com`])
  await asSession(null)
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgchatmedia-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('before the migration (the old rules)', () => {
  beforeEach(async () => { await setup() })
  it('an empty body is refused even if it were meant to be an image', async () => {
    const t = await threadAB()
    await asSession(A)
    // the media columns do not exist yet: a plain insert, as the web sends today
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ($1,$2,'')`, [t, A])).toBe('23514')
  })
})

describe('the body rule: text, an image, or both', () => {
  beforeEach(async () => { await setup(); await db.query(MEDIA) })

  it('text only still works, up to 4000 characters; 4001 is refused', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, 'xin chào')).toBeNull()
    expect(await send(t, A, 'x'.repeat(4000))).toBeNull()
    expect(await send(t, A, 'x'.repeat(4001))).toBe('23514')
  })

  it('an image with NO text is allowed; an empty body with NO image is refused', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/1-aaa.webp`, w: 800, h: 600 })).toBeNull()
    expect(await send(t, A, '')).toBe('23514')
  })

  it('an image with a caption is allowed', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, 'đây là món mình ăn', { path: `${t}/${A}/2-bbb.jpg` })).toBeNull()
  })
})

describe('the image reference', () => {
  beforeEach(async () => { await setup(); await db.query(MEDIA) })

  it('a path outside the message\'s own thread is refused', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `99999999-9999-4999-8999-999999999999/${A}/x.jpg` })).toBe('23514')
  })

  it('a path in somebody ELSE\'s folder is refused (a path cannot point at another person\'s object)', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${B}/x.jpg` })).toBe('23514')
  })

  it('only the type "image" is accepted, and a path without a type (or a type without a path) is refused', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/a.jpg`, type: 'video' })).toBe('23514')
    expect(await send(t, A, '', { path: `${t}/${A}/a.jpg`, type: null })).toBe('23514')
    expect(await errorAs('authenticated', `INSERT INTO public.chat_messages (thread_id, sender_id, body, media_type) VALUES ($1,$2,'x','image')`, [t, A])).toBe('23514')
  })

  it('width and height must be sane when given', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/a.jpg`, w: 0, h: 10 })).toBe('23514')
    expect(await send(t, A, '', { path: `${t}/${A}/b.jpg`, w: 20001, h: 10 })).toBe('23514')
    expect(await send(t, A, '', { path: `${t}/${A}/c.jpg`, w: 20000, h: 1 })).toBeNull()
  })

  it('one object belongs to ONE message', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/once.jpg` })).toBeNull()
    expect(await send(t, A, 'again', { path: `${t}/${A}/once.jpg` })).toBe('23505')
  })

  it('the existing rules still hold for an image message: not a participant → RLS; forged sender → RLS', async () => {
    const t = await threadAB()
    await db.query(`INSERT INTO auth.users (id, email) VALUES ('33333333-3333-4333-8333-333333333333','c@example.com')`)
    await asSession('33333333-3333-4333-8333-333333333333')
    expect(await send(t, '33333333-3333-4333-8333-333333333333', '', { path: `${t}/33333333-3333-4333-8333-333333333333/x.jpg` })).toBe('42501')
    await asSession(A)
    expect(await send(t, B, '', { path: `${t}/${B}/x.jpg` })).toBe('42501')
  })

  it('a deleted sender (the account is gone) leaves the image message and its path as they were', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/keep.jpg` })).toBeNull()
    await db.query('DELETE FROM auth.users WHERE id = $1', [A])
    const r = await db.query(`SELECT sender_id, media_path FROM public.chat_messages WHERE media_path LIKE '%keep.jpg'`)
    expect(r.rows).toEqual([{ sender_id: null, media_path: `${t}/${A}/keep.jpg` }])
  })
})

describe('the private bucket', () => {
  it('without a storage schema (plain PostgreSQL) the migration still applies', async () => {
    await setup(false)
    await expect(db.query(MEDIA)).resolves.toBeDefined()
  })

  it('with storage: the bucket is created PRIVATE, 5 MB, three image types, and no storage policy is created', async () => {
    await setup(true)
    await db.query(MEDIA)
    const r = await db.query(`SELECT public, file_size_limit::int AS lim, allowed_mime_types FROM storage.buckets WHERE id = 'chat-media'`)
    expect(r.rows).toEqual([{ public: false, lim: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }])
    expect((await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'storage'`)).rows[0].n).toBe(0)
  })

  it('an existing bucket of that name is never flipped to public or changed by re-applying', async () => {
    await setup(true)
    await db.query(`INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('chat-media','chat-media', false, 1000)`)
    await db.query(MEDIA); await db.query(MEDIA)
    expect((await db.query(`SELECT public, file_size_limit::int AS lim FROM storage.buckets WHERE id = 'chat-media'`)).rows).toEqual([{ public: false, lim: 1000 }])
  })
})

describe('re-apply and rollback', () => {
  beforeEach(async () => { await setup(); await db.query(MEDIA) })

  it('applying it twice is harmless', async () => {
    await db.query(MEDIA); await db.query(MEDIA)
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/x.jpg` })).toBeNull()
  })

  it('the rollback keeps every message and every media reference, and the old body rule returns for new rows', async () => {
    const t = await threadAB(); await asSession(A)
    expect(await send(t, A, '', { path: `${t}/${A}/img.jpg` })).toBeNull()
    expect(await send(t, A, 'text')).toBeNull()
    await db.query(ROLLBACK)
    expect((await db.query('SELECT count(*)::int AS n FROM public.chat_messages')).rows[0].n).toBe(2)
    expect((await db.query(`SELECT count(*)::int AS n FROM public.chat_messages WHERE media_path IS NOT NULL`)).rows[0].n).toBe(1)
    expect(await send(t, A, '')).toBe('23514') // an empty body is refused again
    await db.query(MEDIA) // and it re-applies after a rollback
    expect(await send(t, A, '', { path: `${t}/${A}/img2.jpg` })).toBeNull()
  })
})
