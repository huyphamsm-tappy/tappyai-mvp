// Latency breakdown of an agent-eval run (TAPPY_AGENT=2 run traces): where the time of a turn goes.
//   node scripts/agent-eval/latency.mjs <out/eval-…> [<out/eval-…> …] [--only RS-]
// Per turn: model time (sum of model rounds), search time (web_search tool time), page fetch time (page_read events),
// claims-call time (read_page tool time − its fetch time, M3 only), tool wall time per round (max of the round's tools — they run
// concurrently), orchestration (total − model − tool wall), plus rounds / tool calls / pages / cost.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const dirs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only')
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))] }
const rows = []
for (const d of dirs) {
  const res = JSON.parse(readFileSync(join(d, 'results.json'), 'utf8'))
  for (const r of res.rows) {
    if (r.mode !== 'agent2' || (only && !r.scenario.startsWith(only))) continue
    const raw = JSON.parse(readFileSync(join(d, 'raw', `${r.mode}-${r.scenario}-t${r.turn}.json`), 'utf8'))
    const t = raw.logEvents.find(e => e.type === 'tappyai_agent_run_trace')
    if (!t) continue
    const ev = t.events
    const model = ev.filter(e => e.kind === 'model_round').reduce((a, e) => a + (e.ms ?? 0), 0)
    const results = ev.filter(e => e.kind === 'tool_result')
    const search = results.filter(e => e.tool === 'web_search').reduce((a, e) => a + (e.ms ?? 0), 0)
    const readTool = results.filter(e => e.tool === 'read_page').reduce((a, e) => a + (e.ms ?? 0), 0)
    const fetch = ev.filter(e => e.kind === 'page_read' && typeof e.ms === 'number').reduce((a, e) => a + e.ms, 0)
    const extract = ev.filter(e => e.kind === 'page_read' && typeof e.extract_ms === 'number').reduce((a, e) => a + e.extract_ms, 0)
    const claims = Math.max(0, readTool - fetch - extract)
    const byRound = new Map()
    for (const e of results) byRound.set(e.round, Math.max(byRound.get(e.round) ?? 0, e.ms ?? 0))
    const toolWall = [...byRound.values()].reduce((a, b) => a + b, 0)
    const total = r.ms
    rows.push({ id: `${r.scenario}-t${r.turn}`, total, model, search, fetch, extract, claims, toolWall, orch: Math.max(0, total - model - toolWall), rounds: t.totals.modelRounds, tools: t.totals.toolCalls, pages: t.research?.page_reads ?? 0, usd: r.usd })
  }
}
const cols = ['total', 'model', 'search', 'fetch', 'extract', 'claims', 'toolWall', 'orch', 'rounds', 'tools', 'pages', 'usd']
console.log(`turns: ${rows.length}`)
console.log('| metric | p50 | p90 | max | mean |')
console.log('|---|---|---|---|---|')
for (const c of cols) {
  const xs = rows.map(r => r[c])
  const f = v => c === 'usd' ? v.toFixed(5) : ['rounds', 'tools', 'pages'].includes(c) ? (Math.round(v * 100) / 100).toString() : `${(v / 1000).toFixed(2)} s`
  console.log(`| ${c} | ${f(pct(xs, 50))} | ${f(pct(xs, 90))} | ${f(Math.max(...xs))} | ${f(xs.reduce((a, b) => a + b, 0) / xs.length)} |`)
}
if (args.includes('--rows')) for (const r of rows) console.log(JSON.stringify(r))
