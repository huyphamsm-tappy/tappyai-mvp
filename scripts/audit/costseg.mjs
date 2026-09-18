// Per-turn cost of ONE segment of the audit usage sink (segments are separated by "--- <label> start"
// marker lines). usage: node costseg.mjs <sink.jsonl> <label> [--md]
// Prices: Haiku 4.5 $1/M in, $1.25/M cache write, $0.10/M cache read, $5/M out; Serper $0.001/credit.
// Memory extraction is MEASURED from the tappyai_usage_memory lines (no more estimate).
import { readFileSync } from 'node:fs'
const [file, label, ...rest] = process.argv.slice(2)
const md = rest.includes('--md')
const P = { in: 1 / 1e6, write: 1.25 / 1e6, read: 0.1 / 1e6, out: 5 / 1e6, serper: 0.001 }
const lines = readFileSync(file, 'utf8').split('\n')
let on = label === 'all'; const seg = []
for (const l of lines) {
  if (l.startsWith('--- ')) { on = l.startsWith(`--- ${label} start`); continue }
  if (on && l.startsWith('{')) { try { seg.push(JSON.parse(l)) } catch { /* skip */ } }
}
const usage = seg.filter(j => j.type === 'tappyai_usage' || j.type === 'tappyai_usage_canned')
const mem = new Map()
for (const j of seg) if (j.type === 'tappyai_usage_memory') mem.set(j.turn, j)
const rows = usage.map(j => {
  const m = mem.get(j.turn)
  const llm = (j.promptTokens ?? 0) * P.in + (j.cacheCreationTokens ?? 0) * P.write + (j.cacheReadTokens ?? 0) * P.read + (j.completionTokens ?? 0) * P.out
  const serper = (j.serper?.credits ?? 0) * P.serper
  const memory = m ? m.promptTokens * P.in + m.completionTokens * P.out : 0
  const total = j.promptTokens + (j.cacheReadTokens ?? 0) + (j.cacheCreationTokens ?? 0)
  const hit = total > 0 ? (j.cacheReadTokens ?? 0) / total : 0
  return { turn: j.turn, canned: j.type === 'tappyai_usage_canned', tools: j.toolCalls ?? 0, llmCalls: j.llmCalls ?? 0, uncached: j.promptTokens ?? 0, write: j.cacheCreationTokens ?? 0, read: j.cacheReadTokens ?? 0, out: j.completionTokens ?? 0, hit, credits: j.serper?.credits ?? 0, llm, serper, memory, memCall: !!m, cost: llm + serper + memory, ms: j.elapsedMs }
})
const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0)
const avg = (k, rs = rows) => rs.length ? rs.reduce((a, r) => a + (r[k] ?? 0), 0) / rs.length : 0
const toolTurns = rows.filter(r => r.tools > 0 || (r.credits > 0))
const noTool = rows.filter(r => !r.canned && r.tools === 0 && r.credits === 0)
const canned = rows.filter(r => r.canned)
const fmt = (n) => '$' + n.toFixed(4)
if (md) {
  console.log(`| turn | LLM calls | uncached in | cache write | cache read | out | hit | Serper credits | LLM $ | Serper $ | memory $ | total $ |`)
  console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|`)
  for (const r of rows) console.log(`| ${r.turn}${r.canned ? ' (canned)' : ''} | ${r.llmCalls} | ${r.uncached} | ${r.write} | ${r.read} | ${r.out} | ${Math.round(r.hit * 100)}% | ${r.credits} | ${fmt(r.llm)} | ${fmt(r.serper)} | ${r.memCall ? fmt(r.memory) : '—'} | ${fmt(r.cost)} |`)
}
console.log(JSON.stringify({
  label, turns: rows.length, toolTurns: toolTurns.length, noToolTurns: noTool.length, cannedTurns: canned.length,
  memoryCalls: rows.filter(r => r.memCall).length,
  avgCost: avg('cost'), avgLlm: avg('llm'), avgSerper: avg('serper'), avgMemory: avg('memory'),
  avgToolTurn: avg('cost', toolTurns), avgNoToolTurn: avg('cost', noTool),
  totalCost: sum('cost'), totalCredits: sum('credits'),
  hitRate: sum('read') / (sum('read') + sum('write') + sum('uncached')),
  avgUncachedToolTurn: avg('uncached', toolTurns), avgOut: avg('out'),
  memoryAvgPromptTokens: rows.filter(r => r.memCall).length ? [...mem.values()].reduce((a, m) => a + m.promptTokens, 0) / mem.size : 0,
  memoryAvgCompletionTokens: mem.size ? [...mem.values()].reduce((a, m) => a + m.completionTokens, 0) / mem.size : 0,
}, null, 1))
