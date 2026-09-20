// E2/E3 runner — the answer-unit eval on the audit server (:3101), authed as the audit user
// (bearer from the audit .env.local; never printed). One id = one /api/chat turn = one model call
// (a canned clarify costs none). Follow-ups replay their parent's thread + decision evidence id.
//   usage: node evalUnits.mjs <ids...|all|single|multi> [--out dir] [--noloc] [--surface android]
// Writes <out>/<id>.json with prose, tool rows (raw), 8: frames (raw), guard logs are the server's.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { QUERIES, ORDER, SINGLE, MULTI } from './evalUnits.queries.mjs'

const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const PROD_REF = 'fwznnobrdctuskgrvuik'
const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()] }))
const env = parse(W + '/.env.local')
if (env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF)) throw new Error('prod')
const BASE = 'http://localhost:3101'
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1] }
const OUT = opt('--out', 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard/docs/audit/eval/units')
const withLoc = !args.includes('--noloc')
const surface = opt('--surface', 'web')
mkdirSync(OUT, { recursive: true })

const named = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--surface')
const ids = named.includes('all') ? ORDER : named.includes('single') ? SINGLE : named.includes('multi') ? MULTI : named.filter(a => QUERIES[a])
const HCMC = { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }

async function turn(id) {
  const q = QUERIES[id]
  const messages = []
  let evidenceId
  if (q.parent) {
    const p = JSON.parse(readFileSync(`${OUT}/${q.parent}.json`, 'utf8'))
    for (const m of p.thread) messages.push(m)
    evidenceId = p.evidenceId
  }
  messages.push({ role: 'user', content: q.text })
  const body = { messages, ...(withLoc ? { userLocation: HCMC } : {}), ...(evidenceId ? { decisionEvidenceId: evidenceId } : {}) }
  const t0 = Date.now()
  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tappy-surface': surface, 'accept-language': 'vi', 'x-audit-turn': id, Authorization: 'Bearer ' + env.AUDIT_TEST_USER_BEARER },
    body: JSON.stringify(body),
  })
  const ttfb = Date.now() - t0
  const status = res.status
  const eid = res.headers.get('x-decision-evidence-id')
  const raw = await res.text()
  const ms = Date.now() - t0
  let prose = ''
  const frames8 = []; const toolResults = []; const toolCalls = []; const other = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('0:')) { try { prose += JSON.parse(line.slice(2)) } catch { prose += '<bad0>' } }
    else if (line.startsWith('8:')) { try { frames8.push(JSON.parse(line.slice(2))) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('a:')) { try { toolResults.push(JSON.parse(line.slice(2))) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('9:')) { try { toolCalls.push(JSON.parse(line.slice(2))) } catch { other.push(line.slice(0, 200)) } }
    else if (line.startsWith('3:')) other.push(line.slice(0, 300))
  }
  const record = {
    id, text: q.text, vertical: q.vertical, unit: q.unit, parent: q.parent ?? null, surface, status, ttfb, ms,
    evidenceId: eid ?? evidenceId ?? null,
    toolCalls: toolCalls.map(c => ({ tool: c.toolName, args: c.args })),
    toolResults: toolResults.map(r => r.result),
    frames8,
    prose, other,
    thread: [...messages, { role: 'assistant', content: prose }],
    at: new Date().toISOString(),
  }
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(record, null, 2))
  const rows = toolResults.reduce((n, r) => n + ((r.result?.results ?? r.result?.search_results ?? r.result?.shopping_results ?? []).length || 0), 0)
  console.log(`${id} ${status} ttfb=${ttfb}ms total=${ms}ms tools=${toolCalls.map(c => c.toolName).join(',') || '-'} rows=${rows} prose=${prose.length}ch`)
}

for (const id of ids) {
  try { await turn(id) } catch (e) { console.log(id, 'ERROR', String(e).slice(0, 200)) }
}
