#!/usr/bin/env node
// Controller V2 — apply and verify the two remaining production migrations.
//
//   supabase/migrations/20260813_c8_event_outbox.sql        (C8 Event Bus)
//   supabase/migrations/20260814_c11_session_security.sql   (C11 Session Security)
//
// Both files are read VERBATIM from disk. Nothing is reconstructed, nothing is
// edited to make it pass, and no statement outside those two files is ever
// executed in --apply mode.
//
// ── SAFETY ──────────────────────────────────────────────────────────────────
// This is the mirror image of the C11 probe's guard. The probe refuses to touch
// production; this refuses to touch anything ELSE. If the target is not the
// production project it exits rather than guessing, because applying C11 to
// staging would be as wrong as applying it to the wrong customer's database.
//
// Each migration runs inside ONE transaction. PostgreSQL DDL is transactional,
// so a failure rolls the whole file back and leaves nothing half-applied — a
// partially applied security migration is worse than an unapplied one.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node scripts/migrations/apply-controller-v2-production.mjs            # verify only (READ-ONLY)
//   node scripts/migrations/apply-controller-v2-production.mjs --apply    # apply, then verify
//
// Credentials come from `.env.prod-admin` (gitignored by `.env*`), never from
// arguments and never from chat:
//
//   PROD_DATABASE_URL=postgresql://postgres:<password>@db.fwznnobrdctuskgrvuik.supabase.co:5432/postgres
//
// The default mode is READ-ONLY, so running it by accident cannot change
// anything.
//
// ── PROVENANCE (read this before trusting --apply) ──────────────────────────
// Only the VERIFY half of this script has ever run against production. It
// produced the catalog evidence recorded in docs/controller-v2/STATUS.md for
// C8 and C11 on 2026-08-15, and that is what it is kept for.
//
// --apply has NEVER been exercised. No route from this machine to the
// production database exists: db.<ref>.supabase.co answered 28P01 on three
// attempts with a password known to be correct, and the aws-0-* poolers
// reported tenant-not-found in six regions. Both migrations were applied
// through the Supabase dashboard SQL Editor instead.
//
// Re-running --apply is nonetheless safe rather than merely untested: both
// files are idempotent (C8 is CREATE TABLE/INDEX IF NOT EXISTS, C11 is
// CREATE OR REPLACE FUNCTION throughout) and each runs in one transaction.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PRODUCTION_REF = 'fwznnobrdctuskgrvuik'
const STAGING_REF = 'nhncoqyadofojjrnpiia'
const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')

const env = { ...process.env }
if (existsSync('.env.prod-admin')) {
  for (const line of readFileSync('.env.prod-admin', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
}

const DB_URL = env.PROD_DATABASE_URL
if (!DB_URL) {
  console.error('Missing PROD_DATABASE_URL. Put it in .env.prod-admin — see the header of this file.')
  process.exit(2)
}
if (DB_URL.includes(STAGING_REF)) {
  console.error(`REFUSING: PROD_DATABASE_URL points at STAGING (${STAGING_REF}).`)
  process.exit(3)
}
if (!DB_URL.includes(PRODUCTION_REF)) {
  console.error('REFUSING: PROD_DATABASE_URL does not name the production project.')
  console.error('This script applies security migrations; it will not guess which database that means.')
  process.exit(3)
}

// Parse by field. A generated password routinely contains URI-reserved
// characters, and connectionString parsing splits on them — the password then
// arrives truncated and the server answers 28P01, which reads exactly like a
// wrong password. (Learned the hard way against staging.)
const m = /^postgres(?:ql)?:\/\/([^:@/]+):(.*)@([^@/]+)\/(.+?)(?:\?.*)?$/.exec(DB_URL.trim())
if (!m) { console.error('PROD_DATABASE_URL is not a recognisable postgres URI.'); process.exit(2) }
const [, user, rawPassword, hostPort, database] = m
const [host, port = '5432'] = hostPort.split(':')
const password = /%[0-9A-Fa-f]{2}/.test(rawPassword) ? decodeURIComponent(rawPassword) : rawPassword

// An unsubstituted template is not a password. Without this the script would
// connect, collect 28P01, and report "the password is not accepted" — which
// sends someone off to reset a database password that was never wrong.
// The Vietnamese placeholder is here because it is the one that actually
// happened; the instruction text and the guard must know the same words.
// Compared with diacritics stripped and Unicode normalised: "MẬT_KHẨU" exists
// in both precomposed and combining forms, and a literal regex matches only the
// form it was typed in. That mismatch is why this guard failed the first time.
const flattened = password
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')          // combining diacritics, by codepoint
  .replace(/[^A-Za-z0-9_<>[\]-]/g, '')
  .toUpperCase()
const PLACEHOLDERS = ['[YOUR-PASSWORD]', 'MAT_KHAU', 'MATKHAU', 'PASSWORD', 'YOUR-PASSWORD', 'YOUR_PASSWORD']
if (PLACEHOLDERS.includes(flattened) || /^<.+>$/.test(password)) {
  console.error('REFUSING: PROD_DATABASE_URL still carries the template text in the password slot.')
  console.error('Replace it with the real database password from Supabase -> Settings -> Database.')
  process.exit(2)
}

const { default: pg } = await import('pg')
const db = new pg.Client({
  user, password, host, port: Number(port), database,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000,
})

console.log(`target: ${host}  (production ref confirmed)`)
console.log(`mode:   ${APPLY ? 'APPLY then verify' : 'VERIFY ONLY (read-only)'}\n`)

try {
  await db.connect()
} catch (e) {
  console.error(`could not connect — ${e.code ?? ''} ${e.message}`)
  if (e.code === '28P01') console.error('The password in PROD_DATABASE_URL is not accepted.')
  process.exit(4)
}

const MIGRATIONS = [
  { id: 'C8', file: 'supabase/migrations/20260813_c8_event_outbox.sql' },
  { id: 'C11', file: 'supabase/migrations/20260814_c11_session_security.sql' },
]

// ── APPLY ───────────────────────────────────────────────────────────────────
if (APPLY) {
  for (const mig of MIGRATIONS) {
    const sql = readFileSync(join(ROOT, mig.file), 'utf8')
    console.log(`── applying ${mig.id}: ${mig.file} (${sql.length} bytes, verbatim)`)
    try {
      await db.query('BEGIN')
      await db.query(sql)
      await db.query('COMMIT')
      console.log(`   ${mig.id}: applied and committed\n`)
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      console.error(`   ${mig.id}: FAILED — ${e.code ?? ''} ${e.message}`)
      console.error('   Rolled back; nothing from this file was applied.')
      if (e.code === '42703') {
        console.error('   42703 is the C11 schema guard: Supabase Auth changed a column C11 reads.')
        console.error('   Do NOT edit the migration. Report the message and consult ADR-021.')
      }
      await db.end()
      process.exit(5)
    }
  }
}

// ── VERIFY (read-only from here down) ───────────────────────────────────────
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const show = (label, rows) => {
  console.log(`\n── ${label}`)
  for (const r of rows) console.log('   ' + JSON.stringify(r))
}

show('objects', await q(`
  SELECT 'table' AS kind, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='event_outbox'
  UNION ALL
  SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (p.proname LIKE 'fn_outbox%' OR p.proname LIKE 'fn_session%')
   ORDER BY 1,2`))

show('SECURITY DEFINER + search_path', await q(`
  SELECT proname, prosecdef, proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (proname LIKE 'fn_outbox%' OR proname LIKE 'fn_session%') ORDER BY proname`))

show('EXECUTE reachability — fn_outbox_publish MUST be absent for all three', await q(`
  SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated','service_role']) AS rolname) r
   WHERE n.nspname='public' AND (p.proname LIKE 'fn_outbox%' OR p.proname LIKE 'fn_session%')
     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
   ORDER BY p.proname, r.rolname`))

show('event_outbox table grants', await q(`
  SELECT grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='event_outbox' ORDER BY grantee, privilege_type`))

show('event_outbox constraints', await q(`
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid='public.event_outbox'::regclass ORDER BY conname`))

show('event_outbox indexes', await q(`
  SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='event_outbox' ORDER BY indexname`))

show('RLS', await q(`
  SELECT c.relrowsecurity AS rls_enabled, (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='event_outbox'`))

show('C8 function bodies carry the ratified semantics', await q(`
  SELECT proname,
         position('FOR UPDATE SKIP LOCKED' in prosrc) > 0 AS skip_locked,
         position('attempts + 1'           in prosrc) > 0 AS claim_time_attempts,
         position('attempts >= 3'          in prosrc) > 0 AS dlq_at_3,
         position('status = ''pending'''   in prosrc) > 0 AS pending_predicate,
         position('ON CONFLICT'            in prosrc) > 0 AS on_conflict
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND proname LIKE 'fn_outbox%' ORDER BY proname`))

show('C11 function bodies carry the ratified semantics', await q(`
  SELECT proname,
         position('is_anonymous = false'    in prosrc) > 0 AS anonymous_excluded,
         position('fn_is_platform_owner'    in prosrc) > 0 AS owner_protected,
         position('AT TIME ZONE'            in prosrc) > 0 AS naive_timestamp_converted,
         position('refresh_token'           in prosrc) > 0 AS PROJECTS_CREDENTIAL_MUST_BE_FALSE,
         position('user_agent'              in prosrc) > 0 AS reads_user_agent
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND proname LIKE 'fn_session%' ORDER BY proname`))

console.log('\nDone. No row of application data was read or written by this script.')
await db.end()
