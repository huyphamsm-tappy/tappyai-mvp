import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// Chat workspace slice 3: projects (20261119_chat_projects.sql), proven at the DATABASE.
const REPO = join(__dirname, '..', '..')
const MIG = readFileSync(join(REPO, 'supabase/migrations/20261119_chat_projects.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20261119_chat_projects_rollback.sql'), 'utf8')

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, email VARCHAR(255));
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
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
const PORT = 54326 // unique across supabase/tests (portAllocation.test.ts)

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

async function setup() {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(MIG)
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4)', [A, 'a@example.com', B, 'b@example.com'])
}
async function asUser(uid: string, sql: string, params: unknown[] = []) {
  await db.query('SET ROLE authenticated')
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid])
  try { return await db.query(sql, params) } finally { await db.query('RESET ROLE') }
}
async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null } catch (e) { return (e as { code?: string }).code ?? 'unknown' }
}
const project = async (uid: string, title: string) => (await db.query(`INSERT INTO public.chat_projects (user_id, title) VALUES ($1, $2) RETURNING id`, [uid, title])).rows[0].id as string
const conversation = async (uid: string, title: string) => (await db.query(`INSERT INTO public.conversations (user_id, title) VALUES ($1, $2) RETURNING id`, [uid, title])).rows[0].id as string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgchatprojects-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)
afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

describe('chat_projects + conversations.project_id', () => {
  beforeEach(async () => { await setup() })

  it('title is 1-80 characters (blank refused), description up to 300', async () => {
    expect(await errorOf(() => project(A, '   '))).toBe('23514')
    expect(await errorOf(() => project(A, 'x'.repeat(81)))).toBe('23514')
    expect(await errorOf(() => project(A, 'x'.repeat(80)))).toBeNull()
    expect(await errorOf(() => db.query(`INSERT INTO public.chat_projects (user_id, title, description) VALUES ($1, 'ok', $2)`, [A, 'd'.repeat(301)]))).toBe('23514')
    expect(await errorOf(() => db.query(`INSERT INTO public.chat_projects (user_id, title, description) VALUES ($1, 'ok2', $2)`, [A, 'd'.repeat(300)]))).toBeNull()
  })

  it('a conversation can sit in the owner’s project; existing and new conversations default to no project', async () => {
    const p = await project(A, 'Đà Lạt cuối năm')
    const c = await conversation(A, 'c1')
    expect((await db.query('SELECT project_id FROM public.conversations WHERE id=$1', [c])).rows[0].project_id).toBeNull()
    await db.query('UPDATE public.conversations SET project_id=$1 WHERE id=$2', [p, c])
    expect((await db.query('SELECT project_id FROM public.conversations WHERE id=$1', [c])).rows[0].project_id).toBe(p)
  })

  it('a conversation cannot be put in someone else’s project (insert or update), even though the foreign key would allow it', async () => {
    const theirs = await project(B, 'Của B')
    const c = await conversation(A, 'c1')
    expect(await errorOf(() => db.query('UPDATE public.conversations SET project_id=$1 WHERE id=$2', [theirs, c]))).toBe('23503')
    expect(await errorOf(() => db.query(`INSERT INTO public.conversations (user_id, project_id) VALUES ($1, $2)`, [A, theirs]))).toBe('23503')
    // and through the signed-in role the same
    expect(await errorOf(() => asUser(A, 'UPDATE public.conversations SET project_id=$1 WHERE id=$2', [theirs, c]))).toBe('23503')
  })

  it('deleting a project keeps its conversations (they become project-less); deleting the account removes the projects', async () => {
    const p = await project(A, 'tạm')
    const c = await conversation(A, 'c1')
    await db.query('UPDATE public.conversations SET project_id=$1 WHERE id=$2', [p, c])
    await db.query('DELETE FROM public.chat_projects WHERE id=$1', [p])
    const row = (await db.query('SELECT project_id FROM public.conversations WHERE id=$1', [c])).rows[0]
    expect(row.project_id).toBeNull()
    await project(A, 'again')
    await db.query('DELETE FROM auth.users WHERE id=$1', [A])
    expect((await db.query('SELECT count(*)::int AS n FROM public.chat_projects')).rows[0].n).toBe(0)
  })

  it('row-level security: a person sees, edits and deletes only their own projects; anonymous sees none', async () => {
    const mine = await project(A, 'mine')
    const theirs = await project(B, 'theirs')
    expect((await asUser(A, 'SELECT title FROM public.chat_projects ORDER BY title')).rows).toEqual([{ title: 'mine' }])
    expect((await asUser(A, `UPDATE public.chat_projects SET title='hacked' WHERE id=$1`, [theirs])).rowCount).toBe(0)
    expect((await asUser(A, `DELETE FROM public.chat_projects WHERE id=$1`, [theirs])).rowCount).toBe(0)
    expect(await errorOf(() => asUser(A, `INSERT INTO public.chat_projects (user_id, title) VALUES ($1, 'forged')`, [B]))).toBe('42501')
    expect((await asUser(A, `UPDATE public.chat_projects SET title='renamed' WHERE id=$1`, [mine])).rowCount).toBe(1)
    await db.query('SET ROLE anon')
    expect(await errorOf(() => db.query('SELECT * FROM public.chat_projects'))).toBe('42501')
    await db.query('RESET ROLE')
  })

  it('is idempotent, and the rollback removes projects but keeps every conversation', async () => {
    await db.query(MIG) // a second time
    const p = await project(A, 'p')
    const c = await conversation(A, 'keep me')
    await db.query('UPDATE public.conversations SET project_id=$1 WHERE id=$2', [p, c])
    await db.query(ROLLBACK)
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations'`)).rows.map(r => r.column_name)
    expect(cols).not.toContain('project_id')
    expect((await db.query(`SELECT to_regclass('public.chat_projects') AS t`)).rows[0].t).toBeNull()
    expect((await db.query('SELECT title FROM public.conversations')).rows).toEqual([{ title: 'keep me' }])
    await db.query(ROLLBACK) // runs twice
  })
})
