import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// security-audit L1 — increment_deal_click is callable only by the service role.
// Replays the REAL function + grant from 20260724_partner_deals_hardening.sql, then the migration.

const REPO = join(__dirname, '..', '..')
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260928b_revoke_increment_deal_click_public.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260928b_revoke_increment_deal_click_public_rollback.sql'), 'utf8')
const HARDENING = readFileSync(join(REPO, 'supabase/migrations/20260724_partner_deals_hardening.sql'), 'utf8')
const PORT = 54399
const DEAL = '3f2b8c1e-7d4a-4c6b-9e2f-1a2b3c4d5e6f'

/** Just the function and its grant, exactly as shipped. */
const RPC_SQL = HARDENING.slice(
  HARDENING.indexOf('CREATE OR REPLACE FUNCTION increment_deal_click'),
  HARDENING.indexOf('TO anon, authenticated;', HARDENING.indexOf('GRANT EXECUTE ON FUNCTION increment_deal_click')) + 'TO anon, authenticated;'.length,
)

const BASELINE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TABLE public.partner_deals (id UUID PRIMARY KEY, click_count INT NOT NULL DEFAULT 0);
  INSERT INTO public.partner_deals (id) VALUES ('${DEAL}');
`

let pg: EmbeddedPostgres
let db: Client
const dataDir = mkdtempSync(join(tmpdir(), 'deal-click-rpc-'))

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('dealclick')
  db = pg.getPgClient('dealclick')
  await db.connect()
}, 240_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(BASELINE)
  await db.query(RPC_SQL)
})

async function callAs(role: 'anon' | 'authenticated' | 'service_role'): Promise<'ok' | string> {
  await db.query('BEGIN')
  try {
    await db.query(`SET LOCAL ROLE ${role}`)
    await db.query(`SELECT public.increment_deal_click($1)`, [DEAL])
    return 'ok'
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('ROLLBACK')
  }
}

describe('increment_deal_click EXECUTE', () => {
  it('RED — as shipped, anon and authenticated can call it through PostgREST', async () => {
    expect(RPC_SQL).toContain('SECURITY DEFINER')
    expect(await callAs('anon')).toBe('ok')
    expect(await callAs('authenticated')).toBe('ok')
  })

  it('after the migration only the service role can', async () => {
    await db.query(MIGRATION)
    expect(await callAs('anon')).toBe('42501')
    expect(await callAs('authenticated')).toBe('42501')
    expect(await callAs('service_role')).toBe('ok')
  })

  it('PUBLIC no longer holds EXECUTE either (the default grant every function gets)', async () => {
    const aclOf = async () => (await db.query(`SELECT proacl::text AS acl FROM pg_proc WHERE proname = 'increment_deal_click'`)).rows[0].acl as string | null
    // A NULL acl means the defaults, which include PUBLIC EXECUTE; an entry "=X/owner" is PUBLIC.
    const before = await aclOf()
    expect(before === null || /(^|[{,])=X/.test(before)).toBe(true)
    await db.query(MIGRATION)
    const after = await aclOf()
    expect(after).not.toBeNull()
    expect(after).not.toMatch(/(^|[{,])=X/)
    expect(after).toMatch(/service_role=X/)
  })

  it('is idempotent, and the rollback restores the old grant', async () => {
    await db.query(MIGRATION)
    await db.query(MIGRATION)
    expect(await callAs('anon')).toBe('42501')
    await db.query(ROLLBACK)
    expect(await callAs('anon')).toBe('ok')
  })
})
