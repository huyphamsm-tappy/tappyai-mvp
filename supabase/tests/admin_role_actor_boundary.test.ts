import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// F-032 — admin-role RPCs authorize on the VERIFIED identity, not on p_actor_id.
//
// Two independent defenses, both proven here:
//   1. GRANT LAYER — EXECUTE is revoked from anon/authenticated/PUBLIC, so no
//      PostgREST end-user role can call the function at all (the control that
//      holds the line today; see 20260807_platform_owner_revoke_public_execute).
//   2. BODY LAYER (defense in depth) — even if that grant were ever widened, the
//      function derives the actor from auth.uid() and requires owner/admin, so a
//      caller who spoofs p_actor_id gains nothing. Exercised by calling the body
//      as the definer (superuser) with an impersonated request.jwt.claims, the
//      way PostgREST would present each caller.
//
// auth.uid()/auth.jwt() are Supabase's own definitions (reading request.jwt.claims),
// not constant stubs — identity comes from the request, and tests SET the claims to
// impersonate a session (same technique as anonymous_chat.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const OWNER_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260803_platform_owner.sql'), 'utf8')
const REVOKE_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260807_platform_owner_revoke_public_execute.sql'), 'utf8')
const FORWARD_PATH = 'supabase/migrations/20260921_f032_admin_role_actor_from_authuid.sql'
const ROLLBACK_PATH = 'supabase/migrations/rollback/20260921_f032_admin_role_actor_from_authuid_rollback.sql'
const FORWARD = readFileSync(join(REPO, FORWARD_PATH), 'utf8')
const ROLLBACK = readFileSync(join(REPO, ROLLBACK_PATH), 'utf8')

const OWNER = '10000000-0000-4000-8000-000000000001'
const ADMIN = '10000000-0000-4000-8000-000000000002'
const PLAIN = '10000000-0000-4000-8000-000000000003'
const TARGET = '10000000-0000-4000-8000-000000000004'
const TARGET2 = '10000000-0000-4000-8000-000000000005'
const PORT = 54361

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  -- The platform fact both defenses are measured against: on Supabase a new
  -- function is born granted to anon, authenticated AND service_role (plus PUBLIC
  -- by Postgres default). Without this the REVOKE would pass vacuously.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Supabase's own definitions, not stubs: identity comes from the request's JWT.
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (id UUID PRIMARY KEY, full_name TEXT);
  INSERT INTO public.profiles (id, full_name) VALUES
    ('${OWNER}','Owner'), ('${ADMIN}','Admin'), ('${PLAIN}','Plain'),
    ('${TARGET}','Target'), ('${TARGET2}','Target2');

  CREATE TYPE admin_role AS ENUM ('super_admin','admin','moderator','analyst');
  CREATE TABLE public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, role admin_role NOT NULL,
    granted_by UUID, notes TEXT, expires_at TIMESTAMPTZ,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
  );
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

async function setClaims(claims: Record<string, unknown> | null) {
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ''])
}

/** Call fn_grant_admin_role in the DEFINER body (as superuser, bypassing the grant),
 *  under an impersonated request. Returns the created row, or the SQLSTATE on error. */
async function grantBody(o: {
  claims: Record<string, unknown> | null
  actor: string | null
  user: string
  role?: string
}): Promise<{ row?: { granted_by: string | null; role: string }; code: string | null }> {
  await setClaims(o.claims)
  try {
    const r = await db.query(
      `SELECT granted_by, role FROM fn_grant_admin_role($1,$2,$3::admin_role,null,null)`,
      [o.actor, o.user, o.role ?? 'admin'],
    )
    return { row: r.rows[0], code: null }
  } catch (e) {
    return { code: (e as { code?: string }).code ?? 'unknown' }
  } finally {
    await setClaims(null)
  }
}

/** Run `sql` as a PostgREST role (SET ROLE). Returns SQLSTATE or null. */
async function asRole(role: string, sql: string): Promise<string | null> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  } finally {
    await db.query('RESET ROLE')
  }
}

/** The raw error message for a role-layer call (to tell the grant deny apart from a body RAISE). */
async function asRoleMessage(role: string, sql: string): Promise<string> {
  try {
    await db.query(`SET ROLE ${role}`)
    await db.query(sql)
    return ''
  } catch (e) {
    return (e as { message?: string }).message ?? ''
  } finally {
    await db.query('RESET ROLE')
  }
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-f032-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false, initdbFlags: ['--locale=C'] })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(OWNER_MIGRATION)   // creates platform_owner, fn_is_platform_owner, fn_grant/revoke (trust-the-caller)
  await db.query(REVOKE_MIGRATION)  // the lockdown that holds the line today
  await db.query(FORWARD)           // the F-032 hardening under test
  // Seed: an owner and one active admin.
  await db.query(`INSERT INTO platform_owner (user_id, assigned_by, notes) VALUES ($1,'bootstrap','harness')`, [OWNER])
  await db.query(`INSERT INTO admin_roles (user_id, role) VALUES ($1,'admin')`, [ADMIN])
  await setClaims(null)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('defense 1 — the grant layer (no PostgREST end-user role can call it)', () => {
  it.each(['anon', 'authenticated'])('%s gets 42501 permission denied for the FUNCTION (not a body RAISE)', async (role) => {
    const msg = await asRoleMessage(role, `SELECT fn_grant_admin_role('${ADMIN}'::uuid,'${TARGET}'::uuid,'admin'::admin_role)`)
    expect(msg).toContain('permission denied for function fn_grant_admin_role')
    expect(await asRole(role, `SELECT fn_revoke_admin_role('${ADMIN}'::uuid, gen_random_uuid())`)).toBe('42501')
  })

  it('EXECUTE is held by service_role only — not anon/authenticated (PUBLIC covered transitively)', async () => {
    const row = await one<Record<string, boolean>>(`
      SELECT
        has_function_privilege('anon',          g.oid, 'EXECUTE') AS anon_grant,
        has_function_privilege('authenticated', g.oid, 'EXECUTE') AS auth_grant,
        has_function_privilege('service_role',  g.oid, 'EXECUTE') AS svc_grant,
        has_function_privilege('anon',          r.oid, 'EXECUTE') AS anon_revoke,
        has_function_privilege('authenticated', r.oid, 'EXECUTE') AS auth_revoke,
        has_function_privilege('service_role',  r.oid, 'EXECUTE') AS svc_revoke
      FROM pg_proc g, pg_proc r
      WHERE g.proname='fn_grant_admin_role' AND r.proname='fn_revoke_admin_role'
    `)
    expect(row).toEqual({
      anon_grant: false, auth_grant: false, svc_grant: true,
      anon_revoke: false, auth_revoke: false, svc_revoke: true,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('defense 2 — the body authorizes on the verified identity, not p_actor_id', () => {
  it('service_role caller grants admin, and granted_by is the p_actor_id it supplied (audit trail preserved)', async () => {
    const res = await grantBody({ claims: { role: 'service_role' }, actor: ADMIN, user: TARGET })
    expect(res.code).toBeNull()
    expect(res.row).toEqual({ granted_by: ADMIN, role: 'admin' })
  })

  it('an authenticated ADMIN (own JWT) grants admin, and granted_by is auth.uid() — p_actor_id is IGNORED', async () => {
    // Passes a bogus p_actor_id; the row must record the verified caller, not the parameter.
    const res = await grantBody({ claims: { role: 'authenticated', sub: ADMIN }, actor: PLAIN, user: TARGET })
    expect(res.code).toBeNull()
    expect(res.row).toEqual({ granted_by: ADMIN, role: 'admin' })
  })

  it('the platform OWNER (own JWT) may grant admin', async () => {
    const res = await grantBody({ claims: { role: 'authenticated', sub: OWNER }, actor: OWNER, user: TARGET })
    expect(res.code).toBeNull()
    expect(res.row?.granted_by).toBe(OWNER)
  })

  it('a PLAIN authenticated user is refused (42501) even though EXECUTE let them in', async () => {
    const res = await grantBody({ claims: { role: 'authenticated', sub: PLAIN }, actor: PLAIN, user: TARGET })
    expect(res.code).toBe('42501')
    expect((await one<{ c: string }>(`SELECT count(*) c FROM admin_roles WHERE user_id='${TARGET}'`)).c).toBe('0')
  })

  it('🔴 the closed escalation: a PLAIN user spoofing p_actor_id = the OWNER still gets 42501, no grant', async () => {
    // The exact two-account attack from F-032: pass someone authoritative as the actor.
    const res = await grantBody({ claims: { role: 'authenticated', sub: PLAIN }, actor: OWNER, user: PLAIN, role: 'admin' })
    expect(res.code).toBe('42501')
    expect((await one<{ c: string }>(`SELECT count(*) c FROM admin_roles WHERE user_id='${PLAIN}'`)).c).toBe('0')
  })

  it('an unauthenticated (no-session) non-service caller is refused', async () => {
    const res = await grantBody({ claims: null, actor: OWNER, user: TARGET })
    expect(res.code).toBe('42501')
  })

  it('self-promotion stays blocked on the service_role path (actor == target)', async () => {
    const res = await grantBody({ claims: { role: 'service_role' }, actor: TARGET, user: TARGET })
    expect(res.code).toBe('42501')
  })

  it('only the OWNER may grant super_admin — an admin cannot, the owner can', async () => {
    expect((await grantBody({ claims: { role: 'authenticated', sub: ADMIN }, actor: ADMIN, user: TARGET, role: 'super_admin' })).code).toBe('42501')
    expect((await grantBody({ claims: { role: 'authenticated', sub: OWNER }, actor: OWNER, user: TARGET, role: 'super_admin' })).code).toBeNull()
    // service_role may grant super_admin only if it supplies the owner's id as actor (unchanged rule).
    expect((await grantBody({ claims: { role: 'service_role' }, actor: ADMIN, user: TARGET2, role: 'super_admin' })).code).toBe('42501')
    expect((await grantBody({ claims: { role: 'service_role' }, actor: OWNER, user: TARGET2, role: 'super_admin' })).code).toBeNull()
  })

  it('fn_revoke_admin_role: a PLAIN user is refused; service_role succeeds', async () => {
    const roleId = (await one<{ id: string }>(`SELECT id FROM admin_roles WHERE user_id='${ADMIN}'`)).id
    // plain user
    await setClaims({ role: 'authenticated', sub: PLAIN })
    let code: string | null = null
    try { await db.query(`SELECT fn_revoke_admin_role($1,$2)`, [PLAIN, roleId]) } catch (e) { code = (e as { code?: string }).code ?? 'x' }
    await setClaims(null)
    expect(code).toBe('42501')
    expect((await one<{ c: string }>(`SELECT count(*) c FROM admin_roles WHERE id='${roleId}'`)).c).toBe('1')
    // service_role
    await setClaims({ role: 'service_role' })
    await db.query(`SELECT fn_revoke_admin_role($1,$2)`, [OWNER, roleId])
    await setClaims(null)
    expect((await one<{ c: string }>(`SELECT count(*) c FROM admin_roles WHERE id='${roleId}'`)).c).toBe('0')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the three release verifications, stated plainly', () => {
  it('1. a plain user JWT still gets 42501 (grant layer)', async () => {
    expect(await asRole('authenticated', `SELECT fn_grant_admin_role('${PLAIN}'::uuid,'${TARGET}'::uuid,'admin'::admin_role)`)).toBe('42501')
  })
  it('2. service-role provisioning still successfully grants admin', async () => {
    const res = await grantBody({ claims: { role: 'service_role' }, actor: ADMIN, user: TARGET })
    expect(res.code).toBeNull()
    expect((await one<{ c: string }>(`SELECT count(*) c FROM admin_roles WHERE user_id='${TARGET}' AND role='admin'`)).c).toBe('1')
  })
  it('3. an existing admin via their own JWT: blocked at the grant layer (must use the API), allowed at the body layer', async () => {
    // Grant layer: an admin is `authenticated`, so a direct RPC is denied — they must go through the service-role API.
    expect(await asRole('authenticated', `SELECT fn_grant_admin_role('${ADMIN}'::uuid,'${TARGET}'::uuid,'admin'::admin_role)`)).toBe('42501')
    // Body layer: their verified identity IS authorized (this is the derive-from-auth.uid() behavior).
    expect((await grantBody({ claims: { role: 'authenticated', sub: ADMIN }, actor: ADMIN, user: TARGET })).code).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the migration files', () => {
  it('the forward migration is idempotent', async () => {
    await expect(db.query(FORWARD)).resolves.toBeTruthy()
  })
  it('the forward migration never GRANTs these functions to a PostgREST end-user role', async () => {
    expect(FORWARD).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+fn_(grant|revoke)_admin_role[\s\S]{0,120}?(\banon\b|\bauthenticated\b)/i)
  })
  it('the rollback restores the trust-the-caller body (the flaw returns) but KEEPS the lockdown', async () => {
    await db.query(ROLLBACK)
    // Body layer: the old behavior is back — a spoofed p_actor_id now works again.
    await setClaims({ role: 'authenticated', sub: PLAIN })
    const r = await db.query(`SELECT granted_by FROM fn_grant_admin_role($1,$2,'admin'::admin_role,null,null)`, [OWNER, TARGET])
    await setClaims(null)
    expect(r.rows[0].granted_by).toBe(OWNER) // trusted the parameter again
    // Grant layer: still revoked — anon/authenticated cannot reach it over PostgREST.
    expect(await asRole('authenticated', `SELECT fn_grant_admin_role('${ADMIN}'::uuid,'${TARGET2}'::uuid,'admin'::admin_role)`)).toBe('42501')
  })
})
