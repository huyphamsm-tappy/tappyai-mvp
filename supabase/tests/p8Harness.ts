// PHASE 8 — shared embedded-PostgreSQL harness for the p8_* DB suites.
//
// Same platform facts as the existing suites (see chat_messaging_boundary.test.ts):
// Supabase roles, the auth.uid()/auth.jwt() shims, and — decisively — the OPEN
// default privileges production has, so a REVOKE assertion can never pass
// vacuously. Phase 8 suites use ports 548xx; the pre-existing suites use 543xx.

import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

export const REPO = join(__dirname, '..', '..')
export const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8')

export const ALICE = '11111111-1111-4111-8111-111111111111'
export const BOB = '22222222-2222-4222-8222-222222222222'
export const CAROL = '33333333-3333-4333-8333-333333333333'
export const ANON_USER = '44444444-4444-4444-8444-444444444444'

export const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE auth.users (id UUID PRIMARY KEY, is_anonymous BOOLEAN NOT NULL DEFAULT false);
  GRANT SELECT ON auth.users TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.harness_control (id INT PRIMARY KEY);

  INSERT INTO auth.users (id, is_anonymous) VALUES
    ('${ALICE}', false), ('${BOB}', false), ('${CAROL}', false), ('${ANON_USER}', true);
`

/**
 * The WHOLE production schema (docs/audit/schema-baseline/prod-schema-only.sql,
 * schema-only, no data) loaded into the embedded server — so a Phase 8
 * migration is tested against the tables, policies, grants and functions prod
 * actually has, not a hand-copied excerpt. Two platform shims only:
 *   - `vector` is not shipped with embedded-postgres; the snapshot declares the
 *     extension but no column uses it, so the line is dropped.
 *   - Supabase's `supabase_realtime` publication is created first.
 * Fails loudly if any statement does not apply: a partially-loaded schema would
 * let a test pass against a database prod does not have.
 */
export const PROD_SCHEMA_SETUP = [
  `CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
   CREATE PUBLICATION supabase_realtime;`,
]

export async function loadProdSchema(db: Client): Promise<void> {
  for (const sql of PROD_SCHEMA_SETUP) await db.query(sql)
  const snapshot = readRepo('docs/audit/schema-baseline/prod-schema-only.sql')
    .replace(/^CREATE EXTENSION IF NOT EXISTS "vector".*$/m, '')
  const statements = snapshot.split(/;\s*\n(?=(?:--|CREATE|ALTER|GRANT|REVOKE|COMMENT|DROP|SET|SELECT|INSERT|DO)\b)/)
  const failures: string[] = []
  for (const s of statements) {
    if (!s.replace(/--[^\n]*/g, '').trim()) continue
    try { await db.query(s) } catch (e) { failures.push(`${(e as Error).message} :: ${s.trim().slice(0, 80)}`) }
  }
  if (failures.length) throw new Error(`prod schema did not load cleanly (${failures.length}):\n${failures.slice(0, 10).join('\n')}`)
}

export interface P8Db {
  db: Client
  pg: EmbeddedPostgres
  stop(): Promise<void>
  /** Runs `sql` as `role` (with a JWT subject); returns SQLSTATE or null. */
  exec(role: string, sql: string, sub?: string | null, params?: unknown[]): Promise<string | null>
  /** Reads rows as `role`; throws if the role may not run the statement. */
  rows<T = Record<string, unknown>>(role: string, sql: string, sub?: string | null, params?: unknown[]): Promise<T[]>
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T>
}

export async function startP8Db(port: number, name: string, setupSql: string[]): Promise<P8Db> {
  const dataDir = mkdtempSync(join(tmpdir(), `p8-${name}-`))
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase(name)
  const db = pg.getPgClient(name) as unknown as Client
  await db.connect()
  await db.query(PRELUDE)
  for (const sql of setupSql) await db.query(sql)

  const setClaims = async (sub: string | null) => {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
      sub ? JSON.stringify({ sub, is_anonymous: sub === ANON_USER }) : '',
    ])
  }

  return {
    db,
    pg,
    async stop() {
      await db.end().catch(() => {})
      await pg.stop().catch(() => {})
      try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
    },
    async exec(role, sql, sub = null, params) {
      await setClaims(sub)
      try {
        await db.query(`SET ROLE ${role}`)
        await db.query(sql, params as never)
        return null
      } catch (e) {
        return (e as { code?: string }).code ?? 'unknown'
      } finally {
        await db.query('RESET ROLE')
      }
    },
    async rows(role, sql, sub = null, params) {
      await setClaims(sub)
      try {
        await db.query(`SET ROLE ${role}`)
        return (await db.query(sql, params as never)).rows
      } finally {
        await db.query('RESET ROLE')
      }
    },
    async one(sql, params) {
      return (await db.query(sql, params as never)).rows[0]
    },
  }
}
