// Tiny manual driver over lib/adb.mjs, for one-off captures (Play listing screenshots):
//   node android/e2e/scripts/drive.mjs signin <email> | tap <text> | back | swipe up|down | texts | shot <file.png> | launch
// Several commands can be chained with `--`: drive.mjs tap Chat -- shot D:/x.png
import fs from 'node:fs'
import * as a from '../lib/adb.mjs'

const args = process.argv.slice(2)
const cmds = []
let cur = []
for (const x of args) { if (x === '--') { cmds.push(cur); cur = [] } else cur.push(x) }
if (cur.length) cmds.push(cur)

for (const [op, ...rest] of cmds) {
  const arg = rest.join(' ')
  if (op === 'signin') await a.signIn(arg)
  else if (op === 'launch') await a.launch()
  else if (op === 'tap') await a.tap(arg.startsWith('/') ? new RegExp(arg.slice(1, -1)) : arg, { after: 3000 })
  else if (op === 'tapxy') { const [x, y] = rest.map(Number); a.tapXY(x, y); await a.sleep(2500) }
  else if (op === 'back') await a.back()
  else if (op === 'swipe') { a.swipe(arg || 'up'); await a.sleep(1500) }
  else if (op === 'up') { a.sh('input', 'swipe', '540', '1300', '540', String(1300 - Number(arg || 700)), '500'); await a.sleep(1500) }
  else if (op === 'down') { a.sh('input', 'swipe', '540', '500', '540', String(500 + Number(arg || 700)), '500'); await a.sleep(1500) }
  else if (op === 'scrollto') await a.scrollTo(arg)
  else if (op === 'wait') await a.sleep(Number(arg) * 1000)
  else if (op === 'texts') console.log(a.texts().slice(0, 60).join(' | '))
  else if (op === 'shot') { fs.writeFileSync(arg, a.adb(['exec-out', 'screencap', '-p'], { binary: true })); console.log('saved', arg) }
  else throw new Error('unknown op ' + op)
}
