// P1 diagnosis (A.1) — the WEB-HARNESS shape of "broad query → canned clarify → answer", sent to a
// server running with AUDIT_MODEL_REQUEST_FILE + AUDIT_DRY_RUN=1 (0 model calls). Bearer from the
// audit .env.local (never printed). usage: node capweb.mjs "<broad query>" "<answer>" [--anon] [--noloc]
import { readFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const parse = f => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const env = parse(W + '/.env.local')
if (env.NEXT_PUBLIC_SUPABASE_URL.includes('fwznnobrdctuskgrvuik')) throw new Error('prod')
const [q, a, ...flags] = process.argv.slice(2)
const anon = flags.includes('--anon'); const noloc = flags.includes('--noloc')
const BASE = 'http://localhost:3101'
const headers = { 'content-type': 'application/json', 'x-tappy-surface': anon ? 'android' : 'web', 'accept-language': 'vi', ...(anon ? { 'x-tappy-age-declared': '18plus' } : { Authorization: 'Bearer ' + env.AUDIT_TEST_USER_BEARER }) }
const loc = noloc ? {} : { userLocation: anon ? { lat: 10.7769, lng: 106.7009 } : { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } }
async function post(messages) {
  const res = await fetch(BASE + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ messages, ...loc }) })
  const raw = await res.text()
  let prose = ''
  for (const line of raw.split('\n')) if (line.startsWith('0:')) { try { prose += JSON.parse(line.slice(2)) } catch { /* skip */ } }
  return { status: res.status, prose }
}
const t1 = await post([{ role: 'user', content: q }])
console.log('turn1', t1.status, JSON.stringify(t1.prose.slice(0, 120)))
const t2 = await post([{ role: 'user', content: q }, { role: 'assistant', content: t1.prose }, { role: 'user', content: a }])
console.log('turn2', t2.status, JSON.stringify(t2.prose.slice(0, 80)))
