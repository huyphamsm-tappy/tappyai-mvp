import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// `public.user_memory.user_id` — referential integrity to `auth.users`.
//
// WHAT THIS FILE IS FOR
// The defect: `user_memory.user_id` is `text` on the live database and carries
// no foreign key, so deleting an Auth user leaves that user's private memory
// behind. Account deletion here is MANUAL (a support email, then an operator),
// which means the stranded row is created by the normal, intended flow — and it
// is then unreachable, because RLS filters it to an `auth.uid()` nobody holds.
//
// This suite proves the migration closes that, and — the half that is easy to
// skip — that it closes it WITHOUT changing anything else: the surviving rows,
// the authorization model, or the unique constraint that every memory write in
// the product upserts against.
//
// ── WHY THERE ARE FOUR DATABASES ─────────────────────────────────────────────
// The migration has to be correct against more than one starting state, and a
// suite with one database can only ever test one of them.
//
//   prodshape     the LIVE production shape: `user_id text`, no foreign key,
//                 policy stored as `(auth.uid())::text = user_id` (it cannot be
//                 stored any other way — see the harness-integrity block).
//                 Recorded from introspection in
//                 docs/ios/05_DATABASE_CONTRACT.md:167.
//
//   correctshape  a database provisioned fresh from `supabase-schema.sql`,
//                 where the column is ALREADY `uuid ... on delete cascade`.
//                 The migration must be a complete no-op here. This is not
//                 hypothetical: it is what a disaster-recovery environment or a
//                 new developer machine looks like, and a migration that
//                 mangled it would be found at the worst possible time.
//
//   blockedshape  a row whose `user_id` is not UUID-shaped. The migration must
//                 REFUSE and change nothing, rather than cast (which aborts) or
//                 delete (which destroys the only evidence of an unknown
//                 writer). Guardrail: stop and report, do not guess.
//
//   blockedpolicy an RLS policy this file does not know how to restore. The
//                 type change requires dropping every policy on the column, so
//                 an unrecognised one must stop the migration instead of being
//                 silently removed — dropping an authorization rule during a
//                 data-integrity fix is the worst available outcome.
//
// ── THE PROTECTED USER ───────────────────────────────────────────────────────
// f9077a52-b0f3-453a-a497-97da115ae386 is a REAL production account. It must
// never appear in a fixture, and `protected user` below asserts that mechanically
// rather than trusting that nobody pasted it. Everything here runs against a
// throwaway embedded PostgreSQL in a temp directory; no production credentials
// exist in this process.
//
// SCOPE. The DATABASE boundary only: the constraint, the column, the data, the
// policy and the cascade. That memory writes pin a server-derived `user_id` is
// asserted in `src/lib/memory/memoryBoundary.test.ts` — a foreign key does not
// authenticate an HTTP request, and this file does not pretend it does.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260911b_user_memory_auth_fk.sql'
const ROLLBACK_PATH = 'supabase/migrations/rollback/20260911b_user_memory_auth_fk_rollback.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')
const ROLLBACK = readFileSync(join(REPO, ROLLBACK_PATH), 'utf8')

const PORT = 54379

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
/** Deleted from Auth before the migration runs — the orphan the defect creates. */
const GHOST = '33333333-3333-4333-8333-333333333333'
/** Exists in auth.users, has no profiles row (20260808c) — the FK must still hold. */
const ANON_USER = '44444444-4444-4444-8444-444444444444'
/** Never inserted anywhere. Used to prove an unknown owner is refused. */
const NOBODY = '55555555-5555-4555-8555-555555555555'

/** 🚨 A REAL production account. Never a fixture. Asserted, not assumed. */
const PROTECTED_USER = 'f9077a52-b0f3-453a-a497-97da115ae386'

/**
 * The platform baseline every scenario lands on.
 *
 * `auth.users` carries `is_anonymous` in this project (measured — see
 * anonymous_profile_guard.test.ts). The default privileges are reproduced
 * because on Supabase a new table is born granted to `anon` and `authenticated`;
 * without them, the assertion that the cleanup ledger is CLOSED would pass
 * vacuously — the ACL would be empty because nothing ever granted anything.
 */
const PLATFORM = `
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
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE auth.users (
    id           UUID PRIMARY KEY,
    email        VARCHAR(255),
    is_anonymous BOOLEAN NOT NULL DEFAULT false
  );

  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

  INSERT INTO auth.users (id, email, is_anonymous) VALUES
    ('${SELF}',      'self@example.test',  false),
    ('${OTHER}',     'other@example.test', false),
    ('${ANON_USER}', NULL,                 true);
`

/**
 * The LIVE production shape of `user_memory`.
 *
 * Column list and types follow the recorded introspection: `user_id text`
 * UNIQUE, no foreign key, `updated_at` without a time zone.
 *
 * 🚨 THE POLICY IS WRITTEN WITH A CAST BECAUSE IT HAS TO BE. On a text column
 * `USING (auth.uid() = user_id)` does not parse — "operator does not exist:
 * uuid = text". The harness-integrity block proves that, so this cast is
 * recorded as a measurement rather than a stylistic choice.
 */
const PROD_SHAPE = `
  CREATE TABLE public.user_memory (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          text UNIQUE,
    location_base    text,
    discovery_city   text,
    preferences      jsonb DEFAULT '{}'::jsonb,
    budget           jsonb DEFAULT '{}'::jsonb,
    history          jsonb DEFAULT '[]'::jsonb,
    companions       text,
    timing           text,
    personality      text,
    behavior_summary text,
    updated_at       timestamp without time zone DEFAULT now()
  );
  ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can manage own memory" ON public.user_memory
    FOR ALL USING ((auth.uid())::text = user_id) WITH CHECK ((auth.uid())::text = user_id);
  CREATE INDEX user_memory_user_id_idx ON public.user_memory (user_id);
`

/** The column as `supabase-schema.sql:88` has always declared it. */
const CORRECT_SHAPE = `
  CREATE TABLE public.user_memory (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
    location_base  text,
    discovery_city text,
    preferences    jsonb DEFAULT '{}'::jsonb,
    budget         jsonb DEFAULT '{}'::jsonb,
    history        jsonb DEFAULT '[]'::jsonb,
    updated_at     timestamptz DEFAULT now()
  );
  ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can manage own memory" ON public.user_memory
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
`

/**
 * Four memory rows and then a hand-deletion of one owner — reproducing exactly
 * how production produced its orphan: an operator removes the Auth user, and
 * with no foreign key the memory row simply stays.
 *
 * The NULL-owner row is included because `supabase-schema.sql` declares the
 * column NOT NULL while the live table does not, so a row with no owner at all
 * is reachable on production and unreachable in the declared schema.
 */
const PROD_SEED = `
  INSERT INTO public.user_memory (user_id, location_base, discovery_city, preferences, history) VALUES
    ('${SELF}',      'Ha Noi',  'Quy Nhon', '{"food":["pho"]}',  '["cafe Q3"]'),
    ('${OTHER}',     'Da Nang', NULL,       '{"spa":["massage"]}', '[]'),
    ('${ANON_USER}', NULL,      'Da Lat',   '{}',                '[]'),
    ('${GHOST}',     'Hue',     NULL,       '{"food":["bun bo"]}', '["ghost topic"]');

  INSERT INTO public.user_memory (id, user_id, location_base)
    VALUES ('99999999-9999-4999-8999-999999999999', NULL, 'no owner at all');

  -- The operator deletes the Auth user by hand. Nothing cascades: that is the bug.
  DELETE FROM auth.users WHERE id = '${GHOST}';
`

let pg: EmbeddedPostgres
let dataDir: string
let prod: Client
let correct: Client

/** A connected client for one of this suite's scenario databases. */
async function newClient(database: string): Promise<Client> {
  const { Client: PgClient } = await import('pg')
  const c = new PgClient({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database })
  await c.connect()
  return c
}

/** Runs `sql` as `role` with an optional session subject. Returns the SQLSTATE, or null on success. */
async function asRole(db: Client, role: string, sql: string, sub: string | null = null): Promise<string | null> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
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

/** Reads rows as `role`. */
async function rowsAsRole(db: Client, role: string, sql: string, sub: string | null = null) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
  try {
    await db.query(`SET ROLE ${role}`)
    return (await db.query(sql)).rows
  } finally {
    await db.query('RESET ROLE')
  }
}

const one = async (db: Client, sql: string) => (await db.query(sql)).rows[0]
const count = async (db: Client, sql: string) => Number((await one(db, sql)).c)

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'user-memory-auth-fk-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false, initdbFlags: ['--locale=C'],
  })
  await pg.initialise()
  await pg.start()

  await pg.createDatabase('prodshape')
  prod = await newClient('prodshape')
  await prod.query(PLATFORM)
  await prod.query(PROD_SHAPE)
  await prod.query(PROD_SEED)

  await pg.createDatabase('correctshape')
  correct = await newClient('correctshape')
  await correct.query(PLATFORM)
  await correct.query(CORRECT_SHAPE)
  await correct.query(`INSERT INTO public.user_memory (user_id, location_base) VALUES ('${SELF}', 'Ha Noi')`)
}, 180_000)

afterAll(async () => {
  try { await prod?.end() } catch { /* closed */ }
  try { await correct?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* file locks */ }
})

// ─────────────────────────────────────────────────────────────────────────────

describe('protected user — the real account is nowhere near this suite', () => {
  it('no fixture identifier is the protected production user', () => {
    for (const id of [SELF, OTHER, GHOST, ANON_USER, NOBODY]) {
      expect(id, 'a fixture must never name a real account').not.toBe(PROTECTED_USER)
    }
  })

  it('the protected id appears nowhere in the migration or the rollback', () => {
    expect(MIGRATION).not.toContain(PROTECTED_USER)
    expect(ROLLBACK).not.toContain(PROTECTED_USER)
  })

  it('neither file targets a row by identity at all', () => {
    // The cleanup is defined by a PREDICATE ("no matching auth.users row"), never
    // by a hardcoded id. A literal UUID in either file would mean someone encoded
    // a specific person into a schema migration.
    const uuidLiteral = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i
    expect(uuidLiteral.test(MIGRATION.replace(/--[^\n]*/g, ''))).toBe(false)
    expect(uuidLiteral.test(ROLLBACK.replace(/--[^\n]*/g, ''))).toBe(false)
  })
})

describe('harness integrity — the baseline really is the broken shape', () => {
  it('user_id starts as text, exactly as production has it', async () => {
    const r = await one(prod, `SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id'`)
    expect(r.data_type).toBe('text')
  })

  it('no foreign key exists yet — otherwise every assertion below is vacuous', async () => {
    expect(await count(prod, `SELECT count(*) c FROM pg_constraint
      WHERE conrelid='public.user_memory'::regclass AND contype='f'`)).toBe(0)
  })

  it('the orphan outlives its owner — the defect, reproduced', async () => {
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE user_id='${GHOST}'`)).toBe(1)
    expect(await count(prod, `SELECT count(*) c FROM auth.users WHERE id='${GHOST}'`)).toBe(0)
  })

  it('and no live user can reach it, so nothing in the product can clean it up', async () => {
    // Precisely what is and is not being claimed. RLS would happily show this row
    // to a caller whose `sub` is the deleted id — this harness can forge one, and
    // does below to prove the check is live. What makes the row unreachable in
    // reality is that Supabase Auth cannot mint a session for a user that no
    // longer exists, and that is an Auth property, not a database one. So the
    // database-level fact, which IS assertable, is this: every identity that can
    // still authenticate sees nothing, which is why the row had to be found and
    // deleted by hand rather than through any product path.
    for (const sub of [SELF, OTHER, ANON_USER]) {
      const rows = await rowsAsRole(prod, 'authenticated',
        `SELECT id FROM public.user_memory WHERE user_id='${GHOST}'`, sub)
      expect(rows).toEqual([])
    }
    expect(await rowsAsRole(prod, 'anon', `SELECT id FROM public.user_memory`, null)).toEqual([])

    // The forged subject, included so the emptiness above reads as RLS filtering
    // rather than as an empty table.
    expect((await rowsAsRole(prod, 'authenticated',
      `SELECT id FROM public.user_memory`, GHOST)).length).toBe(1)
  })

  it('a text column cannot carry the foreign key — so the type change is forced', async () => {
    // The measurement the migration's design rests on. If PostgreSQL ever allowed
    // this, the type change would be unnecessary and this file should be revisited.
    await expect(prod.query(
      `ALTER TABLE public.user_memory ADD CONSTRAINT probe
         FOREIGN KEY (user_id) REFERENCES auth.users(id)`
    )).rejects.toThrow(/incompatible types|cannot be implemented/i)
  })

  it('the policy cannot be written without a cast while the column is text', async () => {
    await expect(prod.query(
      `CREATE POLICY probe ON public.user_memory FOR ALL USING (auth.uid() = user_id)`
    )).rejects.toThrow(/operator does not exist/i)
  })

  it('the type change is blocked while a policy references the column', async () => {
    // The hazard that would strand a naive migration halfway through production,
    // after it had already deleted rows.
    await expect(prod.query(
      `ALTER TABLE public.user_memory ALTER COLUMN user_id TYPE uuid USING user_id::uuid`
    )).rejects.toThrow(/cannot alter type of a column used in a policy/i)
  })
})

describe('the migration applies to the production shape', () => {
  it('applies without error', async () => {
    await expect(prod.query(MIGRATION)).resolves.toBeDefined()
  })

  it('user_id is uuid and NOT NULL', async () => {
    const r = await one(prod, `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id'`)
    expect(r.data_type).toBe('uuid')
    expect(r.is_nullable).toBe('NO')
  })

  it('the foreign key exists, references auth.users(id), and cascades', async () => {
    const r = await one(prod, `SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid='public.user_memory'::regclass AND contype='f'`)
    expect(r.conname).toBe('user_memory_user_id_fkey')
    expect(r.def).toMatch(/FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  })

  it('no orphan rows remain', async () => {
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory m
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id)`)).toBe(0)
  })

  it('every valid row survived, with its content untouched', async () => {
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory`)).toBe(3)

    const self = await one(prod, `SELECT * FROM public.user_memory WHERE user_id='${SELF}'`)
    expect(self.location_base).toBe('Ha Noi')
    expect(self.discovery_city).toBe('Quy Nhon')       // discovery_city semantics untouched
    expect(self.preferences).toEqual({ food: ['pho'] })
    expect(self.history).toEqual(['cafe Q3'])

    // The anonymous identity keeps its row: the FK targets auth.users, where it
    // exists, NOT profiles, where it deliberately does not (20260808c).
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE user_id='${ANON_USER}'`)).toBe(1)
  })

  it('removed exactly the orphan and the null-owner row, and nothing else', async () => {
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE user_id='${GHOST}'`)).toBe(0)
    expect(await count(prod,
      `SELECT count(*) c FROM public.user_memory WHERE id='99999999-9999-4999-8999-999999999999'`)).toBe(0)
  })
})

describe('the cleanup is documented, and documents only a fingerprint', () => {
  it('logs one row per deletion, with the reason', async () => {
    const rows = await prod.query(
      `SELECT reason, orphan_user_id, memory_updated_at FROM public.user_memory_fk_cleanup_log ORDER BY reason`)
    expect(rows.rows.map(r => r.reason)).toEqual(['null_user_id', 'orphan_no_auth_user'])
    expect(rows.rows.find(r => r.reason === 'orphan_no_auth_user')!.orphan_user_id).toBe(GHOST)
    expect(rows.rows.find(r => r.reason === 'null_user_id')!.orphan_user_id).toBeNull()
  })

  it('the ledger and the table agree — nothing was deleted unlogged', async () => {
    // 5 seeded, 3 surviving, so the ledger must hold exactly 2.
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory_fk_cleanup_log`)).toBe(2)
  })

  it('stores NO memory content — an archive of a deleted account is the defect', async () => {
    const cols = (await prod.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_memory_fk_cleanup_log'`)).rows.map(r => r.column_name)
    for (const leaked of ['location_base', 'discovery_city', 'preferences', 'budget',
                          'history', 'companions', 'timing', 'personality', 'behavior_summary']) {
      expect(cols, `${leaked} must not be archived`).not.toContain(leaked)
    }
  })

  it('is unreadable by both client roles', async () => {
    const r = await one(prod, `SELECT
      has_table_privilege('anon','public.user_memory_fk_cleanup_log','SELECT')          AS anon_sel,
      has_table_privilege('authenticated','public.user_memory_fk_cleanup_log','SELECT') AS auth_sel,
      has_table_privilege('service_role','public.user_memory_fk_cleanup_log','SELECT')  AS svc_sel,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_memory_fk_cleanup_log'::regclass) AS rls`)
    expect(r.anon_sel).toBe(false)
    expect(r.auth_sel).toBe(false)
    expect(r.svc_sel).toBe(true)
    expect(r.rls).toBe(true)
  })

  it('has no policy, so RLS denies every non-BYPASSRLS role on top of the revoke', async () => {
    expect(await count(prod, `SELECT count(*) c FROM pg_policies
      WHERE schemaname='public' AND tablename='user_memory_fk_cleanup_log'`)).toBe(0)
  })
})

describe('the behaviour the whole task is about — deleting an Auth user', () => {
  const DISPOSABLE = '77777777-7777-4777-8777-777777777777'

  it('a disposable Auth user can hold memory', async () => {
    await prod.query(`INSERT INTO auth.users (id, email) VALUES ('${DISPOSABLE}', 'disposable@example.test')`)
    await prod.query(`INSERT INTO public.user_memory (user_id, location_base, discovery_city)
      VALUES ('${DISPOSABLE}', 'Somewhere', 'Elsewhere')`)
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE user_id='${DISPOSABLE}'`)).toBe(1)
  })

  it('deleting the Auth user removes the memory row automatically', async () => {
    await prod.query(`DELETE FROM auth.users WHERE id='${DISPOSABLE}'`)
    // The assertion from the task brief, verbatim.
    expect(await count(prod,
      `SELECT count(*) c FROM public.user_memory WHERE user_id='${DISPOSABLE}'`)).toBe(0)
  })

  it('the Auth user is gone and no other user was affected', async () => {
    expect(await count(prod, `SELECT count(*) c FROM auth.users WHERE id='${DISPOSABLE}'`)).toBe(0)
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory`)).toBe(3)
  })

  it('a memory row for a non-existent Auth user can no longer be created', async () => {
    await expect(prod.query(
      `INSERT INTO public.user_memory (user_id, location_base) VALUES ('${NOBODY}', 'nowhere')`
    )).rejects.toThrow(/violates foreign key constraint/i)
  })

  it('and neither can one with no owner at all', async () => {
    await expect(prod.query(
      `INSERT INTO public.user_memory (user_id, location_base) VALUES (NULL, 'nowhere')`
    )).rejects.toThrow(/null value in column "user_id"/i)
  })
})

describe('authorization is unchanged — the FK complements RLS, it does not replace it', () => {
  it('RLS is still enabled with exactly one owner-only policy', async () => {
    const r = await one(prod, `SELECT policyname, cmd, qual, with_check,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_memory'::regclass) AS rls
      FROM pg_policies WHERE schemaname='public' AND tablename='user_memory'`)
    expect(r.rls).toBe(true)
    expect(r.policyname).toBe('Users can manage own memory')
    expect(r.cmd).toBe('ALL')
    // Same predicate as before, now without the cast both sides no longer need.
    expect(r.qual).toBe('(auth.uid() = user_id)')
    expect(r.with_check).toBe('(auth.uid() = user_id)')
    expect(await count(prod, `SELECT count(*) c FROM pg_policies
      WHERE schemaname='public' AND tablename='user_memory'`)).toBe(1)
  })

  it('a user reads their own memory and only their own', async () => {
    const rows = await rowsAsRole(prod, 'authenticated', `SELECT user_id, location_base FROM public.user_memory`, SELF)
    expect(rows.length).toBe(1)
    expect(rows[0].user_id).toBe(SELF)
    expect(rows[0].location_base).toBe('Ha Noi')
  })

  it('a user cannot read another user\'s memory', async () => {
    const rows = await rowsAsRole(prod, 'authenticated',
      `SELECT user_id FROM public.user_memory WHERE user_id='${OTHER}'`, SELF)
    expect(rows).toEqual([])
  })

  it('a user cannot write a memory row owned by someone else', async () => {
    // The FK would happily accept this — OTHER is a real auth user. RLS is what
    // refuses it, which is exactly why the FK is not a substitute for RLS.
    const code = await asRole(prod, 'authenticated',
      `INSERT INTO public.user_memory (user_id, location_base) VALUES ('${OTHER}', 'stolen')`, SELF)
    expect(code).toBe('42501')
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE location_base='stolen'`)).toBe(0)
  })

  it('a user cannot re-point their own row at another user', async () => {
    const code = await asRole(prod, 'authenticated',
      `UPDATE public.user_memory SET user_id='${OTHER}' WHERE user_id='${SELF}'`, SELF)
    expect(code).toBe('42501')
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory WHERE user_id='${SELF}'`)).toBe(1)
  })

  it('an anonymous caller sees nothing', async () => {
    expect(await rowsAsRole(prod, 'anon', `SELECT user_id FROM public.user_memory`, null)).toEqual([])
  })

  it('a user can still update and delete their own memory', async () => {
    expect(await asRole(prod, 'authenticated',
      `UPDATE public.user_memory SET location_base='Ha Noi 2' WHERE user_id='${SELF}'`, SELF)).toBeNull()
    const r = await one(prod, `SELECT location_base FROM public.user_memory WHERE user_id='${SELF}'`)
    expect(r.location_base).toBe('Ha Noi 2')
    await prod.query(`UPDATE public.user_memory SET location_base='Ha Noi' WHERE user_id='${SELF}'`)
  })
})

describe('the upsert every memory write depends on still resolves', () => {
  it('a single-column UNIQUE index on user_id survived the type change', async () => {
    // memoryService.updateMemory upserts with `{ onConflict: 'user_id' }`. Without
    // this index every write in the product fails with 42P10.
    expect(await count(prod, `SELECT count(*) c FROM pg_index i
      WHERE i.indrelid='public.user_memory'::regclass AND i.indisunique AND i.indnatts=1
        AND i.indkey[0]=(SELECT attnum FROM pg_attribute
                          WHERE attrelid='public.user_memory'::regclass AND attname='user_id')`))
      .toBeGreaterThanOrEqual(1)
  })

  it('ON CONFLICT (user_id) DO UPDATE still works, as the gateway issues it', async () => {
    await prod.query(`INSERT INTO public.user_memory (user_id, location_base, updated_at)
      VALUES ('${SELF}', 'Upserted', now())
      ON CONFLICT (user_id) DO UPDATE SET location_base = EXCLUDED.location_base`)
    expect((await one(prod, `SELECT location_base FROM public.user_memory WHERE user_id='${SELF}'`)).location_base)
      .toBe('Upserted')
    expect(await count(prod, `SELECT count(*) c FROM public.user_memory`)).toBe(3)
  })

  it('the cascade target is indexed, so account deletion is not a sequential scan', async () => {
    expect(await count(prod, `SELECT count(*) c FROM pg_index
      WHERE indrelid='public.user_memory'::regclass
        AND indkey[0]=(SELECT attnum FROM pg_attribute
                        WHERE attrelid='public.user_memory'::regclass AND attname='user_id')`))
      .toBeGreaterThanOrEqual(1)
  })
})

describe('re-running it changes nothing', () => {
  it('is idempotent', async () => {
    const before = await one(prod, `SELECT
      (SELECT count(*) FROM public.user_memory)                AS rows,
      (SELECT count(*) FROM public.user_memory_fk_cleanup_log) AS logged,
      (SELECT count(*) FROM pg_constraint
        WHERE conrelid='public.user_memory'::regclass AND contype='f') AS fks,
      (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='user_memory') AS policies`)

    await expect(prod.query(MIGRATION)).resolves.toBeDefined()

    const after = await one(prod, `SELECT
      (SELECT count(*) FROM public.user_memory)                AS rows,
      (SELECT count(*) FROM public.user_memory_fk_cleanup_log) AS logged,
      (SELECT count(*) FROM pg_constraint
        WHERE conrelid='public.user_memory'::regclass AND contype='f') AS fks,
      (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='user_memory') AS policies`)

    expect(after).toEqual(before)
  })
})

describe('against a database already provisioned correctly, it is a no-op', () => {
  it('the baseline is the declared schema — uuid, cascading, and already right', async () => {
    const r = await one(correct, `SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id'`)
    expect(r.data_type).toBe('uuid')
    expect(await count(correct, `SELECT count(*) c FROM pg_constraint
      WHERE conrelid='public.user_memory'::regclass AND contype='f'`)).toBe(1)
  })

  it('applies cleanly and keeps the pre-existing constraint', async () => {
    const before = await one(correct, `SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid='public.user_memory'::regclass AND contype='f'`)

    await expect(correct.query(MIGRATION)).resolves.toBeDefined()

    const after = await one(correct, `SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid='public.user_memory'::regclass AND contype='f'`)
    // The original constraint is kept by name, not replaced — re-adding it would
    // mean a full re-validation of the table for no gain.
    expect(after.conname).toBe(before.conname)
    expect(after.def).toMatch(/ON DELETE CASCADE/)
  })

  it('touches no data and cleans nothing', async () => {
    expect(await count(correct, `SELECT count(*) c FROM public.user_memory`)).toBe(1)
    expect(await count(correct, `SELECT count(*) c FROM public.user_memory_fk_cleanup_log`)).toBe(0)
  })

  it('leaves the cascade working', async () => {
    await correct.query(`DELETE FROM auth.users WHERE id='${SELF}'`)
    expect(await count(correct, `SELECT count(*) c FROM public.user_memory`)).toBe(0)
  })
})

describe('unexpected data stops the migration instead of guessing', () => {
  let blocked: Client

  beforeAll(async () => {
    await pg.createDatabase('blockedshape')
    blocked = await newClient('blockedshape')
    await blocked.query(PLATFORM)
    await blocked.query(PROD_SHAPE)
    await blocked.query(`INSERT INTO public.user_memory (user_id, location_base) VALUES
      ('${SELF}', 'Ha Noi'),
      ('device-abc-not-a-uuid', 'from some unknown writer')`)
  }, 120_000)

  afterAll(async () => { try { await blocked?.end() } catch { /* closed */ } })

  it('refuses to run when a user_id is not UUID-shaped', async () => {
    await expect(blocked.query(MIGRATION)).rejects.toThrow(/not UUID-shaped/i)
  })

  it('and changes absolutely nothing when it refuses', async () => {
    // The whole file runs in one transaction, so the refusal must leave the
    // database exactly as it was — including the row the cleanup would otherwise
    // have deleted first.
    const r = await one(blocked, `SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_memory' AND column_name='user_id'`)
    expect(r.data_type).toBe('text')
    expect(await count(blocked, `SELECT count(*) c FROM public.user_memory`)).toBe(2)
    expect(await count(blocked, `SELECT count(*) c FROM pg_constraint
      WHERE conrelid='public.user_memory'::regclass AND contype='f'`)).toBe(0)
    expect(await count(blocked, `SELECT count(*) c FROM pg_tables
      WHERE schemaname='public' AND tablename='user_memory_fk_cleanup_log'`)).toBe(0)
  })

  it('succeeds once the unknown value is resolved by a human', async () => {
    await blocked.query(`DELETE FROM public.user_memory WHERE user_id='device-abc-not-a-uuid'`)
    await expect(blocked.query(MIGRATION)).resolves.toBeDefined()
    expect(await count(blocked, `SELECT count(*) c FROM pg_constraint
      WHERE conrelid='public.user_memory'::regclass AND contype='f'`)).toBe(1)
  })
})

describe('an unrecognised RLS policy stops the migration rather than being dropped', () => {
  let blockedPolicy: Client

  beforeAll(async () => {
    await pg.createDatabase('blockedpolicy')
    blockedPolicy = await newClient('blockedpolicy')
    await blockedPolicy.query(PLATFORM)
    await blockedPolicy.query(PROD_SHAPE)
    await blockedPolicy.query(`CREATE POLICY "service reads everything" ON public.user_memory
      FOR SELECT TO service_role USING (true)`)
  }, 120_000)

  afterAll(async () => { try { await blockedPolicy?.end() } catch { /* closed */ } })

  it('refuses, and names the policy it does not know how to restore', async () => {
    await expect(blockedPolicy.query(MIGRATION)).rejects.toThrow(/unrecognised RLS polic/i)
    await expect(blockedPolicy.query(MIGRATION)).rejects.toThrow(/service reads everything/)
  })

  it('the unknown policy is still there — an authorization rule was not silently removed', async () => {
    expect(await count(blockedPolicy, `SELECT count(*) c FROM pg_policies
      WHERE schemaname='public' AND tablename='user_memory' AND policyname='service reads everything'`)).toBe(1)
  })
})

describe('every call shape the application issues still works', () => {
  // The five statements `memoryService` and its callers actually produce, run
  // against the migrated schema with the SAME role and identity the product uses.
  //
  // This is the Web half of the compatibility question, asserted at the layer
  // the change touches. `user_id` arrives as a JSON string from PostgREST in
  // every one of them — which is why a text->uuid column change is invisible to
  // the application — so each is parameterised with a string, never a uuid
  // literal, to prove exactly that.
  let app: Client

  beforeAll(async () => {
    await pg.createDatabase('appshapes')
    app = await newClient('appshapes')
    await app.query(PLATFORM)
    await app.query(PROD_SHAPE)
    await app.query(MIGRATION)
  }, 120_000)

  afterAll(async () => { try { await app?.end() } catch { /* closed */ } })

  const MEMORY_COLUMNS =
    'location_base, discovery_city, preferences, budget, history, companions, timing, personality, updated_at'

  it('onboarding seeds memory — updateMemory upsert, string user_id', async () => {
    // POST /api/onboarding -> updateMemory(user.id, { discovery_city, preferences })
    await app.query(
      `INSERT INTO public.user_memory (discovery_city, preferences, user_id, updated_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE
         SET discovery_city = EXCLUDED.discovery_city,
             preferences    = EXCLUDED.preferences,
             updated_at     = EXCLUDED.updated_at`,
      ['Quy Nhon', JSON.stringify({ food: ['quan tam'] }), SELF, new Date().toISOString()])

    const r = await one(app, `SELECT discovery_city, location_base FROM public.user_memory WHERE user_id='${SELF}'`)
    expect(r.discovery_city).toBe('Quy Nhon')
    // discovery_city and location_base stay distinct — this migration does not
    // touch their meaning, and a row seeded by onboarding has no residence.
    expect(r.location_base).toBeNull()
  })

  it('chat extraction updates the same row rather than creating a second', async () => {
    // chat/route.ts onFinish -> updateMemory(authedUserId, ..., createAdminClient())
    await app.query(
      `INSERT INTO public.user_memory (location_base, history, user_id, updated_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE
         SET location_base = EXCLUDED.location_base, history = EXCLUDED.history`,
      ['Ha Noi', JSON.stringify(['cafe Q3']), SELF, new Date().toISOString()])

    expect(await count(app, `SELECT count(*) c FROM public.user_memory WHERE user_id='${SELF}'`)).toBe(1)
    const r = await one(app, `SELECT location_base, discovery_city FROM public.user_memory WHERE user_id='${SELF}'`)
    expect(r.location_base).toBe('Ha Noi')
    expect(r.discovery_city).toBe('Quy Nhon')   // the onboarding value is not clobbered
  })

  it('GET /api/memory and Tappy Knows read it back as the signed-in user', async () => {
    // memoryService.getMemory -> .select(COLUMNS).eq('user_id', id).single()
    const rows = await rowsAsRole(app, 'authenticated',
      `SELECT ${MEMORY_COLUMNS} FROM public.user_memory WHERE user_id = '${SELF}'`, SELF)
    expect(rows.length).toBe(1)
    expect(rows[0].location_base).toBe('Ha Noi')
  })

  it('PATCH /api/memory corrects a fact as the signed-in user', async () => {
    // /api/memory PATCH -> updateMemory(user.id, patch, supabase) under RLS
    const code = await asRole(app, 'authenticated',
      `INSERT INTO public.user_memory (personality, user_id, updated_at)
       VALUES ('thich quan nho local', '${SELF}', now())
       ON CONFLICT (user_id) DO UPDATE SET personality = EXCLUDED.personality`, SELF)
    expect(code).toBeNull()
    expect((await one(app, `SELECT personality FROM public.user_memory WHERE user_id='${SELF}'`)).personality)
      .toBe('thich quan nho local')
  })

  it('the morning-brief / weekly-recap cron batch read works', async () => {
    // memoryService.getMemoryBatch -> .select(...).in('user_id', ids), admin client
    await app.query(`INSERT INTO public.user_memory (user_id, location_base) VALUES ('${OTHER}', 'Da Nang')`)
    const rows = await rowsAsRole(app, 'service_role',
      `SELECT user_id, ${MEMORY_COLUMNS} FROM public.user_memory
        WHERE user_id IN ('${SELF}', '${OTHER}', '${ANON_USER}')`)
    // Two of the three have a row; the third simply has no memory yet.
    expect(rows.map(r => r.user_id).sort()).toEqual([SELF, OTHER].sort())
  })

  it('the behavior-rollup cron writes behavior_summary through the same upsert', async () => {
    await app.query(
      `INSERT INTO public.user_memory (behavior_summary, user_id, updated_at)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE
         SET behavior_summary = EXCLUDED.behavior_summary`,
      ['mo app 12 lan tuan nay', OTHER, new Date().toISOString()])
    expect((await one(app, `SELECT behavior_summary FROM public.user_memory WHERE user_id='${OTHER}'`))
      .behavior_summary).toBe('mo app 12 lan tuan nay')
  })

  it('DELETE /api/memory clears only the caller\'s own row', async () => {
    // memoryService.clearMemory -> .delete().eq('user_id', id)
    expect(await asRole(app, 'authenticated',
      `DELETE FROM public.user_memory WHERE user_id = '${SELF}'`, SELF)).toBeNull()
    expect(await count(app, `SELECT count(*) c FROM public.user_memory WHERE user_id='${SELF}'`)).toBe(0)
    expect(await count(app, `SELECT count(*) c FROM public.user_memory WHERE user_id='${OTHER}'`)).toBe(1)
  })
})

describe('the rollback unbuilds the constraint and nothing else', () => {
  let rb: Client

  beforeAll(async () => {
    await pg.createDatabase('rollbackshape')
    rb = await newClient('rollbackshape')
    await rb.query(PLATFORM)
    await rb.query(PROD_SHAPE)
    await rb.query(`INSERT INTO public.user_memory (user_id, location_base, discovery_city)
      VALUES ('${SELF}', 'Ha Noi', 'Quy Nhon'), ('${OTHER}', 'Da Nang', NULL)`)
    await rb.query(MIGRATION)
  }, 120_000)

  afterAll(async () => { try { await rb?.end() } catch { /* closed */ } })

  it('runs as written', async () => {
    await expect(rb.query(ROLLBACK)).resolves.toBeDefined()
  })

  it('removes the foreign key', async () => {
    expect(await count(rb, `SELECT count(*) c FROM pg_constraint
      WHERE conrelid='public.user_memory'::regclass AND contype='f'`)).toBe(0)
  })

  it('destroys no data', async () => {
    expect(await count(rb, `SELECT count(*) c FROM public.user_memory`)).toBe(2)
    const r = await one(rb, `SELECT location_base, discovery_city FROM public.user_memory WHERE user_id='${SELF}'`)
    expect(r.location_base).toBe('Ha Noi')
    expect(r.discovery_city).toBe('Quy Nhon')
  })

  it('leaves the upsert conflict target alone — dropping it would be a worse outage', async () => {
    expect(await count(rb, `SELECT count(*) c FROM pg_index i
      WHERE i.indrelid='public.user_memory'::regclass AND i.indisunique AND i.indnatts=1
        AND i.indkey[0]=(SELECT attnum FROM pg_attribute
                          WHERE attrelid='public.user_memory'::regclass AND attname='user_id')`))
      .toBeGreaterThanOrEqual(1)
  })

  it('leaves owner-only access intact', async () => {
    const rows = await rowsAsRole(rb, 'authenticated', `SELECT user_id FROM public.user_memory`, SELF)
    expect(rows.length).toBe(1)
    expect(rows[0].user_id).toBe(SELF)
  })

  it('keeps the ledger — the only record of what was cleaned', async () => {
    expect(await count(rb, `SELECT count(*) c FROM pg_tables
      WHERE schemaname='public' AND tablename='user_memory_fk_cleanup_log'`)).toBe(1)
  })

  it('and the defect is back, which is what rolling this back means', async () => {
    await rb.query(`INSERT INTO auth.users (id, email) VALUES ('${NOBODY}', 'temp@example.test')`)
    await rb.query(`INSERT INTO public.user_memory (user_id) VALUES ('${NOBODY}')`)
    await rb.query(`DELETE FROM auth.users WHERE id='${NOBODY}'`)
    expect(await count(rb, `SELECT count(*) c FROM public.user_memory WHERE user_id='${NOBODY}'`)).toBe(1)
  })
})
