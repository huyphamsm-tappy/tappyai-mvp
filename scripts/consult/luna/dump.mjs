// PHIÊN LUNA — a run as a readable transcript for the hand classification (A/B/C/D).
//   node scripts/consult/luna/dump.mjs <outDir> [--only=FOOD-1,SHOP-2] [--fails]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, ...flags] = process.argv.slice(2)
const only = flags.find(f => f.startsWith('--only='))?.slice(7).split(',')
const failsOnly = flags.includes('--fails')
const res = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'))
const rows = (res.rows ?? res).filter(r => !only || only.includes(r.conv))
const strip = t => t.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS)\][\s\S]*?\[\/\1\]/g, m => `[${m.slice(1, m.indexOf(']'))} …]`).replace(/\[FOLLOWUPS\][^\n]*/g, '').trim()
let conv = ''
for (const r of rows) {
  if (failsOnly && r.pass) continue
  if (r.conv !== conv) { conv = r.conv; console.log(`\n==================== ${conv} (${r.area})`) }
  const failed = r.checks.filter(c => !c.pass && !c.info).map(c => `${c.id}${c.detail ? ` (${c.detail})` : ''}`)
  console.log(`\n--- t${r.turnIndex} ${r.server?.turnType ?? r.type} ${r.pass ? 'PASS' : 'FAIL: ' + failed.join('; ')} · tools ${r.tools.join(',') || '-'} · rows ${r.toolRows}${r.guards?.length ? ' · guards ' + r.guards.join(',') : ''}${r.patches?.length ? ' · patches ' + r.patches.join(',') : ''}`)
  console.log(`> ${r.sent}`)
  console.log(strip(r.reply))
}
