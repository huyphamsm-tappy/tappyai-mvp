// Prints a compact grading view of an eval run dir: id, tools, rows/shortlist, prose (markers collapsed).
import { readFileSync, readdirSync } from 'node:fs'
const dir = process.argv[2]; const ids = process.argv.slice(3)
const files = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).filter(id => ids.length === 0 || ids.includes(id))
const order = ['F1','F2','F3','F4','F5','F6','F7','F7b','F8','S1','S2','S3','S4','S5','S5b','S6','S6b','S7','S8','T1','T2','T3','T4','T5','T5b','T6','T7','T8','P1','P2','P3','P4','P5','P5b','P6','P7','P7b','P8','E1','E2','E2b','E3','E4','E5','E5b','E6','E7','E8']
for (const id of order.filter(i => files.includes(i))) {
  const r = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'))
  const prose = r.prose.replace(/\[TAPPY_SHOPPING\][\s\S]*?\[\/TAPPY_SHOPPING\]/g, '[SHOP-CARD]').replace(/\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]/g, '[PLAN]').replace(/\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]/g, '[CTA]').replace(/\[FOLLOWUPS\][^\n]*/g, '[FU]').replace(/\n{2,}/g, '\n').trim()
  const q = (prose.match(/\?/g) || []).length
  console.log(`\n### ${id} | ${r.text} | ${r.ms}ms | tools=${r.toolCalls.map(c => c.tool).join(',') || '-'} rows=${r.rows.length} sl=${r.shortlist.length} q=${q}`)
  console.log(prose.slice(0, 900))
}
