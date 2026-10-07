// Minimal Supabase REST/Auth helpers for the AUDIT project. Service-role calls are for seeding only.
// Nothing here ever prints a key, a password or a token.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { env } from './env.mjs'

const ACCOUNTS_FILE = process.env.UAT_ACCOUNTS_FILE || 'D:/TappyAI-backups/uat-test-accounts.txt'

const svc = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

async function call(method, path, body, headers = svc) {
  const res = await fetch(env.SUPABASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} → ${res.status} ${typeof json === 'object' ? (json?.message || json?.msg || json?.error || '') : ''}`)
  return json
}

export const rest = {
  get: (q) => call('GET', '/rest/v1/' + q),
  insert: (table, rows) => call('POST', `/rest/v1/${table}`, rows, { ...svc, Prefer: 'return=representation' }),
  upsert: (table, rows, onConflict) => call('POST', `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, rows, { ...svc, Prefer: 'return=representation,resolution=merge-duplicates' }),
  patch: (q, body) => call('PATCH', '/rest/v1/' + q, body, { ...svc, Prefer: 'return=representation' }),
  del: (q) => call('DELETE', '/rest/v1/' + q),
}

/** email → { id, password } — kept OUTSIDE the repo, one line per account: email<TAB>id<TAB>password */
export function readAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return {}
  const out = {}
  for (const line of fs.readFileSync(ACCOUNTS_FILE, 'utf8').split(/\r?\n/)) {
    const [email, id, password] = line.split('\t')
    if (email && id && password) out[email] = { id, password }
  }
  return out
}

function writeAccounts(map) {
  const lines = ['# TappyAI UAT e2e test accounts — AUDIT project zdaprdfgpbpnxyofagmc only. Never commit.']
  for (const [email, a] of Object.entries(map)) lines.push(`${email}\t${a.id}\t${a.password}`)
  fs.writeFileSync(ACCOUNTS_FILE, lines.join('\n') + '\n')
}

/** Creates the account once (confirmed email, random password) and remembers it; later runs reuse it. */
export async function ensureUser(email, fullName) {
  const accounts = readAccounts()
  if (accounts[email]) return { email, ...accounts[email] }
  const password = crypto.randomBytes(18).toString('base64url')
  const user = await call('POST', '/auth/v1/admin/users', {
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  })
  accounts[email] = { id: user.id, password }
  writeAccounts(accounts)
  return { email, id: user.id, password }
}

/** A real session for the account (password grant, done here in code — no UI ever sees the password). */
export async function sessionFor(email) {
  const a = readAccounts()[email]
  if (!a) throw new Error(`no seeded account ${email} — run e2e seed first`)
  return call('POST', '/auth/v1/token?grant_type=password', { email, password: a.password }, {
    apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json',
  })
}
