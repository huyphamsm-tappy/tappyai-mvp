// UNIT COST MODEL (owner FINAL JOB 2.3) — from the usage sink, 0 extra runs.
// usage: node unitcost.mjs <sink.jsonl> <segment-label> [--md]
// Turn types: T1 clarify (server-authored, $0) · T2 search + answer (≥1 tool call) ·
// T3 follow-up served from the cached result set (server-authored carried fact, $0) ·
// T4 chat turn with no tool (LLM, 0 tool calls). Cold = the first prompt of a shape in the run
// (cache write ≥ 10k tokens); warm = cache write < 10k (the shared rulebook read from cache).
// Prices: Haiku 4.5 $1/M uncached in, $1.25/M cache write, $0.10/M cache read, $5/M out; Serper $0.001/credit.
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
const mem = new Map(); for (const j of seg) if (j.type === 'tappyai_usage_memory') mem.set(j.turn, j)
const CLARIFY_IDS = new Set(['F7', 'S5', 'S6', 'T5', 'P5', 'P7', 'E2', 'E5'])
const rows = usage.map(j => {
  const canned = j.type === 'tappyai_usage_canned'
  const tools = j.toolCalls ?? 0
  const kind = canned ? (CLARIFY_IDS.has(j.turn) ? 'T1' : 'T3') : tools > 0 ? 'T2' : 'T4'
  const m = mem.get(j.turn)
  const uncached = j.promptTokens ?? 0, write = j.cacheCreationTokens ?? 0, read = j.cacheReadTokens ?? 0, out = j.completionTokens ?? 0
  const llmUncached = uncached * P.in + out * P.out
  const llmCached = write * P.write + read * P.read
  const memory = m ? m.promptTokens * P.in + m.completionTokens * P.out : 0
  const credits = j.serper?.credits ?? 0
  return { turn: j.turn, kind, cold: write >= 10000, uncached, write, read, out, credits, llmUncached, llmCached, memory, serper: credits * P.serper, total: llmUncached + llmCached + memory + credits * P.serper }
})
const avg = (rs, k) => rs.length ? rs.reduce((a, r) => a + r[k], 0) / rs.length : 0
const fmt = n => '$' + n.toFixed(4)
const groups = {}
for (const r of rows) {
  for (const key of [`${r.kind}`, `${r.kind}:${r.cold ? 'cold' : 'warm'}`]) (groups[key] ??= []).push(r)
}
const summary = {}
for (const [k, rs] of Object.entries(groups)) {
  summary[k] = { n: rs.length, uncachedIn: Math.round(avg(rs, 'uncached')), cacheWrite: Math.round(avg(rs, 'write')), cacheRead: Math.round(avg(rs, 'read')), out: Math.round(avg(rs, 'out')), credits: +avg(rs, 'credits').toFixed(2), llmUncached: +avg(rs, 'llmUncached').toFixed(5), llmCached: +avg(rs, 'llmCached').toFixed(5), memory: +avg(rs, 'memory').toFixed(5), serper: +avg(rs, 'serper').toFixed(5), total: +avg(rs, 'total').toFixed(5) }
}
// warm projection for a cold turn: the cache-write tokens would be cache reads (0.1× instead of 1.25×)
const warmOf = r => r.total - r.write * P.write + r.write * P.read
for (const k of ['T2', 'T4']) if (groups[k]) summary[`${k}:warm-projected`] = { n: groups[k].length, total: +avg(groups[k].map(r => ({ total: warmOf(r) })), 'total').toFixed(5) }
if (md) {
  console.log('| turn type | n | uncached in | cache write | cache read | out | Serper cr | LLM uncached $ | LLM cached $ | memory $ | Serper $ | total $ |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const [k, s] of Object.entries(summary)) if (s.uncachedIn !== undefined) console.log(`| ${k} | ${s.n} | ${s.uncachedIn} | ${s.cacheWrite} | ${s.cacheRead} | ${s.out} | ${s.credits} | ${fmt(s.llmUncached)} | ${fmt(s.llmCached)} | ${fmt(s.memory)} | ${fmt(s.serper)} | **${fmt(s.total)}** |`)
  for (const [k, s] of Object.entries(summary)) if (s.uncachedIn === undefined) console.log(`| ${k} | ${s.n} | — | — | — | — | — | — | — | — | — | **${fmt(s.total)}** |`)
}
console.log(JSON.stringify({ label, turns: rows.length, summary, perTurn: rows.map(r => ({ turn: r.turn, kind: r.kind, cold: r.cold, total: +r.total.toFixed(4), credits: r.credits })) }, null, 1))
