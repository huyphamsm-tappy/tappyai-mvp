// Cost report generator — reads usage-<tag>.jsonl files and prints markdown tables.
// usage: node costrep.mjs <label>=<file> [<label>=<file> …]
import { readFileSync } from 'node:fs'
const P = { input: 1.0, cacheWrite: 1.25, cacheRead: 0.10, output: 5.0 } // USD per 1M tokens, Haiku 4.5
const SERPER_USD_PER_CREDIT = 0.001
const MEMORY_EXTRACT_USD = 0.004 // estimate: separate Haiku call ≈ 3k in / 150 out (not metered)
const CHARS_PER_TOKEN = 2.1 // calibrated: shared 45 918 chars ↔ 21 327 cached tokens; tool results ≈ 2.04

const cost = r => {
  const llm = (r.promptTokens ?? 0) * P.input + (r.cacheCreationTokens ?? 0) * P.cacheWrite + (r.cacheReadTokens ?? 0) * P.cacheRead + (r.completionTokens ?? 0) * P.output
  return { llm: llm / 1e6, serper: r.serper.credits * SERPER_USD_PER_CREDIT, memory: r.memoryExtract ? MEMORY_EXTRACT_USD : 0 }
}
const fmt = n => '$' + n.toFixed(4)
const sets = process.argv.slice(2).map(a => { const [label, file] = a.split('='); return { label, rows: readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) } })

for (const { label, rows } of sets) {
  console.log(`\n### ${label} — per turn\n`)
  console.log('| turn | LLM calls | uncached in | cache write | cache read | out | hit rate | Serper calls (credits) | LLM $ | Serper $ | memory $ | total $ |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  let tot = { llm: 0, serper: 0, memory: 0 }, n = 0
  for (const r of rows) {
    const c = cost(r); tot.llm += c.llm; tot.serper += c.serper; tot.memory += c.memory; n++
    const inTot = (r.promptTokens ?? 0) + (r.cacheReadTokens ?? 0) + (r.cacheCreationTokens ?? 0)
    const hit = inTot ? ((r.cacheReadTokens ?? 0) / inTot * 100).toFixed(0) + '%' : '-'
    const s = r.serper.calls
    const calls = Object.entries(s).filter(([, v]) => v).map(([k, v]) => `${k}×${v}`).join(' ') || '-'
    console.log(`| ${r.turn} | ${r.llmCalls} | ${r.promptTokens} | ${r.cacheCreationTokens} | ${r.cacheReadTokens} | ${r.completionTokens} | ${hit} | ${calls} (${r.serper.credits}) | ${fmt(c.llm)} | ${fmt(c.serper)} | ${fmt(c.memory)} | ${fmt(c.llm + c.serper + c.memory)} |`)
  }
  const avg = { llm: tot.llm / n, serper: tot.serper / n, memory: tot.memory / n }
  console.log(`| **avg** | | | | | | | | ${fmt(avg.llm)} | ${fmt(avg.serper)} | ${fmt(avg.memory)} | **${fmt(avg.llm + avg.serper + avg.memory)}** |`)
  const toolTurns = rows.filter(r => r.toolCalls > 0), fu = rows.filter(r => r.toolCalls === 0)
  const avgOf = xs => { const t = xs.reduce((a, r) => { const c = cost(r); return a + c.llm + c.serper + c.memory }, 0); return t / Math.max(1, xs.length) }
  const warm = r => { const c = cost(r); const w = ((r.cacheCreationTokens ?? 0) * (P.cacheWrite - P.cacheRead)) / 1e6; return c.llm + c.serper + c.memory - w }
  const avgW = xs => xs.reduce((t, r) => t + warm(r), 0) / Math.max(1, xs.length)
  console.log(`\ntool turns: ${toolTurns.length}, avg ${fmt(avgOf(toolTurns))} (cache-warm ${fmt(avgW(toolTurns))}) · no-tool turns: ${fu.length}, avg ${fmt(avgOf(fu))} (cache-warm ${fmt(avgW(fu))}) · all cache-warm avg ${fmt(avgW(rows))}`)

  console.log(`\n#### ${label} — prompt sections (chars → est. tokens @ ${CHARS_PER_TOKEN} chars/token; per LLM call unless noted)\n`)
  console.log('| turn | cached prefix (tools + static rules) | dynamic system (all) | ├ consultative blocks | ├ of which V1 block | ├ memory | ├ prefs | history (prior turns) | user turn | tool results (step 2) |')
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  const tk = c => Math.round(c / CHARS_PER_TOKEN)
  for (const r of rows) {
    const s = r.sections
    console.log(`| ${r.turn} | ${r.cacheReadTokens || r.cacheCreationTokens ? Math.round((r.cacheReadTokens + r.cacheCreationTokens) / Math.max(1, r.llmCalls)) : '-'} | ${tk(s.dynamicChars)} | ${tk(s.consultativeChars)} | ${tk(s.v1Chars)} | ${tk(s.memoryChars)} | ${tk(s.prefChars)} | ${tk(s.historyChars)} | ${tk(s.lastUserChars)} | ${tk(s.toolResultChars)} |`)
  }
}

if (sets.length === 2) {
  const [a, b] = sets
  const avgTotal = rows => rows.reduce((t, r) => { const c = cost(r); return t + c.llm + c.serper + c.memory }, 0) / rows.length
  console.log(`\n### Monthly projection (avg turn cost: ${a.label} ${fmt(avgTotal(a.rows))}, ${b.label} ${fmt(avgTotal(b.rows))}; 30 days)\n`)
  console.log(`| turns/day | ${a.label} $/month | ${b.label} $/month |`)
  console.log('|---|---|---|')
  for (const d of [1000, 10000, 100000]) console.log(`| ${d.toLocaleString('en')} | $${(avgTotal(a.rows) * d * 30).toFixed(0)} | $${(avgTotal(b.rows) * d * 30).toFixed(0)} |`)
}
