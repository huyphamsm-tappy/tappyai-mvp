import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// PHASE C — THE BROADCAST AUDIENCE, AS A PROPERTY OF THE DATABASE.
//
// Contract: V2.2_PHASE_C_BROADCAST_CONTRACT.md — T-6, T-15, T-20, T-21, T-30,
// T-31, C-41.
//
// 🚨 WHY THIS SUITE EXISTS SEPARATELY FROM THE UNIT TESTS. Three of the things
// a broadcast depends on are not reachable from TypeScript at all:
//
//   1. that PostgreSQL returns the audience in a STABLE order (it does not,
//      without ORDER BY — and a stub will always return what it was told to),
//   2. that ONE credential cannot have two enabled owners (I1), which is a
//      partial unique index, not a code path,
//   3. that `account_status` has no row for most users, which is why a LEFT
//      join is required and an INNER join empties the audience.
//
// A mocked client can be made to agree with any of these. Only a real database
// can disagree.
//
// 🔑 THE ACCEPTANCE CONDITION FOR THIS FILE (C-41): drop I1 and the fan-out test
// must go RED. "We have a test for I1" is a claim about a file; "the test fails
// without I1" is a claim about behaviour. The last describe block performs that
// removal and asserts the failure, so the claim is checked rather than asserted.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const SUBS = readFileSync(join(REPO, 'supabase/migrations/20260621_notification_subscriptions.sql'), 'utf8')
const OWNERSHIP = readFileSync(join(REPO, 'supabase/migrations/20260830_push_credential_ownership.sql'), 'utf8')
const STATUS = readFileSync(join(REPO, 'supabase/migrations/20260819_m08_account_status.sql'), 'utf8')

// The platform as Supabase configures it, plus the two objects the status
// migration depends on: `profiles` (its FK target) and `set_updated_at()`.
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;

  CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);

  CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;
`

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'
const D = '44444444-4444-4444-4444-444444444444'

// The shape a Web Push endpoint has. Never a real one — an endpoint names one
// person's browser.
const DEVICE = 'https://fcm.googleapis.com/fcm/send/TEST-SHARED-DEVICE:APA91bExample'
const OTHER_DEVICE = 'https://fcm.googleapis.com/fcm/send/TEST-OTHER-DEVICE:APA91bExample'

const PORT = 54371

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/**
 * THE AUDIENCE QUERY, in SQL.
 *
 * This mirrors what `buildBroadcastAudience` asks PostgREST for, at the level
 * where the properties under test actually live:
 *   · enabled subscriptions only
 *   · INNER on profiles — membership. Absence excludes (C-2).
 *   · LEFT on account_status — eligibility. Absence means ACTIVE (C-31).
 *   · effective suspension, not the raw column (C-32).
 *   · explicit deterministic ORDER BY (C-24).
 */
const AUDIENCE_SQL = `
  SELECT DISTINCT s.user_id
    FROM public.notification_subscriptions s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.account_status a ON a.user_id = s.user_id
   WHERE s.enabled
     AND COALESCE(a.is_banned, false) = false
     AND NOT (
       COALESCE(a.is_suspended, false)
       AND (a.suspended_until IS NULL OR a.suspended_until > now())
     )
   ORDER BY s.user_id ASC
`

async function audience(): Promise<string[]> {
  const { rows } = await db.query(AUDIENCE_SQL)
  return rows.map((r) => r.user_id as string)
}

async function subscribe(userId: string, endpoint: string) {
  await db.query(
    `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
     VALUES ($1, 'webpush', jsonb_build_object('endpoint', $2::text, 'keys', jsonb_build_object('p256dh','p','auth','a')), true)
     ON CONFLICT (user_id, provider) DO UPDATE
       SET subscription_data = EXCLUDED.subscription_data, enabled = true`,
    [userId, endpoint],
  )
}

async function makeUser(id: string, withProfile = true) {
  await db.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  if (withProfile) {
    await db.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])
  }
}

async function setStatus(
  userId: string,
  s: { suspended?: boolean; until?: string | null; banned?: boolean },
) {
  await db.query(
    `INSERT INTO public.account_status (user_id, is_suspended, suspended_until, is_banned)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET is_suspended = EXCLUDED.is_suspended,
           suspended_until = EXCLUDED.suspended_until,
           is_banned = EXCLUDED.is_banned`,
    [userId, s.suspended ?? false, s.until ?? null, s.banned ?? false],
  )
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pg-broadcast-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false,
    // ⚠️ REQUIRED ON WINDOWS. initdb inherits the host's WIN1252 collation, and
    // the migrations these tests load carry emoji in their comments — the
    // server then rejects the whole file with "no equivalent in encoding
    // WIN1252" before a single object is created. Measured here, not assumed.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, onError: () => {},
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('test')
  db = pg.getPgClient('test')
  await db.connect()

  await db.query(PRELUDE)
  await db.query(SUBS)
  await db.query(OWNERSHIP)
  await db.query(STATUS)
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* the server is going away anyway */ }
  try { await pg?.stop() } catch { /* idem */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}, 60_000)

beforeEach(async () => {
  await db.query('DELETE FROM public.notification_subscriptions')
  await db.query('DELETE FROM public.account_status')
  await db.query('DELETE FROM public.profiles')
  await db.query('DELETE FROM auth.users')
})

describe('O-1 = B — the audience is subscribed users, and only them', () => {
  it('a subscribed user is in the audience', async () => {
    await makeUser(A)
    await subscribe(A, DEVICE)
    expect(await audience()).toEqual([A])
  })

  it('🚨 a user with NO subscription is absent — and a subscribed one is still present', async () => {
    await makeUser(A)
    await makeUser(B)
    await subscribe(A, DEVICE)
    expect(await audience()).toEqual([A]) // positive control alongside the exclusion
  })

  it('🚨 a DISABLED subscription is absent', async () => {
    await makeUser(A)
    await makeUser(B)
    await subscribe(A, DEVICE)
    await subscribe(B, OTHER_DEVICE)
    await db.query(`UPDATE public.notification_subscriptions SET enabled = false WHERE user_id = $1`, [B])
    expect(await audience()).toEqual([A])
  })
})

describe('C-2 — an account with no profile is excluded', () => {
  it('🚨 excluded, while a profiled subscriber in the same batch remains', async () => {
    await makeUser(A)
    await makeUser(B, false) // how an anonymous signup appears since 20260808c
    await subscribe(A, DEVICE)
    await subscribe(B, OTHER_DEVICE)
    expect(await audience()).toEqual([A])
  })
})

describe('O-2 = A — account status, where an INNER join would empty the audience', () => {
  it('🚨 MUTATION TARGET — a user with NO account_status row is INCLUDED', async () => {
    await makeUser(A)
    await subscribe(A, DEVICE)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.account_status')
    expect(rows[0].n).toBe(0) // the table really is empty…
    expect(await audience()).toEqual([A]) // …and the audience is not
  })

  it('🚨 a banned account is excluded; an active one remains', async () => {
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE); await subscribe(B, OTHER_DEVICE)
    await setStatus(A, { banned: true })
    expect(await audience()).toEqual([B])
  })

  it('🚨 an indefinitely suspended account is excluded; an active one remains', async () => {
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE); await subscribe(B, OTHER_DEVICE)
    await setStatus(A, { suspended: true, until: null })
    expect(await audience()).toEqual([B])
  })

  it('a suspension still running excludes', async () => {
    await makeUser(A)
    await subscribe(A, DEVICE)
    await setStatus(A, { suspended: true, until: new Date(Date.now() + 86_400_000).toISOString() })
    expect(await audience()).toEqual([])
  })

  it('🚨 MUTATION TARGET — an EXPIRED suspension is INCLUDED, though is_suspended is still true', async () => {
    // Auto-unsuspend is a cron. Reading the raw boolean turns a lapsed 7-day
    // suspension into a permanent one, invisibly.
    await makeUser(A)
    await subscribe(A, DEVICE)
    await setStatus(A, { suspended: true, until: new Date(Date.now() - 86_400_000).toISOString() })
    const { rows } = await db.query('SELECT is_suspended FROM public.account_status WHERE user_id = $1', [A])
    expect(rows[0].is_suspended).toBe(true)
    expect(await audience()).toEqual([A])
  })
})

describe('C-24 — the order is stable, and it comes from the query', () => {
  it('🚨 the same audience, queried twice, is the same SEQUENCE', async () => {
    for (const u of [D, B, C, A]) { await makeUser(u); await subscribe(u, `${DEVICE}-${u}`) }
    const first = await audience()
    // Rewrite every row so PostgreSQL has every excuse to hand them back in a
    // different physical order on the next read.
    await db.query('UPDATE public.notification_subscriptions SET updated_at = now()')
    const second = await audience()
    expect(second).toEqual(first)
    expect(first).toEqual([A, B, C, D]) // and it is the ORDER BY, not luck
  })
})

describe('🚨🚨 T-30 — THE REGRESSION: a broadcast is not a device fan-out', () => {
  it('one credential held in sequence by two accounts is visited ONCE, by its CURRENT owner', async () => {
    // This is the 2026-08-29 incident's shape: account A subscribes on a
    // browser, account B later signs in on the SAME browser and subscribes.
    // The credential is identical; the owner has changed.
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE)
    await subscribe(B, DEVICE) // I1′ transfers ownership inside this statement

    const list = await audience()
    expect(list).toEqual([B])                 // the person at the keyboard
    expect(list).not.toContain(A)             // and NOT the previous owner
    expect(list.filter((x) => x === B)).toHaveLength(1) // exactly once, not twice
  })

  it('T-31 — I1′: exactly one enabled owner remains after the transfer', async () => {
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE)
    await subscribe(B, DEVICE)
    const { rows } = await db.query(
      `SELECT user_id, enabled FROM public.notification_subscriptions
        WHERE public.push_credential(subscription_data) = $1 ORDER BY enabled DESC`,
      [DEVICE],
    )
    expect(rows.filter((r) => r.enabled)).toHaveLength(1)
    expect(rows.find((r) => r.enabled)?.user_id).toBe(B)
  })

  it('two people on two DIFFERENT devices both receive — the dedupe is not over-broad', async () => {
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE)
    await subscribe(B, OTHER_DEVICE)
    expect(await audience()).toEqual([A, B])
  })
})

describe('🚨🚨 C-41 — THE ACCEPTANCE CONDITION: without I1, the fan-out test fails', () => {
  it('dropping the partial unique index makes one credential answer to two accounts', async () => {
    // Not a claim that a test exists — a demonstration that it is load-bearing.
    // With I1 removed, the transfer trigger is bypassed by writing directly, and
    // the audience above would return BOTH owners: a broadcast would push twice
    // to one device, the second addressed to a stranger.
    //
    // 🔑 THE REMOVAL HAPPENS INSIDE A ROLLED-BACK TRANSACTION. PostgreSQL makes
    // DDL transactional, so I1 is restored by ROLLBACK rather than by
    // hand-rebuilding it — and a hand-rebuild is not merely more code, it is
    // unreliable: the rows this test creates VIOLATE the index, so recreating
    // it afterwards fails. A restore path that cannot run is not a restore path.
    await db.query('BEGIN')
    try {
      await db.query('DROP INDEX public.notification_subscriptions_one_owner_per_credential')
      await db.query('DROP TRIGGER trg_notif_subs_single_owner ON public.notification_subscriptions')

      await makeUser(A); await makeUser(B)
      await subscribe(A, DEVICE)
      await subscribe(B, DEVICE)

      // 🚨 THE FAILURE, MADE VISIBLE. Asserted rather than merely described, so
      // that if some future change made the audience safe WITHOUT I1, this test
      // fails and forces someone to re-read the reasoning instead of quietly
      // inheriting a comment that is no longer true.
      const list = await audience()
      expect(list).toEqual([A, B])

      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM public.notification_subscriptions
          WHERE enabled AND public.push_credential(subscription_data) = $1`,
        [DEVICE],
      )
      expect(rows[0].n).toBe(2) // one device, two enabled owners
    } finally {
      await db.query('ROLLBACK')
    }
  })

  it('and with I1 restored, the same sequence yields ONE owner again', async () => {
    // Proves the rollback actually put the invariant back, rather than leaving
    // every later run of this file testing an unprotected database.
    await makeUser(A); await makeUser(B)
    await subscribe(A, DEVICE)
    await subscribe(B, DEVICE)
    expect(await audience()).toEqual([B])
  })
})
