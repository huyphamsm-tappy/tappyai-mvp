// A3.1 live proof — flip ONE commerce provider's runtime row on the AUDIT project (never production):
//   node scripts/audit/flipProvider.mjs <provider_id> active=false|true [deeplink_enabled=…] [tier=1|2] [note=…]
// Then prints the row. This is the owner's SQL `update public.commerce_providers …` as a script; the app
// picks the change up on the next request after its 60 s cache turns over — no restart, no code edit.
import { readFileSync } from 'node:fs'

const PROD_REF = 'fwznnobrdctuskgrvuik'
const ENV = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod/.env.local'
const [providerId, ...sets] = process.argv.slice(2)
if (!providerId || sets.length === 0) throw new Error('usage: flipProvider.mjs <provider_id> key=value …')
const env = Object.fromEntries(readFileSync(ENV, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const url = env.NEXT_PUBLIC_SUPABASE_URL || ''
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref || ref === PROD_REF || ref !== env.AUDIT_CONFIRMED_NONPROD_REF) throw new Error('refusing: not the confirmed non-prod audit project')
const key = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const patch = {}
for (const s of sets) {
  const i = s.indexOf('='); const k = s.slice(0, i); const v = s.slice(i + 1)
  patch[k] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v === 'null' ? null : v
}
const r = await fetch(`${url}/rest/v1/commerce_providers?provider_id=eq.${encodeURIComponent(providerId)}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(patch) })
const rows = await r.json()
console.log('http', r.status, Array.isArray(rows) ? rows.map(x => ({ provider_id: x.provider_id, active: x.active, deeplink_enabled: x.deeplink_enabled, tier: x.tier, network: x.network, updated_at: x.updated_at })) : rows)
