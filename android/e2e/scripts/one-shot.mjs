// Open a screen on the installed uat build and screenshot it: node one-shot.mjs <outFile> <tapText> [<tapText2> ...]  (scrolls with upward swipes to find each)
import fs from 'node:fs'
import * as a from '../lib/adb.mjs'
const [out, ...taps] = process.argv.slice(2)
import { seed } from '../seed/seed-accounts.mjs'
const seeded = await seed()
await a.signIn(seeded.users.pro.email)
await a.launch()
await a.tap('Trang chủ', { after: 2500 })
for (const t of taps) {
  let n = a.find(t)
  for (let i = 0; i < 8 && !(n && n.y1 > 250 && n.y2 < 2050); i++) { a.swipe('up'); await a.sleep(800); n = a.find(t) }
  if (!n) { console.log('not found', t); process.exit(1) }
  await a.tap(n, { after: 4500 })
}
fs.writeFileSync(out, a.adb(['exec-out', 'screencap', '-p'], { binary: true }))
console.log('wrote', out)
