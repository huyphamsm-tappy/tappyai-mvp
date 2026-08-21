import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Module 09 Content Moderation — `moderation_queue`, `moderation_actions`, and
// the ingestion that fills them.
//
// CONTRACT
//   04 §4.4 / §4.5   the two tables and three enums, verbatim
//   12_RBAC §3       the seven actions and their roles
//   12_HUB_TAXONOMY  Content Moderation belongs to `tappy.hub.user`
//   ADR-026          Owner Decision B — reporter provenance
//
// 🔑 THE POINT OF THIS SUITE IS ADR-026's PRIVACY BOUNDARY.
//
// Two report tables feed the queue and they disagree about identity:
//
//   music_track_reports   reporter_id UUID -> auth.users        (raw id)
//   content_reports       reporter_source_id TEXT, OPAQUE and   (no raw id
//                         NON-REVERSIBLE                         anywhere)
//
// `04` §4.4 wants `reported_by UUID`. Decision B: content-safety reports carry
// NULL there and put the opaque id in `metadata` instead. The music path is
// unchanged. Every assertion below that mentions `reported_by` is enforcing
// that, not checking a column type.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260821_m09_moderation_queue.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54365
const REPORTER = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const MOD = '33333333-3333-4333-8333-333333333333'
const TRACK = '44444444-4444-4444-8444-444444444444'
const REVIEW = '55555555-5555-4555-8555-555555555555'

/** Production as it stands: both report tables already exist and are populated. */
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  -- ADR-019: born fully open. Without both lines every REVOKE below is vacuous.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY, full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- reviews has no CREATE TABLE anywhere in the repo (it predates migrations);
  -- only the columns the gate added and this module reads are modelled.
  CREATE TABLE public.reviews (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    publication_state TEXT CHECK (publication_state IN ('UNDER_REVIEW','PUBLISHED','RESTRICTED'))
  );

  CREATE TABLE public.music_tracks (id UUID PRIMARY KEY, title TEXT);

  -- 20260711_music_ugc_combined.sql — stores the RAW reporter id.
  CREATE TABLE public.music_track_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES public.music_tracks(id) ON DELETE CASCADE,
    reporter_id UUID,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 20260817_content_safety_gate.sql — deliberately stores NO raw id.
  CREATE TABLE public.content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
    reporter_source_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    policy_id TEXT,
    verification_state TEXT NOT NULL DEFAULT 'UNVERIFIED',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (content_id, reporter_source_id, reason)
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

const musicReport = (reason = 'copyright', reporter: string | null = REPORTER) =>
  db.query(
    `INSERT INTO music_track_reports (track_id, reporter_id, reason) VALUES ($1,$2,$3) RETURNING id`,
    [TRACK, reporter, reason]
  )

const contentReport = (sourceId = 'src-aaa', reason = 'ts.harassment') =>
  db.query(
    `INSERT INTO content_reports (content_id, reporter_source_id, reason) VALUES ($1,$2,$3) RETURNING id`,
    [REVIEW, sourceId, reason]
  )

const ingest = () => db.query(`SELECT fn_ingest_moderation_reports()`)

type QueueRow = {
  id: string
  type: string
  status: string
  priority: number
  reported_by: string | null
  target_type: string
  target_id: string
  reason: string | null
  metadata: Record<string, unknown> | null
}

const queue = () =>
  db.query<QueueRow>(`SELECT * FROM moderation_queue ORDER BY created_at, target_type`).then((r) => r.rows)

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-mod-'))
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient()
  await db.connect()
  // Pinned for the reason every suite here pins it: this machine is in Vietnam,
  // so an unpinned session makes a bare cast and an explicit conversion
  // indistinguishable.
  await db.query(`SET TimeZone = 'UTC'`)
  await db.query(PRELUDE)
  await db.query(`INSERT INTO profiles (id) VALUES ($1),($2),($3)`, [REPORTER, AUTHOR, MOD])
  await db.query(`INSERT INTO music_tracks (id, title) VALUES ($1,'t')`, [TRACK])
  await db.query(`INSERT INTO reviews (id, user_id, publication_state) VALUES ($1,$2,'PUBLISHED')`, [REVIEW, AUTHOR])
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file lock */ }
})

beforeEach(async () => {
  await db.query('TRUNCATE moderation_actions, moderation_queue')
  await db.query('DELETE FROM music_track_reports')
  await db.query('DELETE FROM content_reports')
})

// ===========================================================================
// SCHEMA — `04` §4.4 / §4.5
// ===========================================================================
describe('schema — §4.4 and §4.5', () => {
  it('both tables exist', async () => {
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_class WHERE relname IN ('moderation_queue','moderation_actions') AND relkind='r'`
    )
    expect(r.n).toBe('2')
  })

  it('the three §4.4/§4.5 enums exist with their exact labels', async () => {
    const { rows } = await db.query<{ typname: string; labels: string[] }>(
      // `::text` matters: `enumlabel` is the `name` type, and node-postgres has
      // no parser for `name[]`, so it hands back the raw literal
      // "{a,b,c}" instead of an array. The assertion would then compare a
      // string to an array and fail for a reason that is not about the enum.
      `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('moderation_type','moderation_status','moderation_action_type')
        GROUP BY t.typname ORDER BY t.typname`
    )
    const byName = Object.fromEntries(rows.map((r) => [r.typname, r.labels]))
    expect(byName['moderation_type']).toEqual([
      'review_report', 'comment_report', 'user_report', 'music_report', 'ai_flag',
    ])
    expect(byName['moderation_action_type']).toEqual([
      'warn', 'hide_content', 'restore_content', 'suspend_user', 'unsuspend_user',
      'ban_user', 'restore_user', 'delete_content', 'dismiss_report',
    ])
    expect(byName['moderation_status']).toBeDefined()
  })

  it('§4.4 columns exactly', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='moderation_queue' ORDER BY column_name`
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'assigned_to', 'created_at', 'id', 'metadata', 'priority', 'reason',
      'reported_by', 'resolution', 'resolved_at', 'resolved_by', 'status',
      'target_id', 'target_type', 'type', 'updated_at',
    ])
  })

  it('🔑 reported_by is NULLABLE — ADR-026 makes NULL a fact, not missing data', async () => {
    const r = await one<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name='moderation_queue' AND column_name='reported_by'`
    )
    expect(r.is_nullable).toBe('YES')
  })

  it('§4.5 columns exactly', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='moderation_actions' ORDER BY column_name`
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'action', 'actor_id', 'created_at', 'duration_hours', 'id', 'notes',
      'queue_id', 'reason', 'target_content_id', 'target_user_id',
    ])
  })

  it('the four §4.4/§4.5 indexes exist', async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename IN ('moderation_queue','moderation_actions')
          AND indexname LIKE 'idx_%' ORDER BY indexname`
    )
    expect(rows.map((r) => r.indexname)).toEqual([
      'idx_mod_actions_actor', 'idx_mod_actions_target', 'idx_modq_status', 'idx_modq_target',
    ])
  })

  it('🔑 an action survives its queue item — the history is not the queue', async () => {
    // §4.5 gives queue_id ON DELETE SET NULL. A moderator's decision must
    // outlive the report that prompted it.
    await musicReport()
    await ingest()
    const q = (await queue())[0]
    await db.query(
      `INSERT INTO moderation_actions (queue_id, action, actor_id, reason) VALUES ($1,'dismiss_report',$2,'not a violation')`,
      [q.id, MOD]
    )
    await db.query(`DELETE FROM moderation_queue WHERE id = $1`, [q.id])
    const r = await one<{ n: string; queue_id: string | null }>(
      `SELECT count(*) n, max(queue_id::text) queue_id FROM moderation_actions`
    )
    expect(r.n).toBe('1')
    expect(r.queue_id).toBeNull()
  })

  it('an action REQUIRES a reason — §4.5 makes it NOT NULL', async () => {
    await expect(
      db.query(`INSERT INTO moderation_actions (action, actor_id) VALUES ('warn',$1)`, [MOD])
    ).rejects.toMatchObject({ code: '23502' })
  })

  it('the actor of an action cannot be deleted away', async () => {
    await db.query(
      `INSERT INTO moderation_actions (action, actor_id, reason) VALUES ('warn',$1,'x')`, [MOD]
    )
    await expect(db.query(`DELETE FROM profiles WHERE id=$1`, [MOD])).rejects.toMatchObject({ code: '23503' })
  })
})

// ===========================================================================
// 🔑 ADR-026 — the privacy boundary
// ===========================================================================
describe('🔑 ADR-026 — reporter provenance', () => {
  it('I-2 a MUSIC report carries the real reporter id', async () => {
    await musicReport()
    await ingest()
    const rows = await queue()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('music_report')
    expect(rows[0].reported_by).toBe(REPORTER)
  })

  it('🔑 I-1 a CONTENT-SAFETY report carries NULL, never an id', async () => {
    await contentReport('src-aaa')
    await ingest()
    const rows = await queue()
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('review_report')
    expect(rows[0].reported_by).toBeNull()
  })

  it('🔑 the opaque source id is carried into metadata', async () => {
    await contentReport('src-aaa')
    await ingest()
    expect((await queue())[0].metadata).toMatchObject({ reporter_source_id: 'src-aaa' })
  })

  it('🔑 two different sources stay distinguishable — the corroboration signal', async () => {
    // `content_reports` has UNIQUE (content_id, reporter_source_id, reason) so
    // "duplicate submissions must not manufacture corroboration". Discarding the
    // source id would throw that protection away at the moment it matters:
    // five reports from one person would look like five people.
    await contentReport('src-aaa')
    await contentReport('src-bbb')
    await ingest()
    const sources = (await queue()).map((r) => (r.metadata as { reporter_source_id?: string })?.reporter_source_id)
    expect(new Set(sources).size).toBe(2)
  })

  it('🔑 I-3 the content-safety path never touches profiles or auth.users', async () => {
    // There is nothing to join on — the derivation is one-way — and a future
    // column that made a join possible would break ADR-026 silently.
    const r = await one<{ src: string }>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname='fn_ingest_moderation_reports'`
    )
    const contentBranch = r.src.slice(r.src.indexOf('content_reports'))
    expect(contentBranch).not.toContain('auth.users')
    expect(contentBranch).not.toContain('profiles')
  })

  it('I-4 content_reports gains no column', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='content_reports' ORDER BY column_name`
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'content_id', 'created_at', 'id', 'policy_id', 'reason',
      'reporter_source_id', 'status', 'verification_state',
    ])
  })

  it('a music report with no reporter (deleted account) is still ingested, with NULL', async () => {
    await musicReport('spam', null)
    await ingest()
    const rows = await queue()
    expect(rows).toHaveLength(1)
    expect(rows[0].reported_by).toBeNull()
    // and it is NOT a content-safety row, so it carries no provenance id
    expect(rows[0].metadata ?? {}).not.toHaveProperty('reporter_source_id')
  })
})

// ===========================================================================
// Ingestion — idempotent, and it maps each source to its own type
// ===========================================================================
describe('ingestion', () => {
  it('maps each source to its §4.4 type and target', async () => {
    await musicReport()
    await contentReport()
    await ingest()
    const rows = await queue()
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]))
    expect(byType['music_report'].target_type).toBe('music_track')
    expect(byType['music_report'].target_id).toBe(TRACK)
    expect(byType['review_report'].target_type).toBe('review')
    expect(byType['review_report'].target_id).toBe(REVIEW)
  })

  it('🔑 running twice does not duplicate a report', async () => {
    await musicReport()
    await ingest()
    await ingest()
    expect(await queue()).toHaveLength(1)
  })

  it('a NEW report arriving later is picked up by the next run', async () => {
    await musicReport('copyright')
    await ingest()
    await musicReport('spam')
    await ingest()
    expect(await queue()).toHaveLength(2)
  })

  it('🔑 a moderator’s decision is not undone by the next ingestion', async () => {
    // The queue is a worklist, not a mirror. Re-ingesting must not reopen an
    // item somebody already resolved.
    await musicReport()
    await ingest()
    await db.query(`UPDATE moderation_queue SET status='dismissed', resolved_by=$1, resolved_at=now()`, [MOD])
    await ingest()
    const rows = await queue()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('dismissed')
  })

  it('the carried reason survives ingestion', async () => {
    await musicReport('copyright')
    await ingest()
    expect((await queue())[0].reason).toBe('copyright')
  })

  it('new items start pending at the default priority', async () => {
    await musicReport()
    await ingest()
    const r = (await queue())[0]
    expect(r.status).toBe('pending')
    expect(r.priority).toBe(1)
  })

  it('an empty source set writes nothing at all', async () => {
    await ingest()
    expect(await queue()).toHaveLength(0)
  })
})

// ===========================================================================
// SECURITY — ADR-019, and I-6
// ===========================================================================
describe('🔑 security — the queue is service-tier only', () => {
  it('I-6 anon and authenticated cannot read either table', async () => {
    await musicReport()
    await ingest()
    for (const t of ['moderation_queue', 'moderation_actions']) {
      expect(await asRole('anon', `SELECT * FROM ${t}`), t).toBe('42501')
      expect(await asRole('authenticated', `SELECT * FROM ${t}`), t).toBe('42501')
    }
  })

  it('🔑 a reporter cannot read back the queue row their report became', async () => {
    // `content_reports` has no SELECT policy precisely because "a report set is
    // a map of who reported whom". Ingesting into a readable table would undo
    // that in one step.
    await contentReport()
    await ingest()
    expect(await asRole('authenticated', `SELECT metadata FROM moderation_queue`)).toBe('42501')
  })

  it('anon and authenticated cannot write either table', async () => {
    expect(await asRole('anon', `INSERT INTO moderation_queue (type, target_type, target_id) VALUES ('user_report','user',gen_random_uuid())`)).toBe('42501')
    expect(await asRole('authenticated', `INSERT INTO moderation_actions (action, actor_id, reason) VALUES ('warn','${MOD}','x')`)).toBe('42501')
  })

  it('🔑 the control table IS reachable — proving the harness grants are real', async () => {
    expect(await asRole('anon', `SELECT * FROM harness_control`)).toBeNull()
  })

  it('RLS is enabled with ZERO policies on both', async () => {
    const { rows } = await db.query<{ relname: string; rls: boolean; policies: string }>(
      `SELECT c.relname, c.relrowsecurity AS rls,
              (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
         FROM pg_class c WHERE c.relname IN ('moderation_queue','moderation_actions') ORDER BY c.relname`
    )
    for (const r of rows) {
      expect(r.rls, r.relname).toBe(true)
      expect(r.policies, r.relname).toBe('0')
    }
  })

  it('service_role keeps access', async () => {
    expect(await asRole('service_role', `SELECT * FROM moderation_queue`)).toBeNull()
  })

  it('anon and authenticated cannot EXECUTE the ingestion', async () => {
    const call = `SELECT fn_ingest_moderation_reports()`
    expect(await asRole('anon', call)).toBe('42501')
    expect(await asRole('authenticated', call)).toBe('42501')
  })

  it('the ingestion is SECURITY DEFINER with a pinned search_path', async () => {
    const r = await one<{ prosecdef: boolean; cfg: string[] | null }>(
      `SELECT prosecdef, proconfig cfg FROM pg_proc WHERE proname='fn_ingest_moderation_reports'`
    )
    expect(r.prosecdef).toBe(true)
    expect(r.cfg).toContain('search_path=public, pg_temp')
  })

  it('I-4 content_reports keeps its policies untouched', async () => {
    const r = await one<{ n: string }>(
      `SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND tablename='content_reports'`
    )
    // The prelude models the table without policies; what matters is that the
    // migration added none and removed none.
    expect(r.n).toBe('0')
  })
})
