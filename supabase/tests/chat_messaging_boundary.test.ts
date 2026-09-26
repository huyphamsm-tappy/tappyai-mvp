import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ---------------------------------------------------------------------------
// Social messaging Phase 1 — the database boundary.
//
// 🚨 WHY THIS SUITE EXISTS BEFORE ANY UI DOES.
//
// Private conversations between real people are the highest-consequence read
// this product has. A frontend that only renders your own threads proves
// nothing: the question is what the DATABASE returns to someone who asks for a
// thread they are not in, with a hand-written request and no frontend at all.
//
// Two platform facts make that question sharp:
//
//   1. Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
//      TABLES TO anon, authenticated, service_role`. Every new table is born
//      readable and writable by `anon`. Enabling RLS does not undo a grant.
//
//   2. An anonymous session IS an authenticated user (B17) — a real
//      `auth.users` row with `is_anonymous = true`. `if (!user) return 401`
//      lets it through.
//
// The `harness_control` table below is deliberately left at those defaults, so
// "anon is closed" means the migration closed it rather than the harness never
// having opened it.
// ---------------------------------------------------------------------------

const REPO = join(__dirname, '..', '..')
const MIGRATION_PATH = 'supabase/migrations/20260905_chat_messaging_phase1.sql'
const MIGRATION = readFileSync(join(REPO, MIGRATION_PATH), 'utf8')

const PORT = 54375

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'
const ANON_USER = '44444444-4444-4444-8444-444444444444'

/** Production as it stands: Supabase roles, the auth shims, and the open defaults. */
const PRELUDE = `
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
  -- The is_anonymous claim the app's own guards read (B17).
  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

  CREATE TABLE auth.users (id UUID PRIMARY KEY, is_anonymous BOOLEAN NOT NULL DEFAULT false);
  GRANT SELECT ON auth.users TO anon, authenticated, service_role;

  -- The platform fact the migration must defend against.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Realtime's publication exists on a real Supabase project.
  CREATE PUBLICATION supabase_realtime;

  -- Control object: same defaults, never revoked.
  CREATE TABLE public.harness_control (id INT PRIMARY KEY);

  INSERT INTO auth.users (id, is_anonymous) VALUES
    ('${ALICE}', false), ('${BOB}', false), ('${CAROL}', false), ('${ANON_USER}', true);
`

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Runs `sql` as `role` with a session subject and optional JWT claims. Returns SQLSTATE or null. */
async function asRole(
  role: string,
  sql: string,
  sub: string | null = null,
  claims: Record<string, unknown> | null = null,
): Promise<string | null> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ''])
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

/** Reads rows as `role`. Throws if the role cannot run the statement at all. */
async function rowsAsRole(
  role: string,
  sql: string,
  sub: string | null = null,
  claims: Record<string, unknown> | null = null,
) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub ?? ''])
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ''])
  try {
    await db.query(`SET ROLE ${role}`)
    return (await db.query(sql)).rows
  } finally {
    await db.query('RESET ROLE')
  }
}

/** Calls a function as `authenticated`, returning its scalar result. */
async function rpc(sub: string, sql: string, claims: Record<string, unknown> | null = null) {
  const rows = await rowsAsRole('authenticated', sql, sub, claims ?? { sub, is_anonymous: false })
  return rows[0]
}

const one = async (sql: string) => (await db.query(sql)).rows[0]

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chat-messaging-'))
  // 🚨 `--encoding=UTF8` is not decoration. initdb on Windows defaults the cluster to WIN1252,
  // and this feature's whole subject matter is Vietnamese message bodies — `một`, `Đà Lạt`, `tư`
  // all carry codepoints WIN1252 cannot represent, and the driver fails the INSERT rather than
  // mangling it. The same flag is why `publication_boundary_rls.test.ts` can apply a migration
  // whose comments contain 🚨. A messaging suite that could only store ASCII would be testing a
  // product we do not ship.
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('chatmsg')
  db = pg.getPgClient('chatmsg') as unknown as Client
  await db.connect()

  await db.query(PRELUDE)
  await db.query(MIGRATION)
}, 180_000)

afterAll(async () => {
  await db?.end()
  await pg?.stop()
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* windows file locks */ }
})

beforeEach(async () => {
  await db.query('DELETE FROM public.chat_messages')
  await db.query('DELETE FROM public.chat_reads')
  await db.query('DELETE FROM public.chat_participants')
  await db.query('DELETE FROM public.chat_threads')
})

describe('harness integrity — the platform defaults were in force', () => {
  it('the control object carries the default grants, so a closed ACL means something', async () => {
    const r = await one(`SELECT
      has_table_privilege('anon','public.harness_control','SELECT')          AS anon_sel,
      has_table_privilege('authenticated','public.harness_control','UPDATE') AS auth_upd`)
    expect(r.anon_sel).toBe(true)
    expect(r.auth_upd).toBe(true)
  })
})

describe('anon is closed completely', () => {
  it('holds no privilege on any messaging table', async () => {
    for (const table of ['chat_threads', 'chat_participants', 'chat_messages', 'chat_reads']) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const r = await one(`SELECT has_table_privilege('anon','public.${table}','${priv}') AS ok`)
        expect(r.ok, `anon must not hold ${priv} on ${table}`).toBe(false)
      }
    }
  })

  it('cannot execute the membership functions', async () => {
    const r = await one(`SELECT
      has_function_privilege('anon','public.chat_start_direct(uuid)','EXECUTE')       AS direct,
      has_function_privilege('anon','public.chat_create_group(text,uuid[])','EXECUTE') AS grp,
      has_function_privilege('anon','public.chat_is_participant(uuid)','EXECUTE')      AS part`)
    expect(r.direct).toBe(false)
    expect(r.grp).toBe(false)
    expect(r.part).toBe(false)
  })
})

describe('authenticated holds exactly the privileges Phase 1 intends', () => {
  it('cannot mint membership — no INSERT on threads or participants', async () => {
    // 🚨 The whole membership model rests on this. An INSERT policy permissive
    // enough to let you add a second person to a thread you are creating is also
    // permissive enough to let you add yourself to someone else's, so the grant
    // is withheld and the functions do it instead.
    const r = await one(`SELECT
      has_table_privilege('authenticated','public.chat_threads','INSERT')      AS th,
      has_table_privilege('authenticated','public.chat_participants','INSERT') AS pa`)
    expect(r.th).toBe(false)
    expect(r.pa).toBe(false)
  })

  it('cannot edit or delete messages — both are Phase 2 and neither is granted', async () => {
    const r = await one(`SELECT
      has_table_privilege('authenticated','public.chat_messages','UPDATE') AS upd,
      has_table_privilege('authenticated','public.chat_messages','DELETE') AS del`)
    expect(r.upd).toBe(false)
    expect(r.del).toBe(false)
  })

  it('may read threads and send messages', async () => {
    const r = await one(`SELECT
      has_table_privilege('authenticated','public.chat_threads','SELECT')  AS th_sel,
      has_table_privilege('authenticated','public.chat_messages','SELECT') AS ms_sel,
      has_table_privilege('authenticated','public.chat_messages','INSERT') AS ms_ins,
      has_table_privilege('authenticated','public.chat_reads','UPDATE')    AS rd_upd`)
    expect(r.th_sel).toBe(true)
    expect(r.ms_sel).toBe(true)
    expect(r.ms_ins).toBe(true)
    expect(r.rd_upd).toBe(true)
  })
})

describe('direct threads are deduplicated by the database, not by the caller', () => {
  it('returns the same thread whichever side asks, in either order', async () => {
    const first = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const again = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const reverse = await rpc(BOB, `SELECT public.chat_start_direct('${ALICE}') AS id`)

    expect(again.id).toBe(first.id)
    expect(reverse.id, 'B→A must resolve to the same thread as A→B').toBe(first.id)

    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.chat_threads WHERE kind = 'direct'`)
    expect(rows[0].n).toBe(1)
  })

  it('the unique index makes a second direct thread impossible even bypassing the function', async () => {
    // service_role bypasses RLS but not constraints. This is what protects the
    // pair when two requests race past any application-level check.
    await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const key = [ALICE, BOB].sort().join(':')
    const code = await asRole('service_role',
      `INSERT INTO public.chat_threads (kind, direct_key) VALUES ('direct', '${key}')`)
    expect(code, 'duplicate direct_key must violate the unique index').toBe('23505')
  })

  it('seeds exactly the two participants', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const { rows } = await db.query(
      `SELECT user_id FROM public.chat_participants WHERE thread_id = '${t.id}' ORDER BY user_id`)
    expect(rows.map(r => r.user_id).sort()).toEqual([ALICE, BOB].sort())
  })

  it('refuses a thread with yourself, and with a user who does not exist', async () => {
    const self = await asRole('authenticated', `SELECT public.chat_start_direct('${ALICE}')`, ALICE, { sub: ALICE, is_anonymous: false })
    expect(self).toBe('22023')
    const ghost = await asRole('authenticated',
      `SELECT public.chat_start_direct('99999999-9999-4999-8999-999999999999')`, ALICE, { sub: ALICE, is_anonymous: false })
    expect(ghost).toBe('22023')
  })
})

describe('anonymous sessions cannot start conversations (B17)', () => {
  it('refuses chat_start_direct', async () => {
    const code = await asRole('authenticated',
      `SELECT public.chat_start_direct('${BOB}')`, ANON_USER, { sub: ANON_USER, is_anonymous: true })
    expect(code, 'an anonymous session is authenticated but is not an account').toBe('42501')
  })

  it('refuses chat_create_group', async () => {
    const code = await asRole('authenticated',
      `SELECT public.chat_create_group('Nhóm', ARRAY['${BOB}']::uuid[])`, ANON_USER, { sub: ANON_USER, is_anonymous: true })
    expect(code).toBe('42501')
  })

  it('leaves no thread behind', async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.chat_threads`)
    expect(rows[0].n).toBe(0)
  })
})

describe('group threads', () => {
  it('creates one thread with the creator included and no direct_key', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_create_group('Nhóm Đà Lạt', ARRAY['${BOB}','${CAROL}']::uuid[]) AS id`)
    const thread = await one(`SELECT kind, title, direct_key FROM public.chat_threads WHERE id = '${t.id}'`)
    expect(thread.kind).toBe('group')
    expect(thread.title).toBe('Nhóm Đà Lạt')
    // Groups are NOT deduplicated: two groups with the same members are two groups.
    expect(thread.direct_key).toBeNull()

    const { rows } = await db.query(`SELECT user_id FROM public.chat_participants WHERE thread_id = '${t.id}'`)
    expect(rows.map(r => r.user_id).sort()).toEqual([ALICE, BOB, CAROL].sort())
  })

  it('refuses a group of one', async () => {
    const code = await asRole('authenticated',
      `SELECT public.chat_create_group('Alone', ARRAY['${ALICE}']::uuid[])`, ALICE, { sub: ALICE, is_anonymous: false })
    expect(code, 'a group whose only member is the creator is a note to self').toBe('22023')
  })
})

describe('a non-participant sees nothing and can write nothing', () => {
  let thread: string

  beforeEach(async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    thread = t.id
    await asRole('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${thread}','${ALICE}','riêng tư')`,
      ALICE, { sub: ALICE, is_anonymous: false })
  })

  it('cannot read the thread', async () => {
    const mine = await rowsAsRole('authenticated', `SELECT id FROM public.chat_threads`, ALICE, { sub: ALICE, is_anonymous: false })
    const theirs = await rowsAsRole('authenticated', `SELECT id FROM public.chat_threads`, CAROL, { sub: CAROL, is_anonymous: false })
    expect(mine).toHaveLength(1)
    expect(theirs, 'Carol is in no thread and must see none').toHaveLength(0)
  })

  it('cannot read the messages', async () => {
    const theirs = await rowsAsRole('authenticated', `SELECT body FROM public.chat_messages`, CAROL, { sub: CAROL, is_anonymous: false })
    expect(theirs).toHaveLength(0)
  })

  it('cannot read the participant roster', async () => {
    const theirs = await rowsAsRole('authenticated', `SELECT user_id FROM public.chat_participants`, CAROL, { sub: CAROL, is_anonymous: false })
    expect(theirs, 'the roster leaks who talks to whom').toHaveLength(0)
  })

  it('cannot insert a message into it', async () => {
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${thread}','${CAROL}','xin chào')`,
      CAROL, { sub: CAROL, is_anonymous: false })
    expect(code, 'RLS must refuse the write').toBe('42501')
  })

  it('cannot claim a read cursor in it', async () => {
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ('${thread}','${CAROL}', now())`,
      CAROL, { sub: CAROL, is_anonymous: false })
    expect(code).toBe('42501')
  })
})

describe('a participant cannot forge the sender', () => {
  it('refuses a message attributed to the other person', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    // 🚨 Both halves of the INSERT policy matter. Without `sender_id = auth.uid()`
    // every thread you belong to becomes a forgery primitive.
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${t.id}','${BOB}','tôi không nói câu này')`,
      ALICE, { sub: ALICE, is_anonymous: false })
    expect(code).toBe('42501')
  })
})

describe('messages, ordering and thread freshness', () => {
  it('persists real rows and orders them by created_at', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    for (const [who, body] of [[ALICE, 'một'], [BOB, 'hai'], [ALICE, 'ba']] as const) {
      await asRole('authenticated',
        `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${t.id}','${who}','${body}')`,
        who, { sub: who, is_anonymous: false })
    }
    const rows = await rowsAsRole('authenticated',
      `SELECT body FROM public.chat_messages WHERE thread_id='${t.id}' ORDER BY created_at, id`,
      ALICE, { sub: ALICE, is_anonymous: false })
    expect(rows.map(r => r.body)).toEqual(['một', 'hai', 'ba'])
  })

  it('the trigger moves last_message_at so the list can sort without scanning messages', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const before = await one(`SELECT last_message_at FROM public.chat_threads WHERE id='${t.id}'`)
    await db.query(
      `INSERT INTO public.chat_messages (thread_id, sender_id, body, created_at)
       VALUES ('${t.id}','${ALICE}','sau', now() + interval '1 hour')`)
    const after = await one(`SELECT last_message_at FROM public.chat_threads WHERE id='${t.id}'`)
    expect(new Date(after.last_message_at).getTime())
      .toBeGreaterThan(new Date(before.last_message_at).getTime())
  })

  it('rejects an empty body', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${t.id}','${ALICE}','')`,
      ALICE, { sub: ALICE, is_anonymous: false })
    expect(code).toBe('23514')
  })
})

describe('read state is per-user and only your own', () => {
  it('lets a participant move their own cursor', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ('${t.id}','${ALICE}', now())
       ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      ALICE, { sub: ALICE, is_anonymous: false })
    expect(code).toBeNull()
  })

  it('refuses to move the other participant’s cursor', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const code = await asRole('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ('${t.id}','${BOB}', now())`,
      ALICE, { sub: ALICE, is_anonymous: false })
    expect(code, 'a read receipt must not be movable on someone else’s behalf').toBe('42501')
  })

  it('cannot see the other participant’s cursor', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    await asRole('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ('${t.id}','${BOB}', now())`,
      BOB, { sub: BOB, is_anonymous: false })
    const seen = await rowsAsRole('authenticated', `SELECT user_id FROM public.chat_reads`, ALICE, { sub: ALICE, is_anonymous: false })
    expect(seen).toHaveLength(0)
  })
})

describe('realtime is published and scoped by RLS, not by a filter', () => {
  it('chat_messages is in the supabase_realtime publication', async () => {
    const r = await one(`SELECT count(*)::int AS n FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_messages'`)
    expect(r.n).toBe(1)
  })

  it('carries REPLICA IDENTITY FULL, as the notifications table does', async () => {
    const r = await one(`SELECT relreplident FROM pg_class WHERE oid = 'public.chat_messages'::regclass`)
    expect(r.relreplident).toBe('f')
  })

  it('the SELECT policy Realtime evaluates is the participant one', async () => {
    // Realtime runs the subscriber's SELECT policy per row. That policy IS the
    // scoping — there is no filter on the channel — so its absence would not
    // break the app, it would broadcast every message to every subscriber.
    const r = await one(`SELECT count(*)::int AS n FROM pg_policies
      WHERE tablename='chat_messages' AND cmd='SELECT' AND policyname='chat_messages_select_participant'`)
    expect(r.n).toBe(1)
  })
})

describe('the conversation list derives unread rather than storing it', () => {
  const summaries = (who: string) =>
    rowsAsRole('authenticated', `SELECT * FROM public.chat_thread_summaries()`, who, { sub: who, is_anonymous: false })

  const say = (who: string, thread: string, body: string) =>
    asRole('authenticated',
      `INSERT INTO public.chat_messages (thread_id, sender_id, body) VALUES ('${thread}','${who}','${body}')`,
      who, { sub: who, is_anonymous: false })

  const markRead = (who: string, thread: string) =>
    asRole('authenticated',
      `INSERT INTO public.chat_reads (thread_id, user_id, last_read_at) VALUES ('${thread}','${who}', now())
       ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      who, { sub: who, is_anonymous: false })

  it('counts what the other person sent and never what you sent', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    await say(BOB, t.id, 'một')
    await say(BOB, t.id, 'hai')
    await say(ALICE, t.id, 'của tôi')

    const [forAlice] = await summaries(ALICE)
    const [forBob] = await summaries(BOB)
    expect(forAlice.unread_count, 'Alice has two from Bob').toBe(2)
    expect(forBob.unread_count, 'Bob wrote two and received one').toBe(1)
  })

  it('a thread never opened counts every message from the other side', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    await say(BOB, t.id, 'chào')
    const [row] = await summaries(ALICE)
    // The default cursor is -infinity, so "no chat_reads row" is not "nothing unread".
    expect(row.unread_count).toBe(1)
  })

  it('drops to zero once the cursor moves, and only for the reader', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    await say(BOB, t.id, 'chào')
    await markRead(ALICE, t.id)

    const [forAlice] = await summaries(ALICE)
    expect(forAlice.unread_count).toBe(0)

    await say(BOB, t.id, 'còn đó không?')
    const [again] = await summaries(ALICE)
    expect(again.unread_count, 'a message after the cursor is unread again').toBe(1)
  })

  it('carries the last message and orders the newest thread first', async () => {
    const older = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    await say(BOB, older.id, 'cũ')
    const newer = await rpc(ALICE, `SELECT public.chat_create_group('Nhóm', ARRAY['${CAROL}']::uuid[]) AS id`)
    await say(CAROL, newer.id, 'mới nhất')

    const rows = await summaries(ALICE)
    expect(rows.map(r => r.thread_id)).toEqual([newer.id, older.id])
    expect(rows[0].last_body).toBe('mới nhất')
    expect(rows[0].last_sender_id).toBe(CAROL)
  })

  it('shows a caller only their own threads', async () => {
    await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const carol = await summaries(CAROL)
    expect(carol).toHaveLength(0)
  })

  it('returns a thread with no messages yet, so a new conversation is visible', async () => {
    const t = await rpc(ALICE, `SELECT public.chat_start_direct('${BOB}') AS id`)
    const [row] = await summaries(ALICE)
    expect(row.thread_id).toBe(t.id)
    expect(row.last_body).toBeNull()
    expect(row.unread_count).toBe(0)
  })
})

describe('the AI assistant and Nhóm ăn are not touched', () => {
  it('the migration never mentions conversations, groups or group_members', () => {
    // 🚨 `public.conversations` is AI chat history (one owner, a JSONB blob of
    // turns) and `groups`/`group_members` are Nhóm ăn (free-text member names,
    // RLS `USING (true)`). Reusing either for social messaging is the specific
    // mistake this whole feature was designed around, so the migration is held
    // to naming neither. Comments are stripped first — the header discusses both
    // at length, which is the point.
    const sql = MIGRATION
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '')
    expect(/\bpublic\.conversations\b/.test(sql)).toBe(false)
    expect(/\bpublic\.groups\b/.test(sql)).toBe(false)
    expect(/\bpublic\.group_members\b/.test(sql)).toBe(false)
  })

  it('creates only the four chat_ tables', async () => {
    const { rows } = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'chat_%' ORDER BY tablename`)
    expect(rows.map(r => r.tablename)).toEqual(
      ['chat_messages', 'chat_participants', 'chat_reads', 'chat_threads'])
  })
})
