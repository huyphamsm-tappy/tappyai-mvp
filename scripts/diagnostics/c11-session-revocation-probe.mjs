#!/usr/bin/env node
// C11 — the O-1 / O-2 / O-3 probe.
//
// Answers the one question that decides what Component 11 is:
//
//   Does revoking a session invalidate an access token that has NOT yet expired?
//
//   401/403 → revocation is IMMEDIATE. C11 reuses the auth.getUser() round-trip
//             the app already performs on every authenticated request, and adds
//             no per-request database lookup.
//   200     → revocation is EVENTUAL, bounded by the access-token TTL. C11 must
//             then add real enforcement to the hot path of every authenticated
//             request — a materially larger component.
//
// REFUSES TO RUN AGAINST PRODUCTION. It creates and destroys a real session, so
// it must only ever touch a throwaway project or a local `supabase start` stack.
//
// Usage, from the repository root (it needs @supabase/supabase-js):
//
//   node scripts/diagnostics/c11-session-revocation-probe.mjs
//
// Configuration — put these in `.env.staging` (gitignored) or the environment.
// NEVER paste service-role keys into a chat, an issue or a commit:
//
//   STAGING_SUPABASE_URL=...
//   STAGING_SUPABASE_ANON_KEY=...
//   STAGING_SUPABASE_SERVICE_ROLE_KEY=...
//   STAGING_DATABASE_URL=...        # optional; enables the O-3 schema probe
//                                   # (local stack: postgresql://postgres:postgres@127.0.0.1:54322/postgres)

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'fwznnobrdctuskgrvuik'   // the live project — never probe it

const env = { ...process.env }
if (existsSync('.env.staging')) {
  for (const line of readFileSync('.env.staging', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
  }
}

const URL_ = env.STAGING_SUPABASE_URL
const ANON = env.STAGING_SUPABASE_ANON_KEY
const SERVICE = env.STAGING_SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !ANON || !SERVICE) {
  console.error('Missing STAGING_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY.')
  console.error('See the header of this file. Do not point it at production.')
  process.exit(2)
}

// The guard is the point of this script being committed rather than improvised.
if (URL_.includes(PRODUCTION_REF)) {
  console.error(`REFUSING: ${URL_} is the PRODUCTION project.`)
  console.error('This probe creates and revokes a real session. Use a throwaway project or `supabase start`.')
  process.exit(3)
}

console.log(`target: ${new URL(URL_).host}  (production ref absent — proceeding)\n`)

const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

// `--cleanup-only` sweeps identities a crashed run may have stranded. Staging
// must not accumulate probe users, and "probably fine" is not a check.
if (process.argv.includes('--cleanup-only')) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) { console.error('listUsers failed:', error.message); process.exit(1) }
  const stale = data.users.filter((u) => (u.email ?? '').startsWith('c11-probe-'))
  console.log(`probe identities found: ${stale.length}`)
  for (const u of stale) {
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
    console.log(`  ${u.email}: ${delErr ? `FAILED — ${delErr.message}` : 'deleted'}`)
  }
  process.exit(0)
}

// ── Establish a throwaway session ───────────────────────────────────────────
// Anonymous sign-in keeps the blast radius at zero: no password, no mailbox, no
// real identity. If the project has anonymous sign-ins disabled, set
// STAGING_TEST_EMAIL / STAGING_TEST_PASSWORD and it will use those instead.
let session
let disposableUserId = null   // deleted in cleanup() if this probe created it

if (env.STAGING_TEST_EMAIL && env.STAGING_TEST_PASSWORD) {
  const { data, error } = await anon.auth.signInWithPassword({
    email: env.STAGING_TEST_EMAIL, password: env.STAGING_TEST_PASSWORD,
  })
  if (error) { console.error('sign-in failed:', error.message); process.exit(1) }
  session = data.session
} else {
  const { data, error } = await anon.auth.signInAnonymously()
  if (error) {
    // Anonymous sign-ins are commonly disabled. Rather than stopping, mint a
    // disposable identity through the admin API and delete it at the end. It
    // exists only inside this staging project, for the length of this run.
    console.log(`anonymous sign-in unavailable (${error.message}) — creating a disposable identity instead`)
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`
    const email = `c11-probe-${stamp}@example.com`
    const password = `Pw-${stamp}-${Math.random().toString(36).slice(2)}`

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createErr) {
      console.error('could not create a disposable identity:', createErr.message)
      console.error('Either enable anonymous sign-ins, or set STAGING_TEST_EMAIL/_PASSWORD.')
      process.exit(1)
    }
    disposableUserId = created.user.id
    console.log(`disposable identity created: ${email}`)

    const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password })
    if (signInErr) {
      console.error('disposable sign-in failed:', signInErr.message)
      await admin.auth.admin.deleteUser(disposableUserId).catch(() => {})
      process.exit(1)
    }
    session = signedIn.session
  } else {
    session = data.session
  }
}

/** Remove the disposable identity. Staging must not accumulate probe users. */
async function cleanup() {
  if (!disposableUserId) return
  const { error } = await admin.auth.admin.deleteUser(disposableUserId)
  console.log(`\ndisposable identity deleted: ${error ? `FAILED — ${error.message}` : 'ok'}`)
  disposableUserId = null
}

// A crash anywhere below must not strand the identity in staging. `finally` is
// not enough on its own: an unhandled rejection kills the process before any
// trailing statement runs, which is exactly what happened on the first O-3 run.
process.on('unhandledRejection', async (err) => {
  console.error(`\nunhandled: ${err?.message ?? err}`)
  await cleanup()
  process.exit(1)
})

const token = session.access_token
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
const ttlSeconds = claims.exp - claims.iat
console.log(`session_id claim present: ${Boolean(claims.session_id)}`)
console.log(`O-2 · access-token TTL: ${ttlSeconds}s (${(ttlSeconds / 60).toFixed(0)} min)  [iat→exp, from the token itself]`)
console.log(`seconds remaining at probe time: ${claims.exp - Math.floor(Date.now() / 1000)}\n`)

const probe = async (label) => {
  const res = await fetch(`${URL_}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const body = await res.text()
  console.log(`${label}: HTTP ${res.status}  ${res.ok ? '(accepted)' : body.slice(0, 160)}`)
  return res.status
}

const before = await probe('getUser BEFORE revocation')
if (before !== 200) {
  console.error('\nThe token was not accepted even before revocation — the probe proves nothing. Stopping.')
  await cleanup()
  process.exit(1)
}

// ── Revoke, then immediately re-probe the SAME unexpired token ──────────────
const { error: revokeErr } = await admin.auth.admin.signOut(token, 'global')
console.log(`\nadmin.signOut(scope=global): ${revokeErr ? `ERROR ${revokeErr.message}` : 'ok'}`)
if (revokeErr) { console.error('Revocation failed; O-1 is unanswered.'); await cleanup(); process.exit(1) }

const after = await probe('getUser AFTER revocation ')

console.log('\n───────────────────────────────────────────────')
if (after === 200) {
  console.log('O-1 = EVENTUAL. The access token outlived its session.')
  console.log(`     The revocation guarantee is therefore the TTL: ${ttlSeconds}s.`)
  console.log('     C11 must add real request-time enforcement; §5.2 of the contract must be rewritten.')
} else {
  console.log(`O-1 = IMMEDIATE. GoTrue rejected the unexpired token (HTTP ${after}).`)
  console.log('     C11 reuses the existing auth.getUser() round-trip; no per-request DB lookup.')
  console.log('     O-2 closes as "TTL is not the revocation guarantee".')
}
console.log('───────────────────────────────────────────────')

// ── O-3: is auth.sessions readable, and what does it actually contain? ──────
// An unsubstituted placeholder is "not configured", not a connection string.
// Without this check the probe tries to authenticate as the literal password
// and reports an auth failure, which reads like a wrong password rather than a
// step that was never completed.
const DB_URL = env.STAGING_DATABASE_URL
const dbPlaceholder = !DB_URL || /\[YOUR-PASSWORD\]|<.*password.*>/i.test(DB_URL)

if (dbPlaceholder) {
  console.log('\nO-3: SKIPPED — STAGING_DATABASE_URL is absent or still carries the')
  console.log('     [YOUR-PASSWORD] placeholder. O-1 and O-2 above are unaffected.')
  await cleanup()
  process.exit(0)
}

const { default: pg } = await import('pg')
const db = new pg.Client({ connectionString: DB_URL })
try {
  await db.connect()
} catch (e) {
  console.error(`\nO-3: could not connect — ${e.code ?? ''} ${e.message}`)
  if (e.code === '28P01') {
    console.error('     The password in STAGING_DATABASE_URL is not accepted. Reset it at')
    console.error('     Supabase -> Settings -> Database -> Database password, then update the file.')
  }
  await cleanup()
  process.exit(4)
}

const cols = await db.query(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='auth' AND table_name='sessions' ORDER BY ordinal_position`
)
console.log(`\nO-3 · auth.sessions columns (${cols.rowCount}):`)
for (const c of cols.rows) console.log(`   ${c.column_name.padEnd(22)} ${c.data_type}${c.is_nullable === 'YES' ? ' NULL' : ''}`)

const reach = await db.query(
  `SELECT r.rolname, has_table_privilege(r.rolname, 'auth.sessions', 'SELECT') AS can_select
     FROM (SELECT unnest(ARRAY['anon','authenticated','service_role']) AS rolname) r`
)
console.log('\nO-3 · direct reachability (all three MUST be false — a definer function is the only path):')
for (const r of reach.rows) console.log(`   ${r.rolname.padEnd(16)} SELECT=${r.can_select}`)

const tokens = cols.rows.filter((c) => /token|secret|password/i.test(c.column_name))
console.log(`\nO-3 · credential-bearing columns that a C11 projection must never select: ${tokens.length ? tokens.map((c) => c.column_name).join(', ') : 'none'}`)

await db.end()

await cleanup()
