// Clears the AUDIT user's memory rows in the NON-PROD project via its own PostgREST.
// Refuses anything that is not the confirmed non-prod ref. Prints counts only.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local', 'utf8')
  .split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const PROD_REF = 'fwznnobrdctuskgrvuik'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const ref = url.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1]
if (!ref || ref === PROD_REF || ref !== env.AUDIT_CONFIRMED_NONPROD_REF) throw new Error('refusing: not the confirmed non-prod ref')
const key = env.SUPABASE_SERVICE_ROLE_KEY
const uid = env.AUDIT_TEST_USER_ID
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const count = async (table, col) => {
  const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${uid}&select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return r.headers.get('content-range')?.split('/')[1] ?? `http ${r.status}`
}
const del = async (table, col) => {
  const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${uid}`, { method: 'DELETE', headers: H })
  return r.status
}
console.log('ref', ref, '| user_memory before', await count('user_memory', 'user_id'), '| decision_evidence before', await count('decision_evidence', 'owner_id'))
console.log('delete user_memory →', await del('user_memory', 'user_id'), '| delete decision_evidence →', await del('decision_evidence', 'owner_id'))
console.log('user_memory after', await count('user_memory', 'user_id'), '| decision_evidence after', await count('decision_evidence', 'owner_id'))
