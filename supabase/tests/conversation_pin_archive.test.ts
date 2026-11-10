import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Chat workspace slice 2: pin / archive flags on conversations (20261118_conversation_pin_archive.sql), proven at the DATABASE.
const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/20261118_conversation_pin_archive.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261118_conversation_pin_archive_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  -- The table as it exists today (supabase-schema.sql), before this migration.
  CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    title text DEFAULT 'Cuộc trò chuyện mới',
    category text DEFAULT 'general',
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can manage own conversations" ON public.conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
`
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const PORT = 54325 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4)', [A, 'a@example.com', B, 'b@example.com'])
}
async function asUser(uid: string, sql: string, params: unknown[] = []) {
  await db.query('SET ROLE authenticated')
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid])
  try { return await db.query(sql, params) } finally { await db.query('RESET ROLE') }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgconvpin-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('conversations.is_pinned / is_archived', () => {
  beforeEach(async () => { await setup() })

  it('existing rows read as not pinned and not archived; new rows default the same way', async () => {
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1, 'old one')`, [A])
    await db.query(MIG)
    expect((await db.query('SELECT is_pinned, is_archived FROM public.conversations')).rows).toEqual([{ is_pinned: false, is_archived: false }])
    await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1, 'new one')`, [A])
    expect((await db.query(`SELECT is_pinned, is_archived FROM public.conversations WHERE title = 'new one'`)).rows).toEqual([{ is_pinned: false, is_archived: false }])
  })

  it('both columns are NOT NULL', async () => {
    await db.query(MIG)
    const cols = (await db.query(`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='conversations' AND column_name IN ('is_pinned','is_archived') ORDER BY 1`)).rows
    expect(cols).toEqual([
      { column_name: 'is_archived', is_nullable: 'NO', data_type: 'boolean' },
      { column_name: 'is_pinned', is_nullable: 'NO', data_type: 'boolean' },
    ])
    await expect(db.query(`INSERT INTO public.conversations (user_id, is_pinned) VALUES ($1, NULL)`, [A])).rejects.toMatchObject({ code: '23502' })
  })

  it('is idempotent: applying it twice changes nothing and keeps the flags', async () => {
    await db.query(MIG)
    await db.query(`INSERT INTO public.conversations (user_id, title, is_pinned) VALUES ($1, 'pinned', true)`, [A])
    await db.query(MIG)
    expect((await db.query(`SELECT is_pinned FROM public.conversations WHERE title='pinned'`)).rows[0].is_pinned).toBe(true)
  })

  it('a person can pin and archive only their own conversation', async () => {
    await db.query(MIG)
    const mine = (await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1, 'mine') RETURNING id`, [A])).rows[0].id
    const theirs = (await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1, 'theirs') RETURNING id`, [B])).rows[0].id
    expect((await asUser(A, `UPDATE public.conversations SET is_pinned = true, is_archived = true WHERE id = $1`, [mine])).rowCount).toBe(1)
    expect((await asUser(A, `UPDATE public.conversations SET is_pinned = true WHERE id = $1`, [theirs])).rowCount).toBe(0)
    const rows = (await db.query(`SELECT title, is_pinned, is_archived FROM public.conversations ORDER BY title`)).rows
    expect(rows).toEqual([{ title: 'mine', is_pinned: true, is_archived: true }, { title: 'theirs', is_pinned: false, is_archived: false }])
  })

  it('the rollback drops only the two columns and keeps every conversation and message', async () => {
    await db.query(MIG)
    await db.query(`INSERT INTO public.conversations (user_id, title, messages, is_pinned) VALUES ($1, 'keep me', '[{"role":"user","content":"hi"}]', true)`, [A])
    await db.query(ROLLBACK)
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations'`)).rows.map(r => r.column_name)
    expect(cols).not.toContain('is_pinned')
    expect(cols).not.toContain('is_archived')
    const row = (await db.query(`SELECT title, messages FROM public.conversations`)).rows[0]
    expect(row.title).toBe('keep me')
    expect(row.messages).toEqual([{ role: 'user', content: 'hi' }])
    await db.query(ROLLBACK) // and it can be run again
  })
})
