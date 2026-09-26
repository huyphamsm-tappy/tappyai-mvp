// Re-mint the audit user's bearer from the stored credentials (new project only). Never prints it.
import { readFileSync, writeFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const PROD_REF = 'fwznnobrdctuskgrvuik'
const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const env = parse(W + '/.env.local')
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
if (URL_.includes(PROD_REF)) throw new Error('prod')
const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.AUDIT_TEST_USER_EMAIL, password: env.AUDIT_TEST_USER_PASSWORD }) })
const j = await r.json()
if (!r.ok || !j.access_token) throw new Error('token ' + r.status)
const c = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64url').toString())
if (c.iss !== `${URL_}/auth/v1`) throw new Error('issuer mismatch')
let txt = readFileSync(W + '/.env.local', 'utf8')
txt = txt.replace(/^AUDIT_TEST_USER_BEARER=.*$/m, 'AUDIT_TEST_USER_BEARER=' + j.access_token).replace(/^AUDIT_TEST_USER_REFRESH=.*$/m, 'AUDIT_TEST_USER_REFRESH=' + (j.refresh_token ?? ''))
writeFileSync(W + '/.env.local', txt)
console.log('bearer re-minted: iss=' + c.iss, 'role=' + c.role, 'expires=' + new Date(c.exp * 1000).toISOString())
