// Prints the AUDIT user's user_memory row (non-prod only). No secrets printed.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local', 'utf8')
  .split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const PROD_REF = 'fwznnobrdctuskgrvuik'
const url = env.NEXT_PUBLIC_SUPABASE_URL
const ref = url.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1]
if (!ref || ref === PROD_REF || ref !== env.AUDIT_CONFIRMED_NONPROD_REF) throw new Error('refusing: not the confirmed non-prod ref')
const key = env.SUPABASE_SERVICE_ROLE_KEY
const uid = env.AUDIT_TEST_USER_ID
const H = { apikey: key, Authorization: `Bearer ${key}` }
const r = await fetch(`${url}/rest/v1/user_memory?user_id=eq.${uid}&select=location_base,discovery_city,preferences,budget,history,companions,timing,personality,updated_at`, { headers: H })
console.log(JSON.stringify(await r.json(), null, 2))
