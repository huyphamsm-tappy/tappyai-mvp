import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddedPostgres from 'embedded-postgres'
import type { Client } from 'pg'

// ─────────────────────────────────────────────────────────────────────────────
// PUSH CREDENTIAL OWNERSHIP — one device, one account.
//
// Runs the ACTUAL .sql files from disk against a REAL PostgreSQL, in the order
// production applies them. Everything here is a property of the database, and
// none of it is reachable by tsc, lint or the app suite: a trigger that silently
// updates zero rows and a REVOKE that leaves an explicit `anon` grant behind
// both look perfect in review.
//
// 🚨 THE INCIDENT THIS EXISTS FOR (2026-08-29, production)
// A browser signed in as account B displayed a Web Push notification addressed
// to account A. Measured 2026-08-30: the whole table held ONE row and ZERO
// credentials were claimed by more than one user.
//
// So the regression test that matters is NOT "two rows collide". It is "one
// row, and its owner is no longer the person at the keyboard". A suite that
// only tested the duplicate case would be green against the exact bug.
// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..')
const BASE = readFileSync(join(REPO, 'supabase/migrations/20260621_notification_subscriptions.sql'), 'utf8')
const OWNERSHIP = readFileSync(join(REPO, 'supabase/migrations/20260830_push_credential_ownership.sql'), 'utf8')
const ROLLBACK = readFileSync(join(REPO, 'supabase/migrations/rollback/20260830_push_credential_ownership_rollback.sql'), 'utf8')

// The harness owns what "the platform" is — not any individual test. Both facts
// below are things Supabase configures on every project, and both are what make
// the assertions mean anything:
//   · auth.uid() reads request.jwt.claims. A constant stub could not express
//     "no session", which is one of the cases disown_push_credential must reject.
//   · ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to anon and
//     authenticated EXPLICITLY, on top of PostgreSQL's PUBLIC default. Without
//     it the ACL tests would pass against a platform where the exposure they
//     guard against cannot occur (the F-04 failure in audit_chain.test.ts).
const PRELUDE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $fn$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $fn$;
  GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;

  -- notification_subscriptions.user_id REFERENCES auth.users(id) ON DELETE CASCADE.
  CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
`

const A = '11111111-1111-1111-1111-111111111111' // the account that first subscribed
const B = '22222222-2222-2222-2222-222222222222' // the account that arrives later
const C = '33333333-3333-3333-3333-333333333333'

// A stand-in for the shape a real FCM Web Push endpoint has. Never a real one:
// an endpoint names a specific person's browser, and inside this feature it is
// what disown_push_credential acts on.
const DEVICE_1 = 'https://fcm.googleapis.com/fcm/send/TEST-DEVICE-ONE:APA91bExample'
const DEVICE_2 = 'https://fcm.googleapis.com/fcm/send/TEST-DEVICE-TWO:APA91bExample'

const PORT = 54369

let pg: EmbeddedPostgres
let db: Client
let dataDir: string

/** Impersonate a signed-in account, or none. is_local MUST be false — each
 *  db.query() is its own implicit transaction. */
async function asSession(uid: string | null) {
  if (uid === null) {
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`)
    return
  }
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
}

/** Runs `sql` as `role`, returning the PostgreSQL error code or null on success. */
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

/** Insert a subscription the way the route's upsert would, as the table owner. */
async function subscribe(
  userId: string,
  endpoint: string,
  opts: { updatedAt?: string; createdAt?: string } = {},
) {
  await db.query(
    `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled, created_at, updated_at)
     VALUES ($1, 'webpush', jsonb_build_object('endpoint', $2::text, 'keys', jsonb_build_object('p256dh','p','auth','a')), true,
             COALESCE($4::timestamptz, now()), COALESCE($3::timestamptz, now()))
     ON CONFLICT (user_id, provider) DO UPDATE
       SET subscription_data = EXCLUDED.subscription_data, enabled = true`,
    [userId, endpoint, opts.updatedAt ?? null, opts.createdAt ?? null],
  )
}

/** Every row for a credential, newest claim first — the shape the assertions read. */
async function claims(endpoint: string) {
  const { rows } = await db.query(
    `SELECT user_id, enabled FROM public.notification_subscriptions
      WHERE public.push_credential(subscription_data) = $1
      ORDER BY enabled DESC, user_id`,
    [endpoint],
  )
  return rows as { user_id: string; enabled: boolean }[]
}

/** What src/lib/notifications/send.ts asks for before dispatching to a user. */
async function enabledSubscriptionsFor(userId: string) {
  const { rows } = await db.query(
    `SELECT id FROM public.notification_subscriptions WHERE user_id = $1 AND enabled`,
    [userId],
  )
  return rows.length
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pgpushown-'))
  pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT,
    persistent: false,
    // --locale=C: the Windows runner's default collation is WIN1252 and initdb
    // refuses it. Same workaround as the existing suites.
    initdbFlags: ['--locale=C'],
  })
  await pg.initialise(); await pg.start(); await pg.createDatabase('test')
  db = pg.getPgClient('test'); await db.connect()
}, 180_000)

afterAll(async () => {
  try { await db?.end() } catch { /* closed */ }
  try { await pg?.stop() } catch { /* stopped */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
})

beforeEach(async () => {
  // A test whose statement threw mid-`SET ROLE` would otherwise leak that role
  // into this setup, which then fails on schema ownership and masks the real
  // failure.
  await db.query('RESET ROLE')
  await db.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await db.query(PRELUDE)
  await db.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3)`, [A, B, C])
  await db.query(BASE)
  await asSession(null)
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. Backfill — collapse pre-existing multi-claims, deterministically
// ═══════════════════════════════════════════════════════════════════════════

describe('1. backfill', () => {
  it('keeps exactly the most recently updated claim and disables the rest', async () => {
    await subscribe(A, DEVICE_1, { updatedAt: '2026-01-01T00:00:00Z' })
    await subscribe(B, DEVICE_1, { updatedAt: '2026-03-01T00:00:00Z' }) // newest
    await subscribe(C, DEVICE_1, { updatedAt: '2026-02-01T00:00:00Z' })

    await db.query(OWNERSHIP)

    const rows = await claims(DEVICE_1)
    expect(rows.filter(r => r.enabled).map(r => r.user_id)).toEqual([B])
    // Losers are disabled, never deleted: past notifications' push_status refers to them.
    expect(rows).toHaveLength(3)
  })

  it('picks the same survivor every time it is re-run over the same rows', async () => {
    // The property that matters is not "account C always wins" — with every
    // timestamp tied the last key is the row's own id, a random UUID, so WHICH
    // account survives a total tie is arbitrary. What must never vary is the
    // answer for a GIVEN set of rows: this repository applies SQL to production
    // by hand, files get re-run, and a backfill that disabled a different
    // person's device on the second run would be silently destructive.
    const STAMP = '2026-05-05T00:00:00Z'
    for (const u of [C, A, B]) await subscribe(u, DEVICE_1, { updatedAt: STAMP, createdAt: STAMP })

    await db.query(OWNERSHIP)
    const first = (await claims(DEVICE_1)).filter(r => r.enabled).map(r => r.user_id)
    expect(first).toHaveLength(1)

    // Put the table back the way it was and run the same file again.
    await db.query('DROP TRIGGER IF EXISTS trg_notif_subs_single_owner ON public.notification_subscriptions')
    await db.query('DROP INDEX IF EXISTS notification_subscriptions_one_owner_per_credential')
    await db.query(`UPDATE public.notification_subscriptions SET enabled = true, updated_at = $1`, [STAMP])
    await db.query(OWNERSHIP)

    expect((await claims(DEVICE_1)).filter(r => r.enabled).map(r => r.user_id)).toEqual(first)
  })

  it('prefers the most recently updated claim over the most recently created one', async () => {
    // `updated_at` is bumped by trg_notif_subs_updated_at on every re-subscribe,
    // so it names the account that most recently proved it was at that device.
    // A row created later but never re-subscribed must NOT win.
    await subscribe(A, DEVICE_1, { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z' })
    await subscribe(B, DEVICE_1, { createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' })

    await db.query(OWNERSHIP)

    expect((await claims(DEVICE_1)).filter(r => r.enabled).map(r => r.user_id)).toEqual([A])
  })

  it('leaves an already-clean table alone — which is what production is', async () => {
    // Measured 2026-08-30: 1 row, 0 duplicated credentials. The backfill must be
    // a no-op there, not a surprise.
    await subscribe(A, DEVICE_1)
    await db.query(OWNERSHIP)
    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: true }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. I1 — the partial unique index is real, not decorative
// ═══════════════════════════════════════════════════════════════════════════

describe('2. one enabled claim per credential', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  it('rejects a second enabled claim when the trigger is not there to transfer', async () => {
    // The index is the BACKSTOP. Proving it means removing the mechanism that
    // normally prevents the collision — otherwise this test only re-tests the
    // trigger and the index could be missing entirely.
    await db.query('ALTER TABLE public.notification_subscriptions DISABLE TRIGGER trg_notif_subs_single_owner')
    await subscribe(A, DEVICE_1)
    const code = await asRole('postgres', `
      INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
      VALUES ('${B}', 'webpush', '{"endpoint":"${DEVICE_1}"}'::jsonb, true)`)
    expect(code).toBe('23505') // unique_violation
  })

  it('allows any number of DISABLED rows for the same credential — they are history', async () => {
    await db.query('ALTER TABLE public.notification_subscriptions DISABLE TRIGGER trg_notif_subs_single_owner')
    for (const u of [A, B, C]) {
      await db.query(
        `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
         VALUES ($1,'webpush', jsonb_build_object('endpoint',$2::text), false)`, [u, DEVICE_1])
    }
    const rows = await claims(DEVICE_1)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => !r.enabled)).toBe(true)
  })

  it('is unique and partial, not a plain index', async () => {
    const { rows } = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'notification_subscriptions_one_owner_per_credential'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX/)
    expect(rows[0].indexdef).toMatch(/WHERE enabled/)
  })

  it('covers FCM tokens with the same rule, before Android ships', async () => {
    const TOKEN = 'fZx1_test-token:APA91bExampleValue'
    await db.query(
      `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
       VALUES ($1,'fcm', jsonb_build_object('token',$2::text), true)`, [A, TOKEN])
    await db.query(
      `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
       VALUES ($1,'fcm', jsonb_build_object('token',$2::text), true)`, [B, TOKEN])

    const { rows } = await db.query(
      `SELECT user_id, enabled FROM public.notification_subscriptions
        WHERE public.push_credential(subscription_data) = $1 AND enabled`, [TOKEN])
    expect(rows.map(r => r.user_id)).toEqual([B])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ownership transfer on subscribe
// ═══════════════════════════════════════════════════════════════════════════

describe('3. transfer', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  it('moves the device from the previous account to the one subscribing now', async () => {
    await subscribe(A, DEVICE_1)
    await subscribe(B, DEVICE_1)

    expect(await claims(DEVICE_1)).toEqual([
      { user_id: B, enabled: true },
      { user_id: A, enabled: false },
    ])
    expect(await enabledSubscriptionsFor(A)).toBe(0)
    expect(await enabledSubscriptionsFor(B)).toBe(1)
  })

  it('transfers back when the first account returns to that device', async () => {
    await subscribe(A, DEVICE_1)
    await subscribe(B, DEVICE_1)
    await subscribe(A, DEVICE_1)

    expect(await claims(DEVICE_1)).toEqual([
      { user_id: A, enabled: true },
      { user_id: B, enabled: false },
    ])
  })

  it('does not touch a different device', async () => {
    await subscribe(A, DEVICE_1)
    await subscribe(B, DEVICE_2)

    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: true }])
    expect(await claims(DEVICE_2)).toEqual([{ user_id: B, enabled: true }])
  })

  it('survives a row with no credential at all instead of erroring', async () => {
    // The route rejects these, but the trigger must not be the thing that
    // discovers a malformed row — it would take the whole write down with it.
    await db.query(
      `INSERT INTO public.notification_subscriptions (user_id, provider, subscription_data, enabled)
       VALUES ($1,'webpush','{"nothing":"useful"}'::jsonb,true)`, [A])
    expect(await enabledSubscriptionsFor(A)).toBe(1)
  })

  it('🚨 the definer is not subject to the table\'s RLS — pinned, because FORCE would silence it', async () => {
    // With FORCE ROW LEVEL SECURITY the transfer UPDATE inside the SECURITY
    // DEFINER function would be filtered to zero rows and report success. The
    // leak would come back with every other test in this file still green.
    const { rows } = await db.query(
      `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'notification_subscriptions'`)
    expect(rows[0].relforcerowsecurity).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. disown_push_credential — identity comes from auth.uid(), never a parameter
// ═══════════════════════════════════════════════════════════════════════════

describe('4. disown_push_credential', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  const disown = async (endpoint: string) => {
    const { rows } = await db.query(`SELECT public.disown_push_credential($1) AS mine`, [endpoint])
    return rows[0].mine as boolean
  }

  it('releases another account\'s claim and reports the caller does not own it', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(B)

    expect(await disown(DEVICE_1)).toBe(false)
    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: false }])
  })

  it('leaves the caller\'s own claim alone and reports it', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(A)

    expect(await disown(DEVICE_1)).toBe(true)
    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: true }])
  })

  it('never enables or creates anything — it can only take away', async () => {
    await asSession(B)
    expect(await disown(DEVICE_1)).toBe(false)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.notification_subscriptions')
    expect(rows[0].n).toBe(0)
  })

  it('refuses a request with no session', async () => {
    await asSession(null)
    await expect(db.query(`SELECT public.disown_push_credential($1)`, [DEVICE_1]))
      .rejects.toThrow(/not authenticated/i)
  })

  it('refuses an empty credential', async () => {
    await asSession(B)
    await expect(db.query(`SELECT public.disown_push_credential('')`)).rejects.toThrow(/credential required/i)
  })

  it('🚨 takes no caller-supplied user id — the parameter list is the guarantee', async () => {
    // The route-level equivalent of this is already pinned ("never lets the
    // request body decide who the subscription belongs to"). Adding a p_user_id
    // here would let anyone disown anyone, and would still pass every behaviour
    // test above, so the signature itself is asserted.
    const { rows } = await db.query(`
      SELECT pg_get_function_identity_arguments(p.oid) AS args, p.pronargs
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'disown_push_credential'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].pronargs).toBe(1)
    expect(rows[0].args).toBe('p_credential text')
  })

  it('is callable by a signed-in user through the authenticated role', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(B)
    expect(await asRole('authenticated', `SELECT public.disown_push_credential('${DEVICE_1}')`)).toBeNull()
    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: false }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Function ACL — the intent, not the platform default
// ═══════════════════════════════════════════════════════════════════════════

describe('5. ACL', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  // has_function_privilege is the authority. OpenAPI/pg_proc listings do not
  // filter by EXECUTE, so a function can look private and still be callable.
  const can = async (role: string, sig: string) => {
    const { rows } = await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, sig])
    return rows[0].ok as boolean
  }

  it('disown_push_credential is denied to anon and PUBLIC, allowed to authenticated', async () => {
    expect(await can('anon', 'public.disown_push_credential(text)')).toBe(false)
    expect(await can('public', 'public.disown_push_credential(text)')).toBe(false)
    expect(await can('authenticated', 'public.disown_push_credential(text)')).toBe(true)
  })

  it('disown_push_credential is not granted to service_role — no server path needs it', async () => {
    expect(await can('service_role', 'public.disown_push_credential(text)')).toBe(false)
  })

  it('the transfer trigger function is reachable by nobody', async () => {
    for (const role of ['anon', 'authenticated', 'service_role', 'public']) {
      expect(await can(role, 'public.notification_subscriptions_enforce_single_owner()'),
        `${role} must not hold EXECUTE`).toBe(false)
    }
  })

  it('anon calling disown over the API surface is refused, not merely unhelpful', async () => {
    await asSession(B)
    expect(await asRole('anon', `SELECT public.disown_push_credential('${DEVICE_1}')`)).toBe('42501')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. RLS is not widened by any of this
// ═══════════════════════════════════════════════════════════════════════════

describe('6. RLS', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  it('keeps the original policy, unchanged and alone', async () => {
    const { rows } = await db.query(
      `SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'notification_subscriptions'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].policyname).toBe('users_manage_own_subscriptions')
    expect(rows[0].qual).toContain('auth.uid()')
    expect(rows[0].with_check).toContain('auth.uid()')
  })

  it('a signed-in user still cannot see another account\'s subscription', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(B)
    await db.query('SET ROLE authenticated')
    const { rows } = await db.query('SELECT id FROM public.notification_subscriptions')
    await db.query('RESET ROLE')
    expect(rows).toHaveLength(0)
  })

  it('a signed-in user still cannot disable another account\'s subscription directly', async () => {
    // The transfer is performed BY THE DATABASE. It must not become a way for a
    // caller to reach rows RLS otherwise hides.
    await subscribe(A, DEVICE_1)
    await asSession(B)
    await db.query('SET ROLE authenticated')
    const res = await db.query(
      `UPDATE public.notification_subscriptions SET enabled = false
        WHERE public.push_credential(subscription_data) = $1`, [DEVICE_1])
    await db.query('RESET ROLE')
    expect(res.rowCount).toBe(0)
    expect(await claims(DEVICE_1)).toEqual([{ user_id: A, enabled: true }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. REGRESSION — the production incident of 2026-08-29, exactly as measured
// ═══════════════════════════════════════════════════════════════════════════

describe('7. regression: 2026-08-29 — one row, and its owner left', () => {
  beforeEach(async () => { await db.query(OWNERSHIP) })

  it('reproduces the pre-fix state: a single row is enough to leak', async () => {
    // The whole production table was ONE enabled row owned by A. The browser was
    // then signed in as B, who had no row at all. Nothing here is a duplicate —
    // a duplicate-detecting query answers "0 problems" about this exact state.
    await subscribe(A, DEVICE_1)
    await asSession(B)

    const { rows } = await db.query(
      `SELECT public.push_credential(subscription_data) AS cred, count(*)::int AS n
         FROM public.notification_subscriptions WHERE enabled
        GROUP BY 1 HAVING count(*) > 1`)
    expect(rows, 'a duplicate scan is blind to this state — that is the point').toEqual([])

    // And yet a push addressed to A would be delivered to the device B is using.
    expect(await enabledSubscriptionsFor(A)).toBe(1)
  })

  it('B arriving on that browser releases the device, and A stops being pushed to it', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(B)

    const mine = await db.query(`SELECT public.disown_push_credential($1) AS mine`, [DEVICE_1])

    // A is no longer reachable at that device: send.ts finds no enabled
    // subscription, so emitNotification records push_status='skipped' and no
    // push is dispatched.
    expect(await enabledSubscriptionsFor(A)).toBe(0)
    // B is NOT auto-subscribed. Consent is per account: B is told the truth
    // (mine = false) and opts in themselves, or does not.
    expect(mine.rows[0].mine).toBe(false)
    expect(await enabledSubscriptionsFor(B)).toBe(0)
  })

  it('after B opts in, the device is B\'s and only B\'s', async () => {
    await subscribe(A, DEVICE_1)
    await asSession(B)
    await db.query(`SELECT public.disown_push_credential($1)`, [DEVICE_1])
    await subscribe(B, DEVICE_1)

    expect(await enabledSubscriptionsFor(A)).toBe(0)
    expect(await enabledSubscriptionsFor(B)).toBe(1)
    expect((await claims(DEVICE_1)).filter(r => r.enabled)).toEqual([{ user_id: B, enabled: true }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. Rollback — removes the enforcement, and deliberately NOT the data
// ═══════════════════════════════════════════════════════════════════════════

describe('8. rollback', () => {
  it('drops every object it created', async () => {
    await db.query(OWNERSHIP)
    await db.query(ROLLBACK)

    const { rows: trg } = await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notif_subs_single_owner'`)
    const { rows: idx } = await db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'notification_subscriptions_one_owner_per_credential'`)
    const { rows: fns } = await db.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND proname IN
          ('push_credential','disown_push_credential','notification_subscriptions_enforce_single_owner')`)
    expect(trg).toEqual([])
    expect(idx).toEqual([])
    expect(fns).toEqual([])
  })

  it('🚨 does NOT re-enable claims the transfer disabled — the asymmetry is the point', async () => {
    // Re-enabling them would restore the privacy bug as a side effect of undoing
    // a schema change. If someone ever "fixes" the rollback to be symmetric,
    // this fails.
    await db.query(OWNERSHIP)
    await subscribe(A, DEVICE_1)
    await subscribe(B, DEVICE_1) // transfers; A's row goes enabled = false

    await db.query(ROLLBACK)

    const { rows } = await db.query(
      `SELECT user_id, enabled FROM public.notification_subscriptions ORDER BY enabled DESC`)
    expect(rows).toEqual([
      { user_id: B, enabled: true },
      { user_id: A, enabled: false },
    ])
  })

  it('leaves the table and its RLS policy exactly as the base migration built them', async () => {
    await db.query(OWNERSHIP)
    await db.query(ROLLBACK)

    const { rows: pol } = await db.query(
      `SELECT policyname FROM pg_policies WHERE tablename = 'notification_subscriptions'`)
    expect(pol.map(r => r.policyname)).toEqual(['users_manage_own_subscriptions'])

    const { rows: cols } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='notification_subscriptions' ORDER BY ordinal_position`)
    expect(cols.map(c => c.column_name)).toEqual([
      'id', 'user_id', 'provider', 'subscription_data', 'enabled', 'created_at', 'updated_at',
    ])
  })
})
