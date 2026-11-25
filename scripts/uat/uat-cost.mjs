// Cost of a UAT run from the server log (17/11/2026): sums the LAST N `tappyai_turn_cost` lines (one per answered turn; the lines carry no
// time, so the run is its last N turns). Counts and dollars only: the log never carries a question or an answer.
//   node scripts/uat/uat-cost.mjs <path to uat log> <N turns of the run>
import { readFileSync } from 'node:fs'

const [, , logPath, nArg] = process.argv
const n = Number(nArg)
if (!logPath || !Number.isFinite(n) || n <= 0) { console.log('usage: node scripts/uat/uat-cost.mjs <log> <N>'); process.exit(1) }
const all = readFileSync(logPath, 'utf8').split('\n').filter(l => l.startsWith('{"type":"tappyai_turn_cost"')).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
const rows = all.slice(-n)
const sum = k => Number(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0).toFixed(4))
const sorted = rows.map(r => Number(r.usd) || 0).sort((a, b) => b - a)
console.log(JSON.stringify({
  linesInLog: all.length, turns: rows.length, totalUsd: sum('usd'), answerUsd: sum('answerUsd'), serperUsd: sum('serperUsd'), intentUsd: sum('intentUsd'),
  serperCalls: sum('serperCalls'), avgUsd: Number((sum('usd') / Math.max(1, rows.length)).toFixed(4)), top5Usd: sorted.slice(0, 5),
}))
