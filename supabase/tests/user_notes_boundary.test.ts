import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Module 08 — internal admin notes: `user_notes`.
//
// CONTRACT
//   04_Database_Architecture.md §4.6   the authoritative DDL, reproduced verbatim
//   10_User_Management.md §3.8         "Chronological internal notes from
//                                      user_notes. Pinned notes shown at top.
//                                      Add new note inline."
//   10_User_Management.md §3.9         "Add internal note — moderator"
//   12_RBAC.md §3                      analyst ❌ · moderator ✅ · admin ✅ ·
//                                      super_admin ✅
//
// WHY THIS TABLE IS DIFFERENT FROM EVERY OTHER ONE MODULE 08 TOUCHES.
//
// `account_status` holds facts about an account. `user_notes` holds an
// operator's OPINION of a person, written in free text, about a subject who
// cannot see it and never consented to it. Two consequences the tests below
// enforce rather than assume:
//
//   1. The subject must never be able to read their own row. Every other
//      user-scoped table in this schema grants exactly that, so the usual
//      "own-row RLS policy" reflex is the wrong one here — it would hand each
//      user the internal file kept on them.
//
//   2. `author_id` has no ON DELETE CASCADE in §4.6, and that is not an
//      oversight to be tidied. Deleting an administrator must not delete the
//      notes they wrote; an audit trail that disappears with its author is not
//      an audit trail. The subject's FK DOES cascade, because a deleted user's
//      file has no subject left.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260821_m08_user_notes.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54363
const SUBJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const AUTHOR = '33333333-3333-4333-8333-333333333333'

const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- ADR-019: a new table in this schema is BORN fully open. Without this the
  -- REVOKE assertions below all pass vacuously.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Control object: same open defaults, never revoked.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query(sql, params)).rows[0] as T

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

const note = (userId = SUBJECT, text = 'called support, verified identity', pinned = false) =>
  db.query(
    `INSERT INTO user_notes (user_id, author_id, note, is_pinned) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, AUTHOR, text, pinned]
  )

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-notes-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  // Pinned for the same reason every other suite here pins it: this machine is
  // in Vietnam, so an unpinned session would make a UTC cast and an explicit
  // conversion indistinguishable. No dates are bucketed here, but the harness
  // must not be the reason a future assertion passes.
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(`INSERT INTO profiles (id) VALUES ($1),($2),($3)`, [SUBJECT, OTHER, AUTHOR])
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query('TRUNCATE user_notes')
})

// ===========================================================================
// SCHEMA — `04` §4.6, verbatim
// ===========================================================================
describe('schema — §4.6', () => {
  it('the table exists', async () => {
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relname='user_notes' AND relkind='r'`
    )
    expect(r.n).toBe('1')
  })

  it('has exactly the §4.6 columns', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='user_notes' ORDER BY column_name`
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'author_id', 'created_at', 'id', 'is_pinned', 'note', 'updated_at', 'user_id',
    ])
  })

  it('note text is NOT NULL — an empty note is not a note', async () => {
    const r = await one<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name='user_notes' AND column_name='note'`
    )
    expect(r.is_nullable).toBe('NO')
  })

  it('the §4.6 index on (user_id, created_at DESC) exists', async () => {
    const r = await one<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename='user_notes' AND indexname='idx_user_notes_user'`
    )
    expect(r.indexdef).toContain('user_id')
    expect(r.indexdef).toContain('created_at DESC')
  })

  it('🔑 the SUBJECT fk cascades — a deleted user takes their file with them', async () => {
    await note()
    await db.query(`DELETE FROM profiles WHERE id = $1`, [SUBJECT])
    const r = await one<{ n: string }>(`SELECT count(*) n FROM user_notes`)
    expect(r.n).toBe('0')
    await db.query(`INSERT INTO profiles (id) VALUES ($1)`, [SUBJECT]) // restore for later tests
  })

  it('🔑 the AUTHOR fk does NOT cascade — an audit trail that dies with its author is not one', async () => {
    await note()
    await expect(db.query(`DELETE FROM profiles WHERE id = $1`, [AUTHOR]))
      .rejects.toMatchObject({ code: '23503' })
  })

  it('is_pinned defaults to false — §3.8 pins are a deliberate act', async () => {
    await note()
    const r = await one<{ is_pinned: boolean }>(`SELECT is_pinned FROM user_notes`)
    expect(r.is_pinned).toBe(false)
  })

  it('a note about a user who does not exist is rejected', async () => {
    await expect(note('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({ code: '23503' })
  })
})

// ===========================================================================
// SECURITY — the part that is NOT like the rest of the schema
// ===========================================================================
describe('🔑 security — the subject must never read their own file', () => {
  it('anon cannot read', async () => {
    expect(await asRole('anon', `SELECT * FROM user_notes`)).toBe('42501')
  })

  it('🔑 authenticated cannot read — not even their own row', async () => {
    // The reflex for a `user_id` column in this schema is an own-row policy.
    // Here that would hand every user the internal file kept on them, written
    // by an operator, about them, without their knowledge.
    await note()
    expect(await asRole('authenticated', `SELECT * FROM user_notes WHERE user_id = '${SUBJECT}'`)).toBe('42501')
  })

  it('authenticated cannot write, pin, or delete', async () => {
    await note()
    expect(await asRole('authenticated', `INSERT INTO user_notes (user_id, author_id, note) VALUES ('${SUBJECT}','${AUTHOR}','x')`)).toBe('42501')
    expect(await asRole('authenticated', `UPDATE user_notes SET is_pinned = true`)).toBe('42501')
    expect(await asRole('authenticated', `DELETE FROM user_notes`)).toBe('42501')
  })

  it('anon cannot write either', async () => {
    expect(await asRole('anon', `INSERT INTO user_notes (user_id, author_id, note) VALUES ('${SUBJECT}','${AUTHOR}','x')`)).toBe('42501')
  })

  it('🔑 the control table IS reachable — proving the harness grants are real', async () => {
    expect(await asRole('anon', `SELECT * FROM harness_control`)).toBeNull()
  })

  it('RLS is enabled with ZERO policies — a missing policy is a denial', async () => {
    const r = await one<{ relrowsecurity: boolean; policies: string }>(
      `SELECT c.relrowsecurity,
              (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='user_notes') policies
         FROM pg_class c WHERE c.oid='public.user_notes'::regclass`
    )
    expect(r.relrowsecurity).toBe(true)
    expect(r.policies).toBe('0')
  })

  it('service_role keeps access — it is the API tier behind the PDP', async () => {
    expect(await asRole('service_role', `SELECT * FROM user_notes`)).toBeNull()
  })
})

// ===========================================================================
// §3.8 — chronological, pinned first
// ===========================================================================
describe('§3.8 ordering', () => {
  it('the index supports newest-first within one subject', async () => {
    await db.query(
      `INSERT INTO user_notes (user_id, author_id, note, created_at) VALUES
        ($1,$2,'older','2026-08-01T00:00:00Z'),
        ($1,$2,'newer','2026-08-05T00:00:00Z')`,
      [SUBJECT, AUTHOR]
    )
    const { rows } = await db.query<{ note: string }>(
      `SELECT note FROM user_notes WHERE user_id=$1 ORDER BY created_at DESC`, [SUBJECT]
    )
    expect(rows.map((r) => r.note)).toEqual(['newer', 'older'])
  })

  it('a note belongs to exactly one subject and never leaks into another', async () => {
    await note(SUBJECT, 'about the subject')
    await note(OTHER, 'about someone else')
    const r = await one<{ n: string }>(`SELECT count(*) n FROM user_notes WHERE user_id=$1`, [SUBJECT])
    expect(r.n).toBe('1')
  })

  it('several notes may be pinned at once — §3.8 says pinned notes, plural', async () => {
    await note(SUBJECT, 'first', true)
    await note(SUBJECT, 'second', true)
    const r = await one<{ n: string }>(`SELECT count(*) n FROM user_notes WHERE is_pinned`)
    expect(r.n).toBe('2')
  })
})
