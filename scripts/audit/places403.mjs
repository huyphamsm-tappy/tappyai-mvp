// Measures the audit env's Google Places (New) searchText call: status, error status/message and
// wall time, N times. Reads the key from the audit worktree's .env.local; never prints it.
import { readFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const env = Object.fromEntries(readFileSync(W + '/.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
if ((env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('fwznnobrdctuskgrvuik')) throw new Error('prod')
const key = env.GOOGLE_PLACES_API_KEY
console.log('key present:', !!key, 'length:', key?.length ?? 0, 'prefix:', key ? key.slice(0, 4) + '…' : '-')
const n = Number(process.argv[2] ?? 3)
for (let i = 0; i < n; i++) {
  const t0 = Date.now()
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key ?? '', 'X-Goog-FieldMask': 'places.id,places.displayName' },
    body: JSON.stringify({ textQuery: 'quán ăn Quận 1', languageCode: 'vi', maxResultCount: 5 }),
  })
  const ms = Date.now() - t0
  const j = await r.json().catch(() => ({}))
  console.log(JSON.stringify({ run: i + 1, http: r.status, ms, status: j.error?.status ?? null, message: j.error?.message ?? null, reason: j.error?.details?.[0]?.reason ?? null, places: j.places?.length ?? 0 }))
}
