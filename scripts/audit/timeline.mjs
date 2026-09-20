// A1 — the WIRE TIMELINE of one /api/chat turn on the audit server (:3101): the millisecond every
// frame kind first appears, read straight off the stream (no client smoothing). This is the
// instrument the before/after latency claims are made with. It sends ONE turn (one model call).
//   usage: node scripts/audit/timeline.mjs "<question>" [--anon] [--noloc] [--json]
// Bearer from the audit .env.local (never printed).
import { readFileSync } from 'node:fs'
const W = 'D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod'
const parse = f => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const env = parse(W + '/.env.local')
if ((env.NEXT_PUBLIC_SUPABASE_URL || '').includes('fwznnobrdctuskgrvuik')) throw new Error('prod')
const [q, ...flags] = process.argv.slice(2)
const anon = flags.includes('--anon'); const noloc = flags.includes('--noloc'); const asJson = flags.includes('--json')
const headers = { 'content-type': 'application/json', 'x-tappy-surface': anon ? 'android' : 'web', 'accept-language': 'vi', ...(anon ? { 'x-tappy-age-declared': '18plus' } : { Authorization: 'Bearer ' + env.AUDIT_TEST_USER_BEARER }) }
const loc = noloc ? {} : { userLocation: anon ? { lat: 10.7769, lng: 106.7009 } : { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } }
const t0 = Date.now()
const res = await fetch('http://localhost:3101/api/chat', { method: 'POST', headers, body: JSON.stringify({ messages: [{ role: 'user', content: q }], ...loc }) })
const ttfb = Date.now() - t0
const marks = {}
const mark = (k) => { if (!(k in marks)) marks[k] = Date.now() - t0 }
let prose = ''; let buf = ''; let progress = []; let places = []
const reader = res.body.getReader(); const dec = new TextDecoder()
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  const lines = buf.split('\n'); buf = lines.pop() ?? ''
  for (const line of lines) {
    if (line.startsWith('9:')) { mark('tool_call'); continue }
    if (line.startsWith('a:')) { mark('tool_result'); continue }
    if (line.startsWith('0:')) { try { const d = JSON.parse(line.slice(2)); if (d.trim()) mark('first_text'); prose += d } catch { /* skip */ } continue }
    if (line.startsWith('8:')) {
      try {
        for (const a of JSON.parse(line.slice(2))) {
          if (a?.kind === 'tappy.progress.v1') { mark('progress_' + a.stage); progress.push({ t: Date.now() - t0, stage: a.stage, count: a.count, text: a.text }) }
          if (a?.kind === 'tappy.places.v1') { mark(a.preliminary ? 'cards_preliminary' : 'cards_final'); places.push({ t: Date.now() - t0, preliminary: !!a.preliminary, items: a.items?.length, card1: a.items?.[0]?.name, picked: a.picked?.length ?? 0 }) }
        }
      } catch { /* skip */ }
      continue
    }
    if (line.startsWith('d:')) mark('done')
  }
}
const total = Date.now() - t0
const out = { status: res.status, ttfb_ms: ttfb, total_ms: total, marks, progress, places, prose_chars: prose.length, prose_head: prose.slice(0, 160) }
if (asJson) console.log(JSON.stringify(out))
else {
  console.log(`status ${res.status} · TTFB ${ttfb} ms · total ${total} ms`)
  for (const [k, v] of Object.entries(marks).sort((a, b) => a[1] - b[1])) console.log(`  ${String(v).padStart(6)} ms  ${k}`)
  for (const p of progress) console.log(`  progress ${p.stage} @${p.t}: ${p.text}`)
  for (const p of places) console.log(`  cards ${p.preliminary ? 'PRELIM' : 'FINAL '} @${p.t}: ${p.items} items, #1 ${p.card1}, picked ${p.picked}`)
  console.log('  prose:', JSON.stringify(prose.slice(0, 160)))
}
