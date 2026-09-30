import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Security audit 2026-09-30 — "user A cannot read or change user B's data", table by table.
//
// The schema is the AUDIT database's own (fixtures/audit_schema_2026-09-30.sql: tables, RLS flags,
// policies, grants and functions read from its catalog in a READ ONLY transaction — no data). It is
// the deployed truth, including whatever migrations have or have NOT been applied there, rather
// than a reconstruction from repository files.
//
// For every table with an owner column, one row owned by B is seeded (as postgres), then:
//   A (authenticated) tries SELECT / UPDATE / DELETE on B's row and INSERT of a row owned by B;
//   anon tries SELECT.
// Any write succeeding is a failure. A read succeeding is a failure unless the table is on the
// PUBLIC_READ list below, each with the product reason it is public.
// Set RLS_MATRIX_OUT=<file> to write the full matrix as JSON (used for the audit report).
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 54302
const FIXTURE = readFileSync(join(__dirname, 'fixtures/audit_schema_2026-09-30.sql'), 'utf8')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** Tables another signed-in user (and anon, where stated) may READ by design. */
const PUBLIC_READ: Record<string, { anon: boolean; why: string }> = {
  profiles: { anon: true, why: 'public profile card (name, avatar, bio, follower counts); no email column exists' },
  reviews: { anon: true, why: 'published, non-hidden reviews are the public feed (RESTRICTIVE publication boundary)' },
  review_comments: { anon: true, why: 'comments under a public review (held-review boundary is migration 20260928c, unapplied here)' },
  comment_reactions: { anon: true, why: 'reaction counts under public comments' },
  user_follows: { anon: true, why: 'public social graph (followers / following lists)' },
}

/** The column that names a row's owner, in order of preference. */
const OWNER_COLUMNS = ['user_id', 'owner_id', 'owner_user_id', 'creator_id', 'follower_id', 'reporter_id', 'blocker_id', 'sender_id']

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'rls-matrix-'))

interface Row { table: string; owner: string; readByA: boolean; readByAnon: boolean; updateByA: string; deleteByA: string; insertAsB: string; readOwnByB: boolean; insertOwnByA: string }
const matrix: Row[] = []

async function tryAs(role: 'authenticated' | 'anon', uid: string | null, sql: string): Promise<{ ok: true; rows: number } | { ok: false; code: string }> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [uid ?? '', JSON.stringify(uid ? { sub: uid, role } : { role })])
    const r = await db.query(sql)
    return { ok: true, rows: r.rowCount ?? 0 }
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await db.query('ROLLBACK')
  }
}
const outcome = (r: { ok: true; rows: number } | { ok: false; code: string }) => (r.ok ? `ok:${r.rows}` : `denied:${r.code}`)

/** A literal of the column's type — enough to satisfy NOT NULL. */
function literal(type: string, udt: string, enumFirst: Map<string, string>): string {
  if (enumFirst.has(udt)) return `'${enumFirst.get(udt)}'::public.${udt}`
  if (type === 'ARRAY') return `'{}'`
  if (/uuid/.test(type)) return 'gen_random_uuid()'
  if (/int|numeric|double|real|smallint|bigint/.test(type)) return '0'
  if (/bool/.test(type)) return 'false'
  if (/json/.test(type)) return `'{}'`
  if (/timestamp/.test(type)) return 'now()'
  if (/^date/.test(type)) return 'current_date'
  if (/bytea/.test(type)) return `'\\x00'`
  if (/inet/.test(type)) return `'127.0.0.1'`
  return `'x'`
}

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('matrix')
  db = pg.getPgClient('matrix')
  await db.connect()
  await db.query(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(auth.jwt() ->> 'role', current_user) $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, is_anonymous boolean DEFAULT false, created_at timestamptz DEFAULT now(),
      last_sign_in_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb, deleted_at timestamptz, banned_until timestamptz);
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    SET check_function_bodies = off;`)
  const errors: string[] = []
  for (const stmt of FIXTURE.split(/\n(?=(?:CREATE|ALTER|REVOKE|GRANT) )/)) {
    try { await db.query(stmt) } catch (e) { errors.push(`${(e as Error).message} :: ${stmt.slice(0, 100)}`) }
  }
  if (errors.length) throw new Error(`fixture did not load:\n${errors.join('\n')}`)
  await db.query(`INSERT INTO auth.users (id) VALUES ('${A}'), ('${B}')`)

  const enums = await db.query(`SELECT t.typname, (SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder LIMIT 1) AS first
                                  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'`)
  const enumFirst = new Map<string, string>(enums.rows.map(r => [r.typname, r.first]))
  const cols = await db.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
                                 FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)
  const byTable = new Map<string, typeof cols.rows>()
  for (const c of cols.rows) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c])
  const tables = (await db.query(`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`)).rows.map(r => r.relname as string)

  for (const table of tables) {
    const tc = byTable.get(table) ?? []
    const owner = table === 'profiles' ? 'id' : OWNER_COLUMNS.find(o => tc.some(c => c.column_name === o))
    if (!owner) continue
    const values = (who: string) => tc
      .filter(c => c.column_name === owner || (c.is_nullable === 'NO' && c.column_default === null))
      .map(c => ({ col: c.column_name as string, val: c.column_name === owner ? `'${who}'` : literal(c.data_type, c.udt_name, enumFirst) }))
    const ins = (who: string) => { const v = values(who); return `INSERT INTO public."${table}" (${v.map(x => `"${x.col}"`).join(', ')}) VALUES (${v.map(x => x.val).join(', ')})` }
    try { await db.query(ins(B)) } catch (e) { throw new Error(`seeding ${table}: ${(e as Error).message}`) }

    const updatable = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1
                                         AND has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'UPDATE') LIMIT 1`, [table])).rows[0]?.column_name ?? owner
    const where = `WHERE "${owner}" = '${B}'`
    const readA = await tryAs('authenticated', A, `SELECT 1 FROM public."${table}" ${where}`)
    const readAnon = await tryAs('anon', null, `SELECT 1 FROM public."${table}" ${where}`)
    // Positive controls — the same harness, on the caller's OWN data. Without them a matrix of
    // "denied" could just mean the harness is broken.
    const readOwn = await tryAs('authenticated', B, `SELECT 1 FROM public."${table}" ${where}`)
    matrix.push({
      table, owner,
      readByA: readA.ok && readA.rows > 0,
      readByAnon: readAnon.ok && readAnon.rows > 0,
      updateByA: outcome(await tryAs('authenticated', A, `UPDATE public."${table}" SET "${updatable}" = "${updatable}" ${where}`)),
      deleteByA: outcome(await tryAs('authenticated', A, `DELETE FROM public."${table}" ${where}`)),
      insertAsB: outcome(await tryAs('authenticated', A, ins(B))),
      readOwnByB: readOwn.ok && readOwn.rows > 0,
      insertOwnByA: outcome(await tryAs('authenticated', A, ins(A))),
    })
  }
  if (process.env.RLS_MATRIX_OUT) writeFileSync(process.env.RLS_MATRIX_OUT, JSON.stringify(matrix, null, 1))
}, 300_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

const denied = (o: string) => o.startsWith('denied') || o === 'ok:0'

describe('RLS cross-user matrix on the audit schema (security audit 2026-09-30)', () => {
  it('covers every owner-scoped table (sanity: the harness really ran)', () => {
    expect(matrix.length).toBeGreaterThan(40)
  })

  it('positive control: owners DO read and create their own rows where the app lets them', () => {
    const own = ['conversations', 'favorites', 'price_watches', 'user_memory', 'user_preferences', 'review_saves', 'notifications']
    for (const t of own) expect(matrix.find(r => r.table === t)?.readOwnByB, `${t} read own`).toBe(true)
    for (const t of ['conversations', 'favorites', 'price_watches', 'user_memory', 'review_saves']) {
      expect(matrix.find(r => r.table === t)?.insertOwnByA, `${t} insert own`).toBe('ok:1')
    }
  })

  it('🚨 A can never UPDATE a row owned by B', () => {
    expect(matrix.filter(r => !denied(r.updateByA)).map(r => `${r.table}: ${r.updateByA}`)).toEqual([])
  })

  it('🚨 A can never DELETE a row owned by B', () => {
    expect(matrix.filter(r => !denied(r.deleteByA)).map(r => `${r.table}: ${r.deleteByA}`)).toEqual([])
  })

  it('🚨 A can never INSERT a row in B\'s name', () => {
    expect(matrix.filter(r => !denied(r.insertAsB)).map(r => `${r.table}: ${r.insertAsB}`)).toEqual([])
  })

  it('🚨 A reads B\'s rows only in the tables that are public by design', () => {
    expect(matrix.filter(r => r.readByA && !PUBLIC_READ[r.table]).map(r => r.table)).toEqual([])
  })

  it('🚨 anon reads only what is public to anon', () => {
    expect(matrix.filter(r => r.readByAnon && !PUBLIC_READ[r.table]?.anon).map(r => r.table)).toEqual([])
  })
})
