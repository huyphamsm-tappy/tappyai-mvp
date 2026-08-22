import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// Controller V2 — K-6 / B8: break-glass Owner recovery (R6).
//
// `01_ARCH` §10 R6, severity Critical: "Owner key loss = permanent lockout."
// Its mitigation names the authority — "a DB-level owner-reassignment procedure
// requiring both database and Vercel env access."
//
// The Owner's delegated decisions (2026-08-20) are D1 explicit target, D2
// recovery-only, D3 one-time with a short-lived window, D4 system actor with an
// audit write that ABORTS the recovery if it cannot be durably written.
//
// WHY THIS IS DATABASE-ONLY, AND WHY THAT IS THE SECURITY PROPERTY
// The three functions hold EXECUTE for **nobody** — not `anon`, not
// `authenticated`, not `service_role`. That is the same shape C8 gave
// `fn_outbox_publish` (P4), and here it is what makes "break-glass must not
// become a hidden super-admin backdoor" structural rather than promised: the
// application has no way to call it at all, so no second authorization path can
// exist. Combined with the Owner Gate — which already 403s the whole Controller
// on a DB-only or env-only change — recovery genuinely requires two accesses.
//
// SCOPE. The DATABASE boundary: grants, RLS, the state machine, replay
// protection, the single-active-Owner invariant, and audit-abort. The env half
// is `checkOwnerGate`, covered by `owner.test.ts`, and is not re-proven here.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const OWNER_MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20260803_platform_owner.sql'), 'utf8')
const MIGRATION_PATH = 'supabase/migrations/20260820_b8_owner_recovery.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54357
const LOST_OWNER = '11111111-1111-4111-8111-111111111111'
const SUCCESSOR = '22222222-2222-4222-8222-222222222222'
const STRANGER = '33333333-3333-4333-8333-333333333333'
const ABSENT = '99999999-9999-4999-8999-999999999999'
const REASON = 'owner credential lost, hardware token destroyed in office fire'

/** The production baseline both migrations land on. */
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- The platform fact every migration must defend against: a new table AND a
  -- new function in this schema are BORN fully open. Without both lines, every
  -- REVOKE assertion below passes vacuously — the ACL would be empty because
  -- nothing ever granted anything, not because the migration took it away
  -- (ADR-019). Same shape as c8_event_outbox and c11_session_security.
  --
  -- WARNING: the FUNCTIONS line was MISSING on the first pass, and mutation
  -- testing caught it. Dropping service_role from the REVOKE list SURVIVED,
  -- because PostgreSQL's own PUBLIC default was then the only grant in play and
  -- revoking PUBLIC alone happened to be enough. With the platform default
  -- modelled, service_role holds a DIRECT grant, so omitting it from the REVOKE
  -- leaves the function callable from the application tier - which is the
  -- entire property this migration exists to guarantee.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO public.profiles (id, full_name) VALUES
    ('${LOST_OWNER}', 'Lost Owner'), ('${SUCCESSOR}', 'Successor'), ('${STRANGER}', 'Stranger');

  CREATE TYPE admin_role AS ENUM ('super_admin','admin','moderator','analyst');
  CREATE TABLE public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, role admin_role NOT NULL,
    granted_by UUID, notes TEXT, expires_at TIMESTAMPTZ,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
  );

  CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL, actor_email TEXT NOT NULL, actor_role TEXT NOT NULL,
    action TEXT NOT NULL, target_type TEXT, target_id TEXT,
    before_state JSONB, after_state JSONB, metadata JSONB,
    ip_address INET, user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Control object: created under the same open defaults and never revoked. Its
  -- ACL is the proof the defaults were in force, which is what makes the
  -- recovery table's closed ACL mean something.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

/** Run `sql`; return the SQLSTATE on failure, or null on success. */
async function sqlstate(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown'
  }
}

/** Run as `role`; returns SQLSTATE or null. */
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

const arm = (target = SUCCESSOR, reason = REASON, minutes = 30) =>
  one<{ id: string; expires_at: string }>(
    `SELECT * FROM fn_owner_recovery_arm($1, $2, $3)`,
    [target, reason, minutes]
  )

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-b8-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  await db.query(PRELUDE)
  await db.query(OWNER_MIGRATION)
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* already closed */ }
  try { await pg?.stop() } catch { /* already stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DELETE FROM platform_owner_recovery')
  await db.query('DELETE FROM platform_owner')
  await db.query('DELETE FROM audit_log')
  await db.query(
    `INSERT INTO platform_owner (user_id, assigned_by, notes) VALUES ($1, 'bootstrap', 'harness')`,
    [LOST_OWNER]
  )
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the recovery surface is unreachable from the application', () => {
  it.each(['anon', 'authenticated', 'service_role'])(
    '%s cannot execute fn_owner_recovery_arm',
    async (role) => {
      expect(await asRole(role, `SELECT fn_owner_recovery_arm('${SUCCESSOR}', '${REASON}', 30)`)).toBe('42501')
    }
  )

  it.each(['anon', 'authenticated', 'service_role'])(
    '%s cannot execute fn_owner_recovery_execute',
    async (role) => {
      expect(await asRole(role, `SELECT fn_owner_recovery_execute(gen_random_uuid())`)).toBe('42501')
    }
  )

  it.each(['anon', 'authenticated', 'service_role'])(
    '%s cannot execute fn_owner_recovery_cancel',
    async (role) => {
      expect(await asRole(role, `SELECT fn_owner_recovery_cancel(gen_random_uuid(), '${REASON}')`)).toBe('42501')
    }
  )

  it('has_function_privilege is the authority, and it says no for every PostgREST role', async () => {
    const row = await one<Record<string, boolean>>(`
      SELECT
        has_function_privilege('anon',          'fn_owner_recovery_arm(uuid,text,integer)', 'EXECUTE')     AS anon_arm,
        has_function_privilege('authenticated', 'fn_owner_recovery_arm(uuid,text,integer)', 'EXECUTE')     AS auth_arm,
        has_function_privilege('service_role',  'fn_owner_recovery_arm(uuid,text,integer)', 'EXECUTE')     AS svc_arm,
        has_function_privilege('service_role',  'fn_owner_recovery_execute(uuid)',          'EXECUTE')     AS svc_exec,
        has_function_privilege('service_role',  'fn_owner_recovery_cancel(uuid,text)',      'EXECUTE')     AS svc_cancel
    `)
    expect(row).toEqual({
      anon_arm: false, auth_arm: false, svc_arm: false, svc_exec: false, svc_cancel: false,
    })
  })

  it('no PostgREST role holds any privilege on the recovery table', async () => {
    const { rows } = await db.query(`
      SELECT DISTINCT grantee FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='platform_owner_recovery'
         AND grantee IN ('anon','authenticated','service_role','PUBLIC')
    `)
    expect(rows).toEqual([])
  })

  it('the harness control table IS open — proving the defaults were in force', async () => {
    // Without this, the assertion above would pass because nothing ever granted
    // anything, not because the migration took it away.
    const { rows } = await db.query(`
      SELECT DISTINCT grantee FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='harness_control' AND grantee='anon'
    `)
    expect(rows).toHaveLength(1)
  })

  it('RLS is enabled with zero policies — deny by default, like platform_owner', async () => {
    const row = await one<{ rls: boolean; policies: string }>(`
      SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.platform_owner_recovery'::regclass) AS rls,
             (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='platform_owner_recovery') AS policies
    `)
    expect(row.rls).toBe(true)
    expect(Number(row.policies)).toBe(0)
  })

  it('every function is SECURITY DEFINER with a pinned search_path', async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; cfg: string[] | null }>(`
      SELECT proname, prosecdef, proconfig AS cfg FROM pg_proc
       WHERE proname LIKE 'fn_owner_recovery_%' ORDER BY proname
    `)
    // Four: arm, cancel, execute, and the internal audit writer. The audit
    // helper is named here on purpose — an unlisted SECURITY DEFINER function
    // is exactly what ADR-019's sweep exists to catch.
    expect(rows.map((r) => r.proname)).toEqual([
      'fn_owner_recovery_arm',
      'fn_owner_recovery_audit',
      'fn_owner_recovery_cancel',
      'fn_owner_recovery_execute',
    ])
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(true)
      expect(r.cfg?.join(','), r.proname).toContain('search_path=public, pg_temp')
    }
  })
})

describe('D1 — the replacement Owner is NAMED, never derived', () => {
  it('arming a target with no profile fails, and creates no window', async () => {
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,30)`, [ABSENT, REASON])).toBe('P0002')
    expect(Number((await one<{ c: string }>(`SELECT count(*) c FROM platform_owner_recovery`)).c)).toBe(0)
  })

  it('arming the CURRENT Owner is refused — recovery to the lost account recovers nothing', async () => {
    // The defect the design audit found: the bootstrap seed derives from "the
    // sole active super_admin", which in production IS the Owner. This is the
    // structural guard against that mistake being repeated by hand.
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,30)`, [LOST_OWNER, REASON])).toBe('23514')
  })

  it('a reason under 20 characters is refused', async () => {
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,30)`, [SUCCESSOR, 'lost'])).toBe('23514')
  })

  it('the target is not required to hold any admin role', async () => {
    // Requiring one would reproduce the lockout: production has exactly one
    // super_admin and it is the lost Owner. The authority here is possession of
    // database AND deployment env, not the target's prior standing.
    const { rows } = await db.query(`SELECT 1 FROM admin_roles WHERE user_id = $1`, [SUCCESSOR])
    expect(rows).toHaveLength(0)
    const w = await arm()
    expect(w.id).toBeTruthy()
  })
})

describe('D3 — one-time, short-lived', () => {
  it('only ONE window may be open at a time', async () => {
    await arm()
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,30)`, [STRANGER, REASON])).toBe('23514')
  })

  it('the open-window index is UNIQUE — the concurrency guarantee, not just the guard', async () => {
    // Mutation R12 downgraded this to a plain index and SURVIVED: the explicit
    // `IF EXISTS` check in `arm` still refused a second window on one
    // connection. The index is what refuses it under CONCURRENCY, which a
    // single-connection test cannot exercise — so it is asserted structurally,
    // exactly as `uq_platform_owner_single_active` is.
    const row = await one<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_platform_owner_recovery_open'`
    )
    expect(row.indexdef).toContain('CREATE UNIQUE INDEX')
    expect(row.indexdef).toContain('closed_at IS NULL')
  })

  it('a window outside the permitted bounds is refused', async () => {
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,1)`, [SUCCESSOR, REASON])).toBe('23514')
    expect(await sqlstate(`SELECT fn_owner_recovery_arm($1,$2,100000)`, [SUCCESSOR, REASON])).toBe('23514')
  })

  it('executing consumes the window — a replay is refused', async () => {
    const w = await arm()
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])).toBeNull()
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])).toBe('23514')
  })

  it('an EXPIRED window cannot be executed', async () => {
    const w = await arm()
    await db.query(`UPDATE platform_owner_recovery SET requested_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE id = $1`, [w.id])
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])).toBe('23514')
  })

  it('an expired window leaves ownership untouched', async () => {
    const w = await arm()
    await db.query(`UPDATE platform_owner_recovery SET requested_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE id = $1`, [w.id])
    await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const owner = await one<{ user_id: string }>(`SELECT user_id FROM platform_owner WHERE active`)
    expect(owner.user_id).toBe(LOST_OWNER)
  })

  it('an unknown recovery id is refused', async () => {
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [ABSENT])).toBe('P0002')
  })

  it('a cancelled window cannot be executed — reversible before use', async () => {
    const w = await arm()
    expect(await sqlstate(`SELECT fn_owner_recovery_cancel($1,$2)`, [w.id, REASON])).toBeNull()
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])).toBe('23514')
  })

  it('cancelling frees the slot for a new window', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_cancel($1,$2)`, [w.id, REASON])
    const second = await arm(STRANGER)
    expect(second.id).not.toBe(w.id)
  })
})

describe('the ownership transition', () => {
  it('moves ownership to the named target', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const owner = await one<{ user_id: string; assigned_by: string }>(
      `SELECT user_id, assigned_by FROM platform_owner WHERE active`
    )
    expect(owner.user_id).toBe(SUCCESSOR)
    expect(owner.assigned_by).toBe('break_glass')
  })

  it('leaves exactly ONE active Owner — the invariant survives', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const row = await one<{ c: string }>(`SELECT count(*) c FROM platform_owner WHERE active`)
    expect(Number(row.c)).toBe(1)
  })

  it('RETAINS the previous Owner row, revoked rather than deleted', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const prev = await one<{ active: boolean; revoked_at: string | null }>(
      `SELECT active, revoked_at FROM platform_owner WHERE user_id = $1`, [LOST_OWNER]
    )
    expect(prev.active).toBe(false)
    expect(prev.revoked_at).not.toBeNull()
  })

  it('works when there is NO active Owner at all', async () => {
    // The other lockout shape: the row was deleted, or bootstrap never ran.
    await db.query(`DELETE FROM platform_owner`)
    const w = await arm()
    expect(await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])).toBeNull()
    expect((await one<{ user_id: string }>(`SELECT user_id FROM platform_owner WHERE active`)).user_id).toBe(SUCCESSOR)
  })

  it('grants the new Owner NO admin role — the Owner is not a role', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const { rows } = await db.query(`SELECT 1 FROM admin_roles WHERE user_id = $1`, [SUCCESSOR])
    expect(rows).toHaveLength(0)
  })
})

describe('D4 — audit is mandatory and ABORTS the recovery when it cannot be written', () => {
  it('writes exactly one break-glass entry', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const { rows } = await db.query(`SELECT * FROM audit_log WHERE action = 'owner.break_glass_recovery'`)
    expect(rows).toHaveLength(1)
  })

  it('records a SYSTEM actor, not a fabricated user', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const row = await one<{ actor_id: string; actor_email: string; actor_role: string }>(
      `SELECT actor_id, actor_email, actor_role FROM audit_log WHERE action='owner.break_glass_recovery'`
    )
    // The all-zero UUID is not a user id anyone can hold, and `.invalid` is
    // RFC 2606 reserved — it can never be a deliverable address.
    expect(row.actor_id).toBe('00000000-0000-0000-0000-000000000000')
    expect(row.actor_email.endsWith('.invalid')).toBe(true)
    expect(row.actor_role).toBe('system')
  })

  it('records operation, target, mechanism, correlation id and outcome', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const row = await one<{ target_id: string; metadata: Record<string, unknown>; before_state: unknown; after_state: unknown }>(
      `SELECT target_id, metadata, before_state, after_state FROM audit_log WHERE action='owner.break_glass_recovery'`
    )
    expect(row.target_id).toBe(SUCCESSOR)
    expect(row.metadata.mechanism).toBe('break_glass')
    expect(row.metadata.correlation_id).toBe(w.id)
    expect(row.metadata.outcome).toBe('consumed')
    expect(row.metadata.reason).toBe(REASON)
    expect(row.before_state).toMatchObject({ owner_user_id: LOST_OWNER })
    expect(row.after_state).toMatchObject({ owner_user_id: SUCCESSOR })
  })

  it('🔴 AN UNWRITABLE AUDIT ABORTS THE RECOVERY — ownership does not move', async () => {
    // This inverts the platform's normal rule. `writeAuditLog` is deliberately
    // fire-and-forget everywhere else so a failed audit can never break a user
    // action. Here it is the opposite: an unaudited ownership seizure is worse
    // than a failed recovery.
    const w = await arm()
    await db.query(`ALTER TABLE audit_log ADD CONSTRAINT audit_block CHECK (action <> 'owner.break_glass_recovery')`)
    try {
      const code = await sqlstate(`SELECT fn_owner_recovery_execute($1)`, [w.id])
      expect(code).not.toBeNull()

      const owner = await one<{ user_id: string }>(`SELECT user_id FROM platform_owner WHERE active`)
      expect(owner.user_id).toBe(LOST_OWNER)

      const win = await one<{ closed_at: string | null }>(
        `SELECT closed_at FROM platform_owner_recovery WHERE id = $1`, [w.id]
      )
      expect(win.closed_at).toBeNull()
    } finally {
      await db.query(`ALTER TABLE audit_log DROP CONSTRAINT audit_block`)
    }
  })

  it('arming is audited too — an armed window is itself security-relevant', async () => {
    await arm()
    const { rows } = await db.query(`SELECT * FROM audit_log WHERE action = 'owner.break_glass_armed'`)
    expect(rows).toHaveLength(1)
  })

  it('cancelling is audited', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_cancel($1,$2)`, [w.id, REASON])
    const { rows } = await db.query(`SELECT * FROM audit_log WHERE action = 'owner.break_glass_cancelled'`)
    expect(rows).toHaveLength(1)
  })
})

describe('the existing mechanisms are not rebuilt or weakened', () => {
  it('fn_is_platform_owner still answers for the NEW Owner after recovery', async () => {
    const w = await arm()
    await db.query(`SELECT fn_owner_recovery_execute($1)`, [w.id])
    const row = await one<{ now_owner: boolean; was_owner: boolean }>(`
      SELECT fn_is_platform_owner('${SUCCESSOR}') AS now_owner,
             fn_is_platform_owner('${LOST_OWNER}') AS was_owner
    `)
    expect(row).toEqual({ now_owner: true, was_owner: false })
  })

  it('the single-active-Owner index is untouched by this migration', async () => {
    const row = await one<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_platform_owner_single_active'`
    )
    expect(row.indexdef).toContain('active = true')
  })

  it('the migration adds no column to platform_owner', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='platform_owner' ORDER BY ordinal_position
    `)
    expect(rows.map((r) => (r as { column_name: string }).column_name)).toEqual([
      'id', 'user_id', 'active', 'assigned_at', 'assigned_by', 'revoked_at', 'notes',
    ])
  })
})

describe('the migration file itself', () => {
  it('is idempotent — applying it twice changes nothing and raises nothing', async () => {
    expect(await sqlstate(MIGRATION)).toBeNull()
  })

  it('never GRANTs the recovery functions to a PostgREST role', async () => {
    // A source assertion as well as a runtime one: the runtime check proves
    // today's database, this proves the file cannot be read as granting them.
    expect(MIGRATION).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+fn_owner_recovery[\s\S]{0,120}?(anon|authenticated|service_role)/i)
  })
})
