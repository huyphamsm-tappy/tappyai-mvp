// UAT throwaway accounts on AUDIT only (UAT3, 2026-09-27).
//
//   node scripts/uat/throwaway-accounts.mjs create <n> <outFile>   create n users uat.p0.<ts>.<i>@example.test,
//                                                                   confirmed, adult DOB set through PATCH /api/profile
//                                                                   on :3007 (the app's own path); writes their
//                                                                   email/password/id to <outFile> (keep it OUT of the repo)
//   node scripts/uat/throwaway-accounts.mjs delete <outFile>       delete every user listed in <outFile> (ignores ones
//                                                                   already deleted by the UAT itself) and removes their
//                                                                   queued account_deletion_jobs rows
//
// Refuses unless .env.local points at the audit project. Never touches an existing account (R11):
// it only deletes ids it created and recorded itself.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
if (!(env.NEXT_PUBLIC_SUPABASE_URL || '').includes(AUDIT_REF)) { console.error('REFUSING: not the audit project'); process.exit(2) }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const BASE = process.env.UAT_BASE_URL || 'http://localhost:3007'
const [cmd, a1, a2] = process.argv.slice(2)

if (cmd === 'create') {
  const n = Number(a1 || 1), out = a2
  if (!out) { console.error('outFile required'); process.exit(2) }
  const ts = Date.now()
  const users = []
  for (let i = 1; i <= n; i++) {
    const email = `uat.p0.${ts}.${i}@example.test`
    const password = randomBytes(15).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `UAT P0 ${i}` } })
    if (error) { console.error('createUser failed:', error.message); process.exit(1) }
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const s = await anon.auth.signInWithPassword({ email, password })
    if (s.error) { console.error('sign-in failed:', s.error.message); process.exit(1) }
    const r = await fetch(`${BASE}/api/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.data.session.access_token}` }, body: JSON.stringify({ dateOfBirth: '1990-01-15' }) })
    users.push({ id: data.user.id, email, password, dob: r.status })
  }
  writeFileSync(out, JSON.stringify(users, null, 1))
  console.log(JSON.stringify(users.map(u => ({ id: u.id, email: u.email, dobStatus: u.dob }))))
} else if (cmd === 'delete') {
  const users = JSON.parse(readFileSync(a1, 'utf8'))
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id)
    await admin.from('account_deletion_jobs').delete().eq('user_id', u.id)
    console.log(u.email, error ? `delete: ${error.message}` : 'deleted')
  }
} else {
  console.error('usage: create <n> <outFile> | delete <outFile>'); process.exit(2)
}
